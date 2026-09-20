"""
config.py — Centralized configuration for the AI Interview Assistant backend.
All environment variables and tunable parameters live here.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# ── Paths ──────────────────────────────────────────────
ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"

# Load .env from backend directory
load_dotenv(BACKEND_DIR / ".env")

# ── OpenAI LLM ─────────────────────────────────────────
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_TEMPERATURE = float(os.getenv("OPENAI_TEMPERATURE", "0.0"))

# ── Gemini LLM ─────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_TEMPERATURE = float(os.getenv("GEMINI_TEMPERATURE", "0.0"))

# Default Provider: "openai" or "gemini"
DEFAULT_PROVIDER = os.getenv("DEFAULT_PROVIDER", "openai").lower()

# Generous token ceiling to prevent truncating complex code/answers
MAX_RESPONSE_TOKENS = int(os.getenv("MAX_RESPONSE_TOKENS", "1000"))

# ── System Audio Capture & Whisper ASR ─────────────────
SYSTEM_AUDIO_ENABLED = os.getenv("SYSTEM_AUDIO_ENABLED", "true").lower() == "true"
WHISPER_MODEL_NAME = os.getenv("WHISPER_MODEL_NAME", "base.en")
WHISPER_INTERIM_MODEL = "tiny.en"

# Rich technical vocabulary prompt for 100% accurate ASR
WHISPER_INITIAL_PROMPT = (
    "Technical software engineering interview question about SQL, PostgreSQL, MySQL, NoSQL, "
    "Python, JavaScript, TypeScript, React, Docker, Kubernetes, Linux, AWS, REST API, System Design, "
    "Database indexing, B-Trees, Locks, Deadlocks, Threads, Processes, Concurrency, ACID properties, "
    "Optimistic locking, Pessimistic locking, Memory management, Garbage collection, Kafka, RabbitMQ, Microservices:"
)
AUDIO_SAMPLE_RATE = 16000
AUDIO_CHUNK_FRAMES = 2400  # 50ms blocks at native 48kHz (frequent reads prevent WASAPI buffer overrun)
AUDIO_SILENCE_THRESHOLD = float(os.getenv("AUDIO_SILENCE_THRESHOLD", "0.012"))

# 1.85s sustained silence: allows natural conversational pauses between clauses without premature splitting
AUDIO_SILENCE_DURATION = float(os.getenv("AUDIO_SILENCE_DURATION", "1.85"))
AUDIO_MIN_SPEECH_DURATION = float(os.getenv("AUDIO_MIN_SPEECH_DURATION", "1.0"))  # min seconds of speech
AUDIO_PRE_SPEECH_DURATION = float(os.getenv("AUDIO_PRE_SPEECH_DURATION", "0.45"))  # circular ring buffer pre-speech
AUDIO_INTERIM_INTERVAL = float(os.getenv("AUDIO_INTERIM_INTERVAL", "0.55"))  # seconds between live hearing passes
AUDIO_DEDUPLICATION_WINDOW = float(os.getenv("AUDIO_DEDUPLICATION_WINDOW", "6.0"))  # window to drop echo/duplicate Qs

# ── Context Management ─────────────────────────────────
MAX_CONTEXT_TURNS = int(os.getenv("MAX_CONTEXT_TURNS", "10"))

# ── Server ─────────────────────────────────────────────
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
_cors_env = os.getenv("CORS_ORIGINS", "*")
CORS_ORIGINS = [orig.strip() for orig in _cors_env.split(",") if orig.strip()]

# ── Prompt Template (Parakeet AI Stealth Interview Format) ───
SYSTEM_PROMPT = (
    "You are an expert technical candidate in a live software engineering interview.\n"
    "Your goal is to provide a crisp, high-impact response that fits completely on a single screen without scrolling.\n"
    "Format rules:\n"
    "1. First line: A clear, direct conclusion or answer sentence.\n"
    "2. Follow with 3 to 4 concise bullet points highlighting key concepts, trade-offs, or mechanisms.\n"
    "3. DO NOT output code blocks unless the interviewer explicitly asks to write, implement, or show code.\n"
    "4. Bold key technical terms for instant glanceability.\n"
    "5. Keep the total response strictly under 90 words.\n"
    "6. Absolutely no filler words, greetings, or pleasantries."
)
