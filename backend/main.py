"""
main.py — FastAPI application entry point.

Provides:
  - WebSocket endpoint (/ws) with client session de-duplication
  - High-precision question deduplication cache & trailing fragment filter
  - In-progress answer generation lock to guarantee exactly ONE answer per question
  - Strict model provider synchronization (OpenAI gpt-4o-mini & Gemini 2.5 Flash)
  - Native Windows WASAPI system audio loopback capture with live concurrent hearing
  - Unique UUID answer_id routing for rock-solid chunk dispatch
  - Health check endpoint (/health)
"""

import warnings
warnings.filterwarnings("ignore", message=".*data discontinuity in recording.*")
try:
    import soundcard as sc
    warnings.filterwarnings("ignore", category=sc.SoundcardRuntimeWarning)
except Exception:
    pass

import json
import uuid
import time
import asyncio
import threading
from typing import Dict, Set, List, Tuple
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import (
    CORS_ORIGINS, HOST, PORT, DEFAULT_PROVIDER, SYSTEM_AUDIO_ENABLED,
    AUDIO_DEDUPLICATION_WINDOW
)
from query_engine import stream_llm_answer, preload, prewarm_llm
from context_manager import context_store

# System Audio (Optional on Cloud Deployments like Render)
system_audio_service = None
get_whisper_model = None
get_interim_model = None

if SYSTEM_AUDIO_ENABLED:
    try:
        from system_audio import system_audio_service, get_whisper_model, get_interim_model
    except Exception as e:
        print(f"[main] System audio capture unavailable: {e}")
        SYSTEM_AUDIO_ENABLED = False

# Active WebSocket connections and session tracking
_active_websockets: Set[WebSocket] = set()
_client_websockets: Dict[str, WebSocket] = {}
_websocket_providers: Dict[WebSocket, str] = {}
_websocket_modes: Dict[WebSocket, str] = {}  # "system", "mic", "dual"
_event_loop: asyncio.AbstractEventLoop = None

# Global question deduplication cache (timestamp, text)
_recent_questions: List[Tuple[float, str]] = []
_dedup_lock = threading.Lock()


def is_duplicate_question(text: str) -> bool:
    """
    Check if this question (or an echo/fragment of it) was processed within the deduplication window.
    Filters out echoes between Web Speech & Loopback, as well as short trailing fragments.
    """
    now = time.time()
    cleaned = text.lower().strip()
    words_incoming = cleaned.split()
    if not words_incoming:
        return True

    with _dedup_lock:
        # Evict entries older than window (6.0s)
        _recent_questions[:] = [(t, q) for t, q in _recent_questions if now - t < AUDIO_DEDUPLICATION_WINDOW]

        # Guard: If any question was processed in the last 4.5 seconds and incoming is a short fragment (<= 7 words), drop it
        if _recent_questions and len(words_incoming) <= 7:
            last_t, last_q = _recent_questions[-1]
            if now - last_t < 4.5:
                print(f"[dedup] Dropped short trailing fragment within 4.5s: '{text}'")
                return True

        words_set = set(words_incoming)
        for t, prev_q in _recent_questions:
            prev_words = set(prev_q.lower().split())
            intersection = words_set.intersection(prev_words)
            smaller_len = min(len(words_set), len(prev_words))
            if smaller_len > 0:
                overlap_ratio = len(intersection) / smaller_len
                # If >= 45% overlap or one is a substring of the other
                if overlap_ratio >= 0.45 or cleaned in prev_q.lower() or prev_q.lower() in cleaned:
                    print(f"[dedup] Dropped duplicate question within {now - t:.2f}s: '{text}' (matches '{prev_q}')")
                    return True

        # Record new question
        _recent_questions.append((now, text))
        return False


