import './AnalyticsDrawer.css'

/**
 * AnalyticsDrawer — Slide-over intelligence panel showing real-time session telemetry.
 */
export default function AnalyticsDrawer({
  isOpen,
  onClose,
  messages,
  sessionTime,
  onClearSession,
}) {
  if (!isOpen) return null

  // Calculate telemetry metrics
  const questions = messages.filter(m => m.type === 'question')
  const answers = messages.filter(m => m.type === 'answer')
  const openaiAnswers = answers.filter(a => a.source === 'openai')
  const geminiAnswers = answers.filter(a => a.source === 'gemini')

  const latencies = answers.filter(a => a.latency != null).map(a => a.latency)
  const avgLatency = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null

  const fastestLatency = latencies.length > 0 ? Math.min(...latencies) : null
  const openaiPct = answers.length > 0
    ? Math.round((openaiAnswers.length / answers.length) * 100)
    : 50

  return (
    <div className="analytics-drawer-overlay" onClick={onClose}>
      <div className="analytics-drawer glass-card" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-title-area">
            <span className="drawer-icon">📊</span>
            <div>
              <h3 className="drawer-title">Session Intelligence</h3>
              <p className="drawer-subtitle">Real-time interview telemetry & AI speed metrics</p>
            </div>
          </div>
          <button type="button" className="drawer-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="drawer-body">
          {/* KPI Grid */}
          <div className="telemetry-grid">
            <div className="telemetry-card">
              <span className="telemetry-label">Session Time</span>
              <span className="telemetry-val text-gradient">{sessionTime}</span>
              <span className="telemetry-hint">Active live copilot</span>
            </div>

            <div className="telemetry-card">
              <span className="telemetry-label">Questions Handled</span>
              <span className="telemetry-val">{questions.length}</span>
              <span className="telemetry-hint">{answers.length} answered</span>
            </div>

            <div className="telemetry-card">
              <span className="telemetry-label">LLM Direct Stream</span>
              <span className="telemetry-val text-gradient-emerald">100%</span>
              <span className="telemetry-hint">{openaiAnswers.length} OpenAI / {geminiAnswers.length} Gemini</span>
            </div>

            <div className="telemetry-card">
              <span className="telemetry-label">Avg Response Speed</span>
              <span className="telemetry-val">
                {avgLatency != null ? `${avgLatency}ms` : '—'}
              </span>
              <span className="telemetry-hint">
                {fastestLatency != null ? `Fastest: ${fastestLatency}ms` : 'Sub-2s target'}
              </span>
            </div>
          </div>

          {/* Architecture Breakdown */}
          <div className="drawer-section">
            <h4 className="section-title">AI Provider Model Breakdown</h4>
            <div className="pipeline-bar-wrapper">
              <div className="pipeline-bar">
                <div
                  className="bar-segment db"
                  style={{ width: `${openaiPct}%` }}
                  title={`OpenAI GPT-4o-mini: ${openaiAnswers.length}`}
                />
                <div
                  className="bar-segment gemini"
                  style={{ width: `${100 - openaiPct}%` }}
                  title={`Gemini 2.5 Flash: ${geminiAnswers.length}`}
                />
              </div>
              <div className="pipeline-legend">
                <span className="legend-item">
                  <span className="legend-dot db" />
                  <span>OpenAI GPT-4o-mini ({openaiAnswers.length})</span>
                </span>
                <span className="legend-item">
                  <span className="legend-dot gemini" />
                  <span>Gemini 2.5 Flash ({geminiAnswers.length})</span>
                </span>
              </div>
            </div>
          </div>

          {/* Interview Delivery Tips */}
          <div className="drawer-section">
            <h4 className="section-title">Candidate Speaking Best Practices</h4>
            <div className="tips-list">
              <div className="tip-card">
                <span className="tip-num">1</span>
                <div>
                  <strong>Glance at Key Talking Points first:</strong>
                  <p>Read the top 2-3 bullets to start answering in 3 seconds naturally without awkward pauses.</p>
                </div>
              </div>
              <div className="tip-card">
                <span className="tip-num">2</span>
                <div>
                  <strong>Structure with Direct Technical Formula:</strong>
                  <p>Direct conclusion first → architectural justification → brief edge case or tradeoffs.</p>
                </div>
              </div>
              <div className="tip-card">
                <span className="tip-num">3</span>
                <div>
                  <strong>Keep Answers Under 90 Seconds:</strong>
                  <p>Let the interviewer follow up. Avoid monologue fatigue.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="drawer-actions">
            <button
              type="button"
              className="clear-session-btn"
              onClick={() => {
                if (window.confirm('Clear all conversation history in this session?')) {
                  onClearSession()
                  onClose()
                }
              }}
            >
              🗑️ Clear Conversation History
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
