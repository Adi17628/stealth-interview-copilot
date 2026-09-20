import { useState } from 'react'
import FormattedAnswer from './FormattedAnswer'
import './MessageBubble.css'

/**
 * MessageBubble — Parakeet AI Question & Answer Card.
 *
 * Implements the signature layout from the Parakeet AI reference screenshot:
 *   - Card Top Controls: [Ctrl ←] [Ctrl →], Turn index, • Auto Answer On, Clear [Ctrl ⌫], Expand ⤢, Copy ⧉
 *   - Question Section: 💬 Question: <text>
 *   - Answer Section: ⭐ Answer: <overview + bullet points>
 *   - Footer Metadata: [Source] · [Time] · [Latency]  |  👍 👎 📋
 */
export default function MessageBubble({
  pair,
  turnIndex = 0,
  totalTurns = 1,
  onPrevTurn,
  onNextTurn,
  onClear,
  isAutoAnswerOn = true,
  onToggleAutoAnswer,
}) {
  const [copiedFull, setCopiedFull] = useState(false)
  const [copiedAnswer, setCopiedAnswer] = useState(false)
  const [feedback, setFeedback] = useState(null) // 'up' | 'down' | null
  const [isExpanded, setIsExpanded] = useState(false)

  if (!pair) return null

  const {
    question = '',
    source = 'system_audio',
    timestamp = '',
    answer = '',
    isStreaming = false,
    latency = null,
    provider = 'openai',
  } = pair

  // Copy complete Q&A card
  const handleCopyFull = () => {
    const fullText = `Question: ${question}\n\nAnswer:\n${answer}`
    navigator.clipboard.writeText(fullText).then(() => {
      setCopiedFull(true)
      setTimeout(() => setCopiedFull(false), 2000)
    })
  }

  // Copy just the answer
  const handleCopyAnswer = () => {
    if (!answer) return
    navigator.clipboard.writeText(answer).then(() => {
      setCopiedAnswer(true)
      setTimeout(() => setCopiedAnswer(false), 2000)
    })
  }

  // Human-readable source label
  const getSourceLabel = () => {
    if (source === 'system_audio') return '🔊 System Audio'
    if (source === 'mic') return '🎙️ My Mic'
    return '💬 Direct Query'
  }

  return (
    <div className={`parakeet-qa-card ${isExpanded ? 'expanded' : ''}`} id={`turn-${turnIndex}`}>
      {/* ── Card Top Navigation & Controls Bar ────────────── */}
      <div className="parakeet-card-topbar">
        <div className="card-topbar-left">
          {totalTurns > 1 ? (
            <div className="card-nav-group">
              <button
                type="button"
                className="parakeet-nav-btn"
                onClick={onPrevTurn}
                disabled={turnIndex <= 0}
                title="Previous Question (Ctrl + ←)"
              >
                <span className="parakeet-kbd">Ctrl ←</span>
              </button>
              <button
                type="button"
                className="parakeet-nav-btn"
                onClick={onNextTurn}
                disabled={turnIndex >= totalTurns - 1}
                title="Next Question (Ctrl + →)"
              >
                <span className="parakeet-kbd">Ctrl →</span>
              </button>
              <span className="turn-counter">
                {turnIndex + 1} / {totalTurns}
              </span>
            </div>
          ) : (
            <div className="card-nav-single">
              <span className="parakeet-kbd">Ctrl ←</span>
              <span className="parakeet-kbd">Ctrl →</span>
            </div>
          )}
        </div>

        <div className="card-topbar-right">
          {/* Auto Answer Toggle Pill */}
          <button
            type="button"
            className={`parakeet-auto-pill ${isAutoAnswerOn ? 'active' : 'paused'}`}
            onClick={onToggleAutoAnswer}
            title={isAutoAnswerOn ? 'Auto Answer is ON. Click to pause.' : 'Auto Answer is PAUSED. Click to resume.'}
          >
            <span className={`status-dot ${isAutoAnswerOn ? '' : 'paused'}`} />
            <span>{isAutoAnswerOn ? 'Auto Answer On' : 'Auto Answer Off'}</span>
          </button>

          {/* Clear Button */}
          <button
            type="button"
            className="parakeet-card-action-btn"
            onClick={onClear}
            title="Clear this question (Ctrl + Backspace)"
          >
            <span>Clear</span>
            <span className="parakeet-kbd mini">Ctrl ⌫</span>
          </button>

          {/* Expand Toggle */}
          <button
            type="button"
            className={`parakeet-card-icon-btn ${isExpanded ? 'active' : ''}`}
            onClick={() => setIsExpanded(prev => !prev)}
            title={isExpanded ? 'Collapse card' : 'Expand full view'}
          >
            ⤢
          </button>

          {/* Copy Full Card Button */}
          <button
            type="button"
            className="parakeet-card-icon-btn copy-full-btn"
            onClick={handleCopyFull}
            title="Copy question and answer"
          >
            {copiedFull ? '✓' : '⧉'}
          </button>
        </div>
      </div>

      {/* ── Question Header Section ───────────────────────── */}
      <div className="parakeet-question-section">
        <div className="question-content">
          <span className="question-prefix">
            <span className="speech-icon">💬</span>
            <strong>Question:</strong>
          </span>
          <span className="question-text">{question}</span>
        </div>
      </div>

      {/* ── Answer Section ─────────────────────────────────── */}
      <div className="parakeet-answer-section">
        <div className="answer-header">
          <span className="star-icon">⭐</span>
          <span className="answer-title">Answer:</span>
        </div>

        <div className="answer-body">
          {answer ? (
            <FormattedAnswer content={answer} isStreaming={isStreaming} />
          ) : (
            <div className="answer-generating-state">
              <span className="generating-pulse-dot" />
              <span className="generating-text">
                Generating answer via {provider === 'openai' ? 'OpenAI GPT-4o-mini' : 'Gemini 2.5 Flash'}...
              </span>
            </div>
          )}
          {isStreaming && <span className="streaming-cursor" aria-hidden="true" />}
        </div>
      </div>

      {/* ── Card Footer Metadata Bar ──────────────────────── */}
      <div className="parakeet-card-footer">
        <div className="footer-left-metadata">
          <span className="meta-source">{getSourceLabel()}</span>
          <span className="meta-sep">·</span>
          <span className="meta-time">{timestamp || 'Just now'}</span>
          {latency && (
            <>
              <span className="meta-sep">·</span>
              <span className="meta-latency" title={`Latency: ${latency}ms`}>
                ⚡ {latency < 1000 ? `${latency}ms` : `${(latency / 1000).toFixed(2)}s`}
              </span>
            </>
          )}
          <span className="meta-sep">·</span>
          <span className="meta-model-tag">
            {provider === 'openai' ? 'GPT-4o-mini' : 'Gemini 2.5 Flash'}
          </span>
        </div>

        <div className="footer-right-actions">
          <button
            type="button"
            className={`feedback-btn ${feedback === 'up' ? 'active' : ''}`}
            onClick={() => setFeedback(prev => prev === 'up' ? null : 'up')}
            title="Helpful response"
          >
            👍
          </button>
          <button
            type="button"
            className={`feedback-btn ${feedback === 'down' ? 'active' : ''}`}
            onClick={() => setFeedback(prev => prev === 'down' ? null : 'down')}
            title="Needs improvement"
          >
            👎
          </button>
          <button
            type="button"
            className="copy-answer-btn"
            onClick={handleCopyAnswer}
            title="Copy answer only"
          >
            {copiedAnswer ? '✓' : '📋'}
          </button>
        </div>
      </div>
    </div>
  )
}
