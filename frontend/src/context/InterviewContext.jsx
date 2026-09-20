import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react'
import useSpeechRecognition from '../hooks/useSpeechRecognition'
import useWebSocket from '../hooks/useWebSocket'

const InterviewContext = createContext(null)

export function InterviewProvider({ children }) {
  // ── Core State ─────────────────────────────────────
  const [messages, setMessages] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [analyserNode, setAnalyserNode] = useState(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [fontSize, setFontSize] = useState('md')
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false)
  const [sessionSeconds, setSessionSeconds] = useState(0)
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0)

  // Audio Mode & LLM Provider states
  const [audioMode, setAudioMode] = useState('system')  // 'system' | 'mic' | 'dual'
  const [isPaused, setIsPaused] = useState(false)
  
  // Persistent Provider: defaults to 'openai', strictly respects user selection
  const [provider, setProvider] = useState(() => {
    return localStorage.getItem('intervai_provider') || 'openai'
  })
  
  const [systemInterimText, setSystemInterimText] = useState('')

  const audioCtxRef = useRef(null)
  const micStreamRef = useRef(null)
  const lastQuestionRef = useRef({ text: '', time: 0 })
  const isProcessingRef = useRef(false)

  // Keep isProcessingRef in sync
  useEffect(() => {
    isProcessingRef.current = isProcessing
  }, [isProcessing])

  // ── Session Timer ──────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      setSessionSeconds(prev => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const sessionTime = `${String(Math.floor(sessionSeconds / 60)).padStart(2, '0')}:${String(sessionSeconds % 60).padStart(2, '0')}`

  // ── Teleprompter Font Scaler ───────────────────────
  useEffect(() => {
    document.body.classList.remove('font-scale-sm', 'font-scale-md', 'font-scale-lg')
    document.body.classList.add(`font-scale-${fontSize}`)
  }, [fontSize])

  const handleCycleFontSize = () => {
    setFontSize(prev => (prev === 'sm' ? 'md' : prev === 'md' ? 'lg' : 'sm'))
  }

  const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const formatTime = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  // ── WebSocket Message Handler ──────────────────────
  const handleWsMessage = useCallback((data) => {
    switch (data.type) {
      case 'interim_transcript': {
        // Concurrent live interim transcript from system audio
        setSystemInterimText(data.text || '')
        break
      }

      case 'question': {
        // Finalized question from system audio or client
        setSystemInterimText('')
        const cleanIncoming = (data.text || '').trim().toLowerCase()
        const now = Date.now()

        // Guard against secondary question creation if assistant is already generating
        if (isProcessingRef.current) {
          console.log('[InterviewContext] Dropped secondary question while generating:', data.text)
          break
        }

        // Frontend deduplication against echo cards (within 5.5s)
        if (
          lastQuestionRef.current &&
          now - lastQuestionRef.current.time < 5500 &&
          (lastQuestionRef.current.text === cleanIncoming ||
           cleanIncoming.includes(lastQuestionRef.current.text) ||
           lastQuestionRef.current.text.includes(cleanIncoming))
        ) {
          console.log('[InterviewContext] Deduplicated echo question card:', data.text)
          break
        }
        lastQuestionRef.current = { text: cleanIncoming, time: now }

        const questionId = generateId()
        const timeStr = formatTime()
        setMessages(prev => [
          ...prev,
          {
            id: questionId,
            type: 'question',
            text: data.text,
            source: data.source || 'system_audio',
            timestamp: timeStr,
          },
        ])
        setIsProcessing(true)
        break
      }

      case 'answer_start': {
        const answerId = data.answer_id || generateId()
        setIsProcessing(false)
        setMessages(prev => [
          ...prev,
          {
            id: answerId,
            type: 'answer',
            text: '',
            source: data.source,
            isStreaming: true,
            latency: null,
            timestamp: formatTime(),
          },
        ])
        break
      }

      case 'answer_chunk': {
        const targetId = data.answer_id
        setMessages(prev => {
          const matchIdx = targetId
            ? prev.findIndex(msg => msg.id === targetId)
            : prev.findLastIndex(msg => msg.type === 'answer' && msg.isStreaming)

          if (matchIdx === -1) return prev

          const updated = [...prev]
          updated[matchIdx] = {
            ...updated[matchIdx],
            text: updated[matchIdx].text + data.text,
          }
          return updated
        })
        break
      }

      case 'answer_done': {
        const targetId = data.answer_id
        setMessages(prev => {
          const matchIdx = targetId
            ? prev.findIndex(msg => msg.id === targetId)
            : prev.findLastIndex(msg => msg.type === 'answer' && msg.isStreaming)

          if (matchIdx === -1) return prev

          const updated = [...prev]
          updated[matchIdx] = {
            ...updated[matchIdx],
            isStreaming: false,
            latency: data.latency_ms,
          }
          return updated
        })
        setIsProcessing(false)
        break
      }

      case 'system_status': {
        const saved = localStorage.getItem('intervai_provider')
        if (!saved && data.default_provider) {
          setProvider(data.default_provider)
          localStorage.setItem('intervai_provider', data.default_provider)
        }
        break
      }

      case 'error': {
        setIsProcessing(false)
        console.error('[InterviewContext] Server error:', data.message)
        break
      }

      default:
        break
    }
  }, [])

  const { sendMessage, isConnected, reconnect } = useWebSocket({
    onMessage: handleWsMessage,
  })

  const [backendUrl, setBackendUrl] = useState(() => {
    return localStorage.getItem('intervai_backend_url') || ''
  })

  const handleSaveBackendUrl = useCallback((url) => {
    const clean = (url || '').trim()
    if (clean) {
      localStorage.setItem('intervai_backend_url', clean)
      setBackendUrl(clean)
    } else {
      localStorage.removeItem('intervai_backend_url')
      setBackendUrl('')
    }
    setTimeout(() => reconnect(), 100)
  }, [reconnect])

  // ── Sync provider to backend on connect or switch ─
  useEffect(() => {
    localStorage.setItem('intervai_provider', provider)
    if (isConnected) {
      sendMessage({
        type: 'set_provider',
        provider: provider,
      })
    }
  }, [provider, isConnected, sendMessage])

  // ── Question Submission (Text or Mic) ──────────────
  const handleSubmitQuestion = useCallback((text) => {
    if (!text || !text.trim()) return
    const clean = text.trim()
    const cleanLower = clean.toLowerCase()
    const now = Date.now()

    if (isProcessingRef.current) {
      console.log('[InterviewContext] Assistant is busy generating response; please wait:', clean)
      return
    }

    // Frontend deduplication
    if (
      lastQuestionRef.current &&
      now - lastQuestionRef.current.time < 5500 &&
      (lastQuestionRef.current.text === cleanLower ||
       cleanLower.includes(lastQuestionRef.current.text) ||
       lastQuestionRef.current.text.includes(cleanLower))
    ) {
      console.log('[InterviewContext] Deduplicated client submit:', clean)
      return
    }
    lastQuestionRef.current = { text: cleanLower, time: now }

    setSystemInterimText('')
    const questionId = generateId()
    const timeStr = formatTime()
    setMessages(prev => [
      ...prev,
      {
        id: questionId,
        type: 'question',
        text: clean,
        source: 'text_input',
        timestamp: timeStr,
      },
    ])

    setIsProcessing(true)
    sendMessage({
      type: 'question',
      text: clean,
      provider: provider,
      is_final: true,
    })
  }, [sendMessage, provider])

  // ── Browser Speech Recognition (My Mic) ───────────
  const {
    interimText: micInterimText,
    isListening,
    startListening,
    stopListening,
  } = useSpeechRecognition({
    onFinalResult: handleSubmitQuestion,
  })

  // Display interim text from active source (system audio or mic)
  const activeInterimText = audioMode === 'system'
    ? systemInterimText
    : (micInterimText || systemInterimText)

  // ── Audio Mode Switcher Handler ───────────────────
  const handleChangeAudioMode = useCallback(async (newMode) => {
    setAudioMode(newMode)
    setSystemInterimText('')
    sendMessage({
      type: 'set_audio_mode',
      mode: newMode,
    })

    if (newMode === 'mic' || newMode === 'dual') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        micStreamRef.current = stream
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        audioCtxRef.current = audioCtx
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 512
        const source = audioCtx.createMediaStreamSource(stream)
        source.connect(analyser)
        setAnalyserNode(analyser)
        startListening()
      } catch (e) {
        console.warn('[InterviewContext] Mic access not granted:', e)
      }
    } else {
      stopListening()
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop())
        micStreamRef.current = null
      }
      setAnalyserNode(null)
    }
  }, [sendMessage, startListening, stopListening])

  // ── Pause / Auto-Answer Toggle ────────────────────
  const handleTogglePause = () => {
    setIsPaused(prev => {
      const next = !prev
      sendMessage({
        type: next ? 'pause_system_audio' : 'resume_system_audio',
      })
      if (next && isListening) {
        stopListening()
      } else if (!next && (audioMode === 'mic' || audioMode === 'dual')) {
        startListening()
      }
      return next
    })
  }

  // ── Provider Toggle (OpenAI ⇄ Gemini) ─────────────
  const handleToggleProvider = () => {
    const nextProvider = provider === 'openai' ? 'gemini' : 'openai'
    setProvider(nextProvider)
    localStorage.setItem('intervai_provider', nextProvider)
    sendMessage({
      type: 'set_provider',
      provider: nextProvider,
    })
  }

  const handleClearSession = () => {
    setMessages([])
    setSystemInterimText('')
    lastQuestionRef.current = { text: '', time: 0 }
    setIsProcessing(false)
    setCurrentTurnIndex(0)
  }

  // ── Structured Q&A Pairs (Parakeet AI Card Model) ──
  const qaPairs = useMemo(() => {
    const pairs = []
    let cur = null

    for (const msg of messages) {
      if (msg.type === 'question') {
        cur = {
          id: msg.id,
          questionId: msg.id,
          question: msg.text,
          source: msg.source || 'system_audio',
          timestamp: msg.timestamp || formatTime(),
          answer: '',
          answerId: null,
          isStreaming: false,
          latency: null,
          provider: provider,
        }
        pairs.push(cur)
      } else if (msg.type === 'answer') {
        if (cur) {
          cur.answer = msg.text
          cur.answerId = msg.id
          cur.isStreaming = msg.isStreaming
          cur.latency = msg.latency
          cur.provider = msg.source || cur.provider
        } else {
          pairs.push({
            id: msg.id,
            questionId: null,
            question: 'Interview Question',
            source: 'system_audio',
            timestamp: msg.timestamp || formatTime(),
            answer: msg.text,
            answerId: msg.id,
            isStreaming: msg.isStreaming,
            latency: msg.latency,
            provider: msg.source || provider,
          })
        }
      }
    }
    return pairs
  }, [messages, provider])

  // Keep current turn index at the latest item when new questions arrive
  useEffect(() => {
    if (qaPairs.length > 0) {
      setCurrentTurnIndex(qaPairs.length - 1)
    }
  }, [qaPairs.length])

  const handlePrevTurn = useCallback(() => {
    setCurrentTurnIndex(prev => Math.max(0, prev - 1))
  }, [])

  const handleNextTurn = useCallback(() => {
    setCurrentTurnIndex(prev => Math.min(qaPairs.length - 1, prev + 1))
  }, [qaPairs.length])

  // ── Global Keyboard Shortcuts (Parakeet AI) ────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl + ArrowLeft -> Previous card
      if (e.ctrlKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        handlePrevTurn()
      }
      // Ctrl + ArrowRight -> Next card
      if (e.ctrlKey && e.key === 'ArrowRight') {
        e.preventDefault()
        handleNextTurn()
      }
      // Ctrl + Backspace or Ctrl + Shift + Backspace -> Clear
      if (e.ctrlKey && e.key === 'Backspace') {
        e.preventDefault()
        handleClearSession()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handlePrevTurn, handleNextTurn])

  const questionCount = qaPairs.length

  const value = {
    messages,
    qaPairs,
    currentTurnIndex,
    setCurrentTurnIndex,
    handlePrevTurn,
    handleNextTurn,
    isProcessing,
    analyserNode,
    autoScroll,
    setAutoScroll,
    fontSize,
    handleCycleFontSize,
    isAnalyticsOpen,
    setIsAnalyticsOpen,
    sessionTime,
    audioMode,
    handleChangeAudioMode,
    isPaused,
    handleTogglePause,
    provider,
    handleToggleProvider,
    interimText: activeInterimText,
    isConnected,
    handleSubmitQuestion,
    handleClearSession,
    questionCount,
    backendUrl,
    handleSaveBackendUrl,
    reconnect,
  }

  return (
    <InterviewContext.Provider value={value}>
      {children}
    </InterviewContext.Provider>
  )
}

export function useInterview() {
  const context = useContext(InterviewContext)
  if (!context) {
    throw new Error('useInterview must be used within an InterviewProvider')
  }
  return context
}
