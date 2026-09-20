import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * useSpeechRecognition — Custom hook wrapping the Web Speech API.
 *
 * Uses the browser's built-in SpeechRecognition for zero-latency,
 * free speech-to-text with interim results.
 *
 * Returns:
 *   transcript      — final recognized text for the current utterance
 *   interimText     — partial (in-progress) recognition text
 *   isListening     — whether the mic is active
 *   isSupported     — whether the browser supports Speech API
 *   startListening  — function to start recognition
 *   stopListening   — function to stop recognition
 */
export default function useSpeechRecognition({ onFinalResult, continuous = true } = {}) {
  const [isListening, setIsListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [transcript, setTranscript] = useState('')
  const [isSupported, setIsSupported] = useState(true)

  const recognitionRef = useRef(null)
  const onFinalResultRef = useRef(onFinalResult)

  // Keep callback ref up to date
  useEffect(() => {
    onFinalResultRef.current = onFinalResult
  }, [onFinalResult])

  // Initialize SpeechRecognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setIsSupported(false)
      console.warn('[useSpeechRecognition] Web Speech API not supported in this browser')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = continuous
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      let interim = ''
      let final = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          final += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }

      setInterimText(interim)

      if (final.trim()) {
        setTranscript(final.trim())
        setInterimText('')
        if (onFinalResultRef.current) {
          onFinalResultRef.current(final.trim())
        }
      }
    }

    recognition.onerror = (event) => {
      console.error('[useSpeechRecognition] Error:', event.error)
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setIsListening(false)
      }
      // Auto-restart on non-fatal errors if still listening
      if (event.error === 'network' || event.error === 'aborted') {
        // Will be restarted by onend handler
      }
    }

    recognition.onend = () => {
      // Auto-restart if we should still be listening
      if (recognitionRef.current?._shouldListen) {
        try {
          recognition.start()
        } catch (e) {
          // Already started
        }
      } else {
        setIsListening(false)
      }
    }

    recognitionRef.current = recognition

    return () => {
      recognition.abort()
      recognitionRef.current = null
    }
  }, [continuous])

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return

    setInterimText('')
    setTranscript('')
    recognition._shouldListen = true

    try {
      recognition.start()
      setIsListening(true)
    } catch (e) {
      // If already started, that's fine
      if (e.name !== 'InvalidStateError') {
        console.error('[useSpeechRecognition] Start failed:', e)
      }
    }
  }, [])

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return

    recognition._shouldListen = false
    recognition.stop()
    setIsListening(false)
    setInterimText('')
  }, [])

  return {
    transcript,
    interimText,
    isListening,
    isSupported,
    startListening,
    stopListening,
  }
}
