import './StatusBar.css'

/**
 * StatusBar — Shows current listening/processing state and interim transcript.
 *
 * Props:
 *   isListening   — mic is active
 *   interimText   — partial speech recognition text
 *   isProcessing  — waiting for backend response
 */
export default function StatusBar({ isListening, interimText, isProcessing }) {
  if (!isListening && !isProcessing && !interimText) {
    return (
      <div className="status-bar" id="status-bar">
        <span className="status-hint">Press the microphone to start</span>
      </div>
    )
  }

  return (
    <div className={`status-bar ${isListening ? 'listening' : ''} ${isProcessing ? 'processing' : ''}`} id="status-bar">
      {isListening && (
        <div className="status-listening">
          <span className="listening-dot" />
          <span className="listening-label">Listening</span>
        </div>
      )}

      {isProcessing && (
        <div className="status-processing">
          <div className="processing-spinner" />
          <span className="processing-label">Generating response...</span>
        </div>
      )}

      {interimText && (
        <div className="status-interim">
          <span className="interim-label">Hearing:</span>
          <span className="interim-text">{interimText}</span>
        </div>
      )}
    </div>
  )
}
