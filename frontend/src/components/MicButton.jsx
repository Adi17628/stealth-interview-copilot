import { useEffect, useRef } from 'react'
import './MicButton.css'

/**
 * MicButton — Large circular mic button with reactive glow.
 * Listens to audio amplitude and scales/glows accordingly.
 */
export default function MicButton({ isListening, onClick, analyserNode }) {
  const btnRef = useRef(null)
  const rafRef = useRef(null)

  // Reactive glow based on audio amplitude
  useEffect(() => {
    if (!isListening || !analyserNode) {
      if (btnRef.current) {
        btnRef.current.style.transform = ''
        btnRef.current.style.boxShadow = ''
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }

    const buffer = new Uint8Array(analyserNode.fftSize)
    let smoothRMS = 0

    const animate = () => {
      analyserNode.getByteTimeDomainData(buffer)
      let sum = 0
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / buffer.length)
      smoothRMS = smoothRMS * 0.75 + rms * 0.25
      const amp = Math.min(1, smoothRMS * 14)

      if (btnRef.current) {
        btnRef.current.style.transform = `scale(${1 + amp * 0.12})`
        btnRef.current.style.boxShadow = `
          0 8px ${14 + amp * 40}px rgba(244, 63, 94, ${0.12 + amp * 0.4}),
          inset 0 -4px 8px rgba(0, 0, 0, 0.15)
        `
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [isListening, analyserNode])

  return (
    <button
      ref={btnRef}
      id="mic-button"
      className={`mic-button ${isListening ? 'mic-active' : ''}`}
      onClick={onClick}
      title={isListening ? 'Stop listening' : 'Start listening'}
      aria-label={isListening ? 'Stop listening' : 'Start listening'}
    >
      <div className="mic-icon">
        {isListening ? (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
          </svg>
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" fill="currentColor"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" fill="currentColor"/>
          </svg>
        )}
      </div>
      {isListening && <div className="mic-ripple" />}
      {isListening && <div className="mic-ripple mic-ripple-delay" />}
    </button>
  )
}
