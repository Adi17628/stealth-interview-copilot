import { useEffect, useRef } from 'react'
import './Waveform.css'

/**
 * Waveform — Real-time audio visualization canvas.
 * Draws a responsive waveform from the AnalyserNode data.
 */
export default function Waveform({ analyserNode, isActive }) {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)

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

    if (!isActive || !analyserNode) {
      // Draw flat line when not active
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, h / 2)
      ctx.lineTo(w, h / 2)
      ctx.stroke()

      return () => window.removeEventListener('resize', resize)
    }

    const buffer = new Uint8Array(analyserNode.fftSize)
    let smoothRMS = 0

    const draw = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)

      analyserNode.getByteTimeDomainData(buffer)

      // Calculate RMS
      let sum = 0
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / buffer.length)
      smoothRMS = smoothRMS * 0.8 + rms * 0.2
      const isSilent = smoothRMS < 0.015

      // Background gradient
      ctx.fillStyle = 'rgba(6, 8, 16, 0.25)'
      ctx.fillRect(0, 0, w, h)

      // Draw waveform
      const slice = w / buffer.length
      const mid = h / 2
      const breath = isSilent ? Math.sin(Date.now() / 800) * 1.5 : 0

      ctx.lineWidth = isSilent ? 1.2 : (1.8 + smoothRMS * 5)
      ctx.strokeStyle = isSilent ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.8)'

      ctx.beginPath()
      let x = 0
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128
        const y = mid + v * (18 + smoothRMS * 80) + breath
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
        x += slice
      }

      if (!isSilent) {
        ctx.save()
        ctx.shadowColor = `rgba(99, 102, 241, ${0.2 + smoothRMS * 0.8})`
        ctx.shadowBlur = 8 + smoothRMS * 25
        ctx.stroke()
        ctx.restore()
      } else {
        ctx.stroke()
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [analyserNode, isActive])

  return (
    <div className={`waveform-container ${isActive ? 'active' : ''}`}>
      <canvas ref={canvasRef} className="waveform-canvas" />
    </div>
  )
}
