"""
query_engine.py — Direct Real-Time LLM Streaming Engine (OpenAI GPT-4o-mini & Gemini 2.5 Flash).

High-Performance Direct Pipeline:
  - 100% Direct LLM Generation (Database / vector retrieval completely removed).
  - Persistent keep-alive connection pool for OpenAI and Google GenAI.
  - Sub-2-second token streaming.
"""

from typing import AsyncGenerator
from google import genai
import httpx
from openai import AsyncOpenAI

from config import (
    GEMINI_API_KEY, GEMINI_MODEL, GEMINI_TEMPERATURE,
    OPENAI_API_KEY, OPENAI_MODEL, OPENAI_TEMPERATURE,
    DEFAULT_PROVIDER, MAX_RESPONSE_TOKENS, SYSTEM_PROMPT,
)

# ── Gemini client (google-genai SDK) ───────────────────
_gemini_client = None

def _get_gemini_client() -> genai.Client:
    """Lazy-init the Gemini client."""
    global _gemini_client
    if _gemini_client is None:
        if not GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY is not set. Check your .env file.")
        _gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    return _gemini_client


# ── OpenAI client (openai SDK with persistent connection pool) ────
_openai_client = None
_http_client = None

def _get_openai_client() -> AsyncOpenAI:
    """Init the AsyncOpenAI client with persistent keep-alive connection pool."""
    global _openai_client, _http_client
    if _openai_client is None:
        if not OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not set. Check your .env file.")
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(15.0, connect=5.0),
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=20, keepalive_expiry=120.0),
        )
        _openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY, http_client=_http_client)
    return _openai_client


# ── Prompt builder ─────────────────────────────────────
def build_prompt(user_query: str, context: str = "") -> str:
    """Build the full prompt with system instructions and conversation context."""
    parts = [SYSTEM_PROMPT]
    if context:
        parts.append(context)
    parts.append(f"Interviewer asks: {user_query}\n\nYour answer:")
    return "\n".join(parts)


# ── Async Gemini streaming ─────────────────────────────
async def stream_gemini_answer(
    user_query: str,
    context: str = "",
) -> AsyncGenerator[str, None]:
    """
    Async generator that streams Gemini response tokens.
    Yields text chunks as they arrive from the API.
    """
    client = _get_gemini_client()
    prompt = build_prompt(user_query, context)

    try:
        config = genai.types.GenerateContentConfig(
            temperature=GEMINI_TEMPERATURE,
            max_output_tokens=MAX_RESPONSE_TOKENS,
            thinking_config=genai.types.ThinkingConfig(thinking_budget=0),
        )
        response = client.models.generate_content_stream(
            model=GEMINI_MODEL,
            contents=prompt,
            config=config,
        )

        for chunk in response:
            if chunk.text:
                yield chunk.text

    except Exception as e:
        print(f"[query_engine] Gemini streaming error: {e}")
        if OPENAI_API_KEY:
            print("[query_engine] Auto-recovering via OpenAI streaming fallback...")
            async for chunk in stream_openai_answer(user_query, context):
                yield chunk
        else:
            yield f"⚠️ Generation error: {str(e)}"


# ── Async OpenAI streaming (gpt-4o-mini) ────────────────
async def stream_openai_answer(
    user_query: str,
    context: str = "",
) -> AsyncGenerator[str, None]:
    """
    Async generator that streams OpenAI gpt-4o-mini response tokens.
    Ultra-low latency streaming with zero thinking overhead.
    """
    client = _get_openai_client()
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
    ]
    if context:
        messages.append({"role": "system", "content": f"Prior interview context:\n{context}"})
    messages.append({"role": "user", "content": f"Interviewer asks: {user_query}"})

    try:
        response = await client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=messages,
            temperature=OPENAI_TEMPERATURE,
            max_tokens=MAX_RESPONSE_TOKENS,
            stream=True,
        )
        async for chunk in response:
            if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    except Exception as e:
        print(f"[query_engine] OpenAI streaming error: {e}")
        yield f"⚠️ OpenAI generation failed: {str(e)}"


# ── Unified LLM streaming dispatcher ──────────────────
async def stream_llm_answer(
    user_query: str,
    context: str = "",
    provider: str = None,
) -> AsyncGenerator[str, None]:
    """
    Stream response directly from the requested provider ("gemini" or "openai"),
    with automatic fallback if one key is missing.
    """
    target = (provider or DEFAULT_PROVIDER or "openai").lower()

    if target == "openai":
        if OPENAI_API_KEY:
            async for chunk in stream_openai_answer(user_query, context):
                yield chunk
            return
        elif GEMINI_API_KEY:
            print("[query_engine] OPENAI_API_KEY not configured, falling back to Gemini")
            async for chunk in stream_gemini_answer(user_query, context):
                yield chunk
            return
        else:
            yield "⚠️ Please configure OPENAI_API_KEY or GEMINI_API_KEY in backend/.env"
            return

    # Default or explicit Gemini
    if GEMINI_API_KEY:
        async for chunk in stream_gemini_answer(user_query, context):
            yield chunk
    elif OPENAI_API_KEY:
        print("[query_engine] GEMINI_API_KEY not configured, falling back to OpenAI")
        async for chunk in stream_openai_answer(user_query, context):
            yield chunk
    else:
        yield "⚠️ Please configure GEMINI_API_KEY or OPENAI_API_KEY in backend/.env"


# ── Single-shot fallback (for testing) ─────────────────
def generate_answer_sync(user_query: str, context: str = "") -> str:
    """Synchronous single-shot Gemini call (for testing/debugging)."""
    client = _get_gemini_client()
    prompt = build_prompt(user_query, context)

    try:
        config = genai.types.GenerateContentConfig(
            temperature=GEMINI_TEMPERATURE,
            max_output_tokens=300,
            thinking_config=genai.types.ThinkingConfig(thinking_budget=0),
        )
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=config,
        )
        return response.text or "⚠️ Empty response from Gemini."
    except Exception as e:
        return f"⚠️ Gemini error: {e}"


# ── Preload and pre-warm on startup ────────────────────
async def prewarm_llm():
    """Establish and warm keep-alive TLS connection to LLM providers."""
    if OPENAI_API_KEY:
        try:
            client = _get_openai_client()
            await client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=1,
            )
            print("[query_engine] OpenAI connection pre-warmed successfully.")
        except Exception as e:
            print(f"[query_engine] OpenAI pre-warm note: {e}")


def preload():
    """Pre-initialize LLM client connections at startup."""
    if OPENAI_API_KEY:
        try:
            _get_openai_client()
        except Exception:
            pass
    if GEMINI_API_KEY:
        try:
            _get_gemini_client()
        except Exception:
            pass