async def process_and_send_answer(websocket: WebSocket, text: str, ctx, provider: str = None):
    """
    Directly stream answer from requested LLM provider (OpenAI GPT-4o-mini or Gemini 2.5 Flash).
    Uses a unique answer_id to ensure chunks strictly route to their specific message card.
    Guarantees exactly ONE generation via _is_generating lock.
    """
    websocket._is_generating = True
    t_start = time.perf_counter()
    selected_provider = (provider or _websocket_providers.get(websocket, DEFAULT_PROVIDER)).lower()
    answer_id = f"ans-{uuid.uuid4().hex[:8]}"

    try:
        await websocket.send_json({
            "type": "answer_start",
            "answer_id": answer_id,
            "source": selected_provider,
        })

        full_answer = []
        context_str = ctx.build_context_string()

        async for chunk in stream_llm_answer(text, context_str, provider=selected_provider):
            full_answer.append(chunk)
            await websocket.send_json({
                "type": "answer_chunk",
                "answer_id": answer_id,
                "text": chunk,
            })

        latency_ms = round((time.perf_counter() - t_start) * 1000)
        await websocket.send_json({
            "type": "answer_done",
            "answer_id": answer_id,
            "latency_ms": latency_ms,
        })
        answer_text = "".join(full_answer)
        ctx.add_turn(text, answer_text, source=selected_provider)
        print(f"[ws] {selected_provider} stream ({latency_ms}ms): {len(answer_text)} chars")

    except Exception as e:
        print(f"[ws] Error processing answer: {e}")
        try:
            await websocket.send_json({
                "type": "answer_chunk",
                "answer_id": answer_id,
                "text": f"⚠️ Generation issue: {str(e)}",
            })
            await websocket.send_json({
                "type": "answer_done",
                "answer_id": answer_id,
                "latency_ms": round((time.perf_counter() - t_start) * 1000),
            })
        except Exception:
            pass
    finally:
        websocket._is_generating = False


async def broadcast_interim_text(text: str):
    """Broadcast concurrent live interim transcript while interviewer is speaking."""
    for ws in list(_active_websockets):
        mode = _websocket_modes.get(ws, "system")
        if mode in ("system", "dual"):
            try:
                await ws.send_json({
                    "type": "interim_transcript",
                    "text": text,
                    "source": "system_audio",
                })
            except Exception:
                pass


async def broadcast_system_question(text: str):
    """Broadcast finalized interviewer question and begin answer generation."""
    if is_duplicate_question(text):
        return

    print(f"[main] Broadcasting system audio question: {text}")
    for ws in list(_active_websockets):
        mode = _websocket_modes.get(ws, "system")
        if mode in ("system", "dual"):
            # If this socket is already generating an answer, lock out secondary triggers
            if getattr(ws, "_is_generating", False):
                print(f"[main] Session already generating an answer; dropping secondary trigger: '{text}'")
                continue

            try:
                provider = _websocket_providers.get(ws, DEFAULT_PROVIDER)
                # 1. Clear interim text & emit question card event
                await ws.send_json({
                    "type": "question",
                    "text": text,
                    "source": "system_audio",
                    "provider": provider,
                })
                # 2. Retrieve & stream answer
                ctx = getattr(ws, "_ctx", None)
                if ctx:
                    await process_and_send_answer(ws, text, ctx, provider=provider)
            except Exception as e:
                print(f"[main] Error broadcasting question to client: {e}")


def on_system_interim(text: str):
    """Callback for concurrent live interim words from interviewer."""
    if _event_loop and _event_loop.is_running() and _active_websockets:
        asyncio.run_coroutine_threadsafe(broadcast_interim_text(text), _event_loop)


def on_system_question(text: str):
    """Callback for finalized interviewer question."""
    if _event_loop and _event_loop.is_running() and _active_websockets:
        asyncio.run_coroutine_threadsafe(broadcast_system_question(text), _event_loop)


# ── Lifespan: pre-load models and pre-warm connections ─
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _event_loop
    _event_loop = asyncio.get_running_loop()

    print("[main] Pre-warming LLM connections...")
    preload()

    # Pre-warm TLS connections in background
    asyncio.create_task(prewarm_llm())

    if SYSTEM_AUDIO_ENABLED and system_audio_service:
        try:
            if get_whisper_model: get_whisper_model()
            if get_interim_model: get_interim_model()
            system_audio_service.on_question = on_system_question
            system_audio_service.on_interim = on_system_interim
            system_audio_service.start()
            print("[main] System audio capture auto-started with live hearing.")
        except Exception as e:
            print(f"[main] Failed to start system audio: {e}")

    print("[main] Ready to accept connections.")
    yield

    print("[main] Shutting down...")
    if system_audio_service:
        system_audio_service.stop()


# ── FastAPI app ────────────────────────────────────────
app = FastAPI(
    title="AI Interview Assistant",
    description="Real-time interview coaching with sub-2-second response times",
    version="2.4.0",
    lifespan=lifespan,
)

