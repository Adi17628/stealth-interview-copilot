import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble'
import './ChatPanel.css'

const PRACTICE_QUESTIONS = [
  "What is an outer join in SQL?",
  "Explain optimistic vs pessimistic locking.",
  "How do you check memory usage in Linux?",
  "What is the difference between a process and a thread?",
  "Explain Python's GIL and its impact on concurrency.",
]

/**
 * ChatPanel — Parakeet AI Single-Card Focused Canvas.
 *
 * Designed specifically for live interviews:
 *   - Displays ONLY the current active question & response (zero feed stacking/clutter).
 *   - Zero auto-scroll downward: candidate sees the top of the answer instantly.
 *   - Allows seamless [Ctrl ←] / [Ctrl →] cycling through session questions in place.
 *   - Concurrent live interim hearing strip when audio is detected.
 */
export default function ChatPanel({
  qaPairs = [],
  currentTurnIndex = 0,
  onPrevTurn,
  onNextTurn,
  onClear,
  isPaused = false,
  onTogglePause,
  interimText = '',
  onAskQuestion,
  audioMode = 'system',
}) {
  const containerRef = useRef(null)

  const activeIndex = Math.min(Math.max(0, currentTurnIndex), Math.max(0, qaPairs.length - 1))
  const activePair = qaPairs[activeIndex]

  // Keep view firmly anchored at the top so candidate never has to scroll up
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0
    }
  }, [activeIndex])

  return (
    <main className="parakeet-chat-canvas" id="chat-panel" ref={containerRef}>
      {/* ── Live Concurrent Interim Hearing Strip ─────────── */}
      {interimText && (
        <div className="parakeet-interim-pill" role="status" aria-live="polite">
          <div className="interim-indicator">
            <span className="interim-wave-bar bar1" />
            <span className="interim-wave-bar bar2" />
            <span className="interim-wave-bar bar3" />
          </div>
          <span className="interim-label">
            {audioMode === 'system' ? 'Hearing interviewer:' : 'Hearing you:'}
          </span>
          <span className="interim-content">"{interimText}"</span>
        </div>
      )}

      {/* ── Empty State ───────────────────────────────────── */}
      {qaPairs.length === 0 && !interimText ? (
        <div className="parakeet-empty-state">
          <div className="empty-state-badge">
            <span className="empty-sparkle">✦</span>
            <span>STEALTH INTERVIEW COPILOT</span>
          </div>

          <h2 className="empty-state-title">Ready for Live Questions</h2>
          <p className="empty-state-desc">
            Speak into your microphone or play audio from Zoom, Google Meet, or Teams.
            Questions will be detected automatically and answered in real-time.
          </p>

          <div className="empty-practice-section">
            <span className="practice-header">Quick Practice Prompts:</span>
            <div className="practice-prompts-list">
              {PRACTICE_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="practice-prompt-pill"
                  onClick={() => onAskQuestion && onAskQuestion(q)}
                  title="Click to test live response"
                >
                  <span className="pill-bolt">⚡</span>
                  <span className="pill-text">{q}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ── Active Single Card View (No History Clutter) ──── */
        <div className="parakeet-card-view">
          {activePair && (
            <MessageBubble
              key={activePair.id || activeIndex}
              pair={activePair}
              turnIndex={activeIndex}
              totalTurns={qaPairs.length}
              onPrevTurn={onPrevTurn}
              onNextTurn={onNextTurn}
              onClear={onClear}
              isAutoAnswerOn={!isPaused}
              onToggleAutoAnswer={onTogglePause}
            />
          )}
        </div>
      )}
    </main>
  )
}
