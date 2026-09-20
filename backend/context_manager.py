"""
context_manager.py — Manages per-session conversation context.
Stores recent Q&A turns so the Gemini prompt can reference prior conversation.
"""

from dataclasses import dataclass, field
from typing import Dict, List
from config import MAX_CONTEXT_TURNS


@dataclass
class Turn:
    """A single conversation turn (question + answer)."""
    question: str
    answer: str
    source: str  # "database" or "gemini"


@dataclass
class SessionContext:
    """Stores conversation history for a single WebSocket session."""
    turns: List[Turn] = field(default_factory=list)

    def add_turn(self, question: str, answer: str, source: str):
        """Add a Q&A turn, keeping only the last N turns."""
        self.turns.append(Turn(question=question, answer=answer, source=source))
        if len(self.turns) > MAX_CONTEXT_TURNS:
            self.turns = self.turns[-MAX_CONTEXT_TURNS:]

    def build_context_string(self) -> str:
        """Build a context string for prompt injection."""
        if not self.turns:
            return ""

        lines = ["[Previous conversation context]"]
        for i, turn in enumerate(self.turns, 1):
            lines.append(f"Q{i}: {turn.question}")
            # Truncate long answers in context to save tokens
            answer_preview = turn.answer[:200] + "..." if len(turn.answer) > 200 else turn.answer
            lines.append(f"A{i}: {answer_preview}")
        lines.append("[End of context]\n")
        return "\n".join(lines)

    def clear(self):
        """Clear all conversation history."""
        self.turns.clear()


class ContextStore:
    """
    Global store mapping session IDs to their conversation contexts.
    Sessions are created on WebSocket connect, cleaned up on disconnect.
    """

    def __init__(self):
        self._sessions: Dict[str, SessionContext] = {}

    def create_session(self, session_id: str) -> SessionContext:
        """Create a new session context."""
        ctx = SessionContext()
        self._sessions[session_id] = ctx
        return ctx

    def get_session(self, session_id: str) -> SessionContext:
        """Get or create a session context."""
        if session_id not in self._sessions:
            return self.create_session(session_id)
        return self._sessions[session_id]

    def remove_session(self, session_id: str):
        """Clean up a session on disconnect."""
        self._sessions.pop(session_id, None)

    @property
    def active_sessions(self) -> int:
        return len(self._sessions)


# Global singleton
context_store = ContextStore()
