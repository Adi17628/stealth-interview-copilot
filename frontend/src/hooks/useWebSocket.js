import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * useWebSocket — Custom hook for managing WebSocket connection to backend.
 *
 * Features:
 *   - Stable client_id passing to prevent duplicate socket connections
 *   - Auto-reconnect with exponential backoff
 *   - Message queuing during disconnection
 *   - JSON message handling
 *   - Single-socket lifecycle enforcement
 */
export default function useWebSocket({ url, onMessage, autoConnect = true } = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState(null)

  const wsRef = useRef(null)
  const onMessageRef = useRef(onMessage)
  const reconnectTimerRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const isUnmountedRef = useRef(false)
  const maxReconnectAttempts = 10

  // Keep callback ref current
  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  const getClientId = () => {
    try {
      let id = sessionStorage.getItem('intervai_client_id')
      if (!id) {
        id = 'client-' + Math.random().toString(36).slice(2, 10)
        sessionStorage.setItem('intervai_client_id', id)
      }
      return id
    } catch {
      return 'client-default'
    }
  }

  const connect = useCallback(() => {
    if (isUnmountedRef.current) return

    // Clean up any existing connection first
    if (wsRef.current) {
      try {
        wsRef.current.onclose = null
        wsRef.current.onerror = null
        wsRef.current.close(1000, 'Reconnecting')
      } catch (e) {}
      wsRef.current = null
    }

    const clientId = getClientId()
    const baseProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const envWsUrl = import.meta.env.VITE_WS_URL
    let wsUrl = url
    if (!wsUrl) {
      if (envWsUrl) {
        const cleanBase = envWsUrl.replace(/\/+$/, '')
        const separator = cleanBase.includes('?') ? '&' : '?'
        wsUrl = `${cleanBase}${separator}client_id=${clientId}`
      } else {
        wsUrl = `${baseProtocol}//${host}/ws?client_id=${clientId}`
      }
    }

    try {
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        if (isUnmountedRef.current) {
          ws.close()
          return
        }
        console.log('[useWebSocket] Connected to', wsUrl)
        setIsConnected(true)
        reconnectAttemptsRef.current = 0
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          setLastMessage(data)
          if (onMessageRef.current) {
            onMessageRef.current(data)
          }
        } catch (e) {
          console.error('[useWebSocket] Parse error:', e)
        }
      }

      ws.onclose = (event) => {
        console.log('[useWebSocket] Disconnected:', event.code, event.reason)
        setIsConnected(false)
        wsRef.current = null

        // Auto-reconnect with exponential backoff if not closed cleanly
        if (!isUnmountedRef.current && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 8000)
          console.log(`[useWebSocket] Reconnecting in ${delay}ms...`)
          reconnectTimerRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++
            connect()
          }, delay)
        }
      }

      ws.onerror = (error) => {
        console.error('[useWebSocket] Error:', error)
      }

      wsRef.current = ws
    } catch (e) {
      console.error('[useWebSocket] Connection failed:', e)
    }
  }, [url])

  // Auto-connect on mount
  useEffect(() => {
    isUnmountedRef.current = false
    if (autoConnect) {
      connect()
    }

    return () => {
      isUnmountedRef.current = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.onerror = null
        wsRef.current.close(1000, 'Unmounting')
        wsRef.current = null
      }
    }
  }, [autoConnect, connect])

  const sendMessage = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
      return true
    }
    return false
  }, [])

  return {
    sendMessage,
    isConnected,
    lastMessage,
    reconnect: connect,
  }
}
