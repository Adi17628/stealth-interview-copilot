import { useState } from 'react'
import './Header.css'

/**
 * Header — Parakeet AI Dual-Tier Top Control Strip.
 *
 * Tier 1: Stealth Quick Input Bar ("Enter a message...", [Ctrl Alt ↵], Send, Model Selector).
 * Tier 2: Real-time Transcription Status ("Transcription active...", Clear [Ctrl ⇧ ⌫], Expand ⤢).
 */
export default function Header({
  isConnected,
  sessionTime,
  fontSize,
  onCycleFontSize,
  onOpenAnalytics,
  questionCount = 0,
  provider = 'openai',
  onToggleProvider,
  audioMode = 'system',
  isPaused = false,
  onClearSession,
  onSubmitQuestion,
}) {
  const [inputValue, setInputValue] = useState('')

  const handleSend = (e) => {
    e?.preventDefault()
    if (!inputValue.trim()) return
    if (onSubmitQuestion) {
      onSubmitQuestion(inputValue.trim())
      setInputValue('')
    }
  }

  const handleKeyDown = (e) => {
    // Send on Ctrl + Enter or Ctrl + Alt + Enter or Plain Enter (if not Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Generate transcription status message matching Parakeet AI
  const getTranscriptionStatusText = () => {
    if (isPaused) return 'Transcription is paused.'
    if (!isConnected) return 'Disconnected from backend engine.'
    if (audioMode === 'system') return 'Transcription active: System Audio (Live Interviewer)'
    if (audioMode === 'mic') return 'Transcription active: My Mic (Web Speech Practice)'
    return 'Transcription active: Dual Mode (System Audio + My Mic)'
  }

  return (
    <div className="parakeet-top-section" id="app-header">
      {/* ── Tier 1: Floating Quick Input Strip ─────────────── */}
      <form className="parakeet-input-bar" onSubmit={handleSend}>
        <div className="parakeet-input-wrapper">
          <input
            type="text"
            className="parakeet-input-field"
            placeholder="Enter a message..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Enter interview question"
          />

          <div className="parakeet-input-actions">
            <span className="parakeet-kbd" title="Press Ctrl+Enter or Enter to submit">
              <span className="parakeet-kbd-icon">⊡</span> Ctrl Alt ↵
            </span>

            <button
              type="submit"
              className="parakeet-send-btn"
              disabled={!inputValue.trim()}
              title="Submit message to AI"
            >
              Send
            </button>

            {/* Model Provider Toggle Pill */}
            <button
              type="button"
              className={`parakeet-model-pill ${provider}`}
              onClick={onToggleProvider}
              title={`Active Model: ${provider === 'openai' ? 'OpenAI GPT-4o-mini' : 'Gemini 2.5 Flash'}. Click to switch.`}
            >
              <span className={`model-dot ${provider}`} />
              <span className="model-name">{provider === 'openai' ? 'GPT-4o-mini' : 'Gemini 2.5'}</span>
              <span className="model-switch-icon">⇄</span>
            </button>

            {inputValue && (
              <button
                type="button"
                className="parakeet-icon-btn close-btn"
                onClick={() => setInputValue('')}
                title="Clear input text"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </form>

      {/* ── Tier 2: Sub-Header Status Strip ────────────────── */}
      <div className="parakeet-substrip">
        <div className="substrip-left">
          <span className={`status-dot ${isPaused ? 'paused' : ''}`} />
          <span className="substrip-status-text">
            {getTranscriptionStatusText()}
          </span>
          <span className="substrip-timer" title="Session duration">
            {sessionTime}
          </span>
        </div>

        <div className="substrip-right">
          {/* Clear Session with Shortcut Chip */}
          <button
            type="button"
            className="substrip-action-btn"
            onClick={onClearSession}
            title="Clear conversation history (Ctrl + Backspace)"
          >
            <span>Clear</span>
            <span className="parakeet-kbd mini">Ctrl ⇧ ⌫</span>
          </button>

          {/* Teleprompter Font Scaler */}
          <button
            type="button"
            className="substrip-icon-btn font-btn"
            onClick={onCycleFontSize}
            title={`Font size: ${fontSize.toUpperCase()}. Click to cycle.`}
          >
            A<sup>{fontSize === 'sm' ? '-' : fontSize === 'lg' ? '+' : '•'}</sup>
          </button>

          {/* Full Telemetry Drawer Popout */}
          <button
            type="button"
            className="substrip-icon-btn expand-btn"
            onClick={onOpenAnalytics}
            title="Open telemetry & performance analytics"
          >
            <span className="expand-icon">⤢</span>
          </button>
        </div>
      </div>
    </div>
  )
}
