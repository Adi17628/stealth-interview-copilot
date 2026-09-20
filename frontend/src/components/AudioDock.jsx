import { useEffect, useRef } from 'react'
import './AudioDock.css'

/**
 * AudioDock — Parakeet AI Floating Stealth Audio Cockpit.
 *
 * Controls:
 *   - Audio Mode Switcher: 🎙️ My Mic | 🔊 System Audio | 🎙️+🔊 Dual Mode
 *   - Real-time Audio Waveform Visualizer
 *   - Auto Answer Pause / Resume Toggle
 *   - Telemetry Metrics Drawer Button
 */
export default function AudioDock({
  audioMode = 'system',
  onChangeAudioMode,
  isPaused = false,
  onTogglePause,
  analyserNode,
  onOpenAnalytics,
  provider = 'openai',
  onToggleProvider,
}) {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)

  // ── Waveform Visualizer Canvas ───────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    let angle = 0

    const draw = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)
      const mid = h / 2

      if (isPaused) {
        // Flat paused line
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.4)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(0, mid)
        ctx.lineTo(w, mid)
        ctx.stroke()
      } else if (analyserNode) {
        // Real microphone analyser data
        const buffer = new Uint8Array(analyserNode.fftSize)
        analyserNode.getByteTimeDomainData(buffer)
        ctx.lineWidth = 2
        ctx.strokeStyle = '#38bdf8'
        ctx.beginPath()
        const slice = w / buffer.length
        let x = 0
        for (let i = 0; i < buffer.length; i++) {
          const v = (buffer[i] - 128) / 128
          const y = mid + v * 14
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
          x += slice
        }
        ctx.stroke()
      } else {
        // System audio monitoring subtle breathing wave
        ctx.lineWidth = 1.8
        ctx.strokeStyle = audioMode === 'system' ? '#10b981' : audioMode === 'dual' ? '#818cf8' : '#38bdf8'
        ctx.beginPath()
        angle += 0.06
        for (let x = 0; x < w; x += 2) {
          const y = mid + Math.sin(x * 0.14 + angle) * 3.2 * Math.sin(x * 0.03 + angle * 0.5)
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [analyserNode, isPaused, audioMode])

  return (
    <footer className="parakeet-floating-dock" id="audio-dock">
      <div className="parakeet-dock-capsule">
        {/* ── Left: Audio Mode Selector Pills ──────────────── */}
        <div className="dock-mode-selector" role="tablist" aria-label="Audio Capture Mode">
          <button
            type="button"
            className={`dock-mode-btn ${audioMode === 'system' ? 'active' : ''}`}
            onClick={() => onChangeAudioMode && onChangeAudioMode('system')}
            title="System Audio: Automatically captures interviewer speech from Zoom, Google Meet, or Teams"
          >
            <span className="mode-icon">🔊</span>
            <span className="mode-text">System Audio</span>
          </button>

          <button
            type="button"
            className={`dock-mode-btn ${audioMode === 'mic' ? 'active' : ''}`}
            onClick={() => onChangeAudioMode && onChangeAudioMode('mic')}
            title="My Mic: Captures your physical microphone via Web Speech API for practice"
          >
            <span className="mode-icon">🎙️</span>
            <span className="mode-text">My Mic</span>
          </button>

          <button
            type="button"
            className={`dock-mode-btn ${audioMode === 'dual' ? 'active' : ''}`}
            onClick={() => onChangeAudioMode && onChangeAudioMode('dual')}
            title="Dual Mode: Simultaneously captures interviewer audio and your microphone"
          >
            <span className="mode-icon">🎙️+🔊</span>
            <span className="mode-text">Dual</span>
          </button>
        </div>

        {/* ── Middle: Waveform Visualizer & Status ─────────── */}
        <div className="dock-wave-container" title="Real-time Audio Activity Monitor">
          <canvas ref={canvasRef} className="dock-wave-canvas" />
        </div>

        {/* ── Right: Auto Answer Toggle & Telemetry ────────── */}
        <div className="dock-controls-right">
          {/* Auto Answer Toggle */}
          <button
            type="button"
            className={`dock-pill-btn auto-answer-btn ${isPaused ? 'paused' : 'active'}`}
            onClick={onTogglePause}
            title={isPaused ? 'Auto-answer paused. Click to resume.' : 'Auto-answer active. Click to pause.'}
          >
            <span className={`status-dot ${isPaused ? 'paused' : ''}`} />
            <span className="dock-btn-label">{isPaused ? 'Paused' : 'Auto Answer'}</span>
          </button>

          {/* Model Toggle Pill */}
          <button
            type="button"
            className={`dock-pill-btn model-btn ${provider}`}
            onClick={onToggleProvider}
            title={`Active Model: ${provider === 'openai' ? 'OpenAI GPT-4o-mini' : 'Gemini 2.5 Flash'}. Click to switch.`}
          >
            <span className="model-icon">{provider === 'openai' ? '⚡' : '✨'}</span>
            <span className="dock-btn-label">{provider === 'openai' ? 'GPT-4o' : 'Gemini'}</span>
          </button>

          {/* Telemetry Drawer */}
          {onOpenAnalytics && (
            <button
              type="button"
              className="dock-icon-btn analytics-btn"
              onClick={onOpenAnalytics}
              title="Open Session Telemetry & Latency Dashboard"
            >
              📊
            </button>
          )}
        </div>
      </div>
    </footer>
  )
}