# CORS
if "*" in CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


# ── Health Check ───────────────────────────────────────
@app.get("/health")
async def health():
    return JSONResponse({
        "status": "ok",
        "active_sessions": context_store.active_sessions,
        "system_audio_active": bool(system_audio_service and system_audio_service.running and not system_audio_service.paused),
        "default_provider": DEFAULT_PROVIDER,
    })


# ── WebSocket Handler ─────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    # Deduplicate connections from the same browser client
    client_id = websocket.query_params.get("client_id")
    if client_id and client_id in _client_websockets:
        old_ws = _client_websockets[client_id]
        if old_ws and old_ws != websocket and old_ws in _active_websockets:
            print(f"[ws] Closing stale socket for client_id: {client_id}")
            _active_websockets.discard(old_ws)
            _websocket_providers.pop(old_ws, None)
            _websocket_modes.pop(old_ws, None)
            try:
                await old_ws.close(code=1000, reason="Replaced by new connection")
            except Exception:
                pass

    if client_id:
        _client_websockets[client_id] = websocket

    session_id = str(uuid.uuid4())
    ctx = context_store.create_session(session_id)
    websocket._ctx = ctx
    websocket._is_generating = False

    _active_websockets.add(websocket)
    _websocket_providers[websocket] = DEFAULT_PROVIDER
    _websocket_modes[websocket] = "system"  # Default on load: system audio

    print(f"[ws] Session {session_id[:8]} connected (client: {client_id or 'anon'}, default: {DEFAULT_PROVIDER})")

    # Send initial status
    await websocket.send_json({
        "type": "system_status",
        "system_audio_active": bool(system_audio_service and system_audio_service.running and not system_audio_service.paused),
        "default_provider": DEFAULT_PROVIDER,
        "audio_mode": "system" if system_audio_service else "mic",
    })

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = msg.get("type")

            # ── Handle Keep-Alive Heartbeat ────────────
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            # ── Handle Provider Switch ─────────────────
            if msg_type == "set_provider":
                new_provider = (msg.get("provider") or DEFAULT_PROVIDER).lower()
                _websocket_providers[websocket] = new_provider
                print(f"[ws] Session {session_id[:8]} explicitly set provider to: {new_provider}")
                await websocket.send_json({
                    "type": "provider_changed",
                    "provider": new_provider,
                })
                continue

            # ── Handle Audio Mode Switch ───────────────
            if msg_type == "set_audio_mode":
                new_mode = (msg.get("mode") or "system").lower()
                _websocket_modes[websocket] = new_mode
                if system_audio_service:
                    if new_mode == "mic":
                        system_audio_service.pause()
                    else:
                        system_audio_service.resume()
                print(f"[ws] Session {session_id[:8]} set audio mode to: {new_mode}")
                await websocket.send_json({
                    "type": "audio_mode_changed",
                    "mode": new_mode,
                })
                continue

            # ── Handle Pause/Resume ────────────────────
            if msg_type == "pause_system_audio":
                if system_audio_service:
                    system_audio_service.pause()
                continue
            if msg_type == "resume_system_audio":
                if system_audio_service:
                    system_audio_service.resume()
                continue

            # ── Handle Question (Voice or Text) ────────
            if msg_type == "question":
                text = (msg.get("text") or "").strip()
                if not text:
                    continue

                if getattr(websocket, "_is_generating", False):
                    print(f"[ws] Dropped question because session is already generating: '{text[:60]}'")
                    continue

                if is_duplicate_question(text):
                    continue

                provider = msg.get("provider") or _websocket_providers.get(websocket, DEFAULT_PROVIDER)
                _websocket_providers[websocket] = provider.lower()
                print(f"[ws] Session {session_id[:8]} user question: {text[:80]}... (using {provider})")
                await process_and_send_answer(websocket, text, ctx, provider=provider)

    except WebSocketDisconnect:
        print(f"[ws] Session {session_id[:8]} disconnected")
    except Exception as e:
        print(f"[ws] Session {session_id[:8]} error: {e}")
    finally:
        _active_websockets.discard(websocket)
        _websocket_providers.pop(websocket, None)
        _websocket_modes.pop(websocket, None)
        if client_id and _client_websockets.get(client_id) == websocket:
            _client_websockets.pop(client_id, None)
        context_store.remove_session(session_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=False)
