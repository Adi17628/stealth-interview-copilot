import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Normalizes any backend URL into a valid WebSocket URL.
 * Handles cases where users enter https://..., http://..., or omit /ws.
 */
function resolveWebSocketUrl(customUrl, clientId) {
  let wsUrl = ''
  const envWsUrl = (import.meta.env.VITE_WS_URL || '').trim()
  const target = customUrl || envWsUrl

  if (target) {
    let clean = target
    if (clean.startsWith('http://')) {
      clean = 'ws://' + clean.slice(7)
    } else if (clean.startsWith('https://')) {
      clean = 'wss://' + clean.slice(8)
    } else if (!clean.startsWith('ws://') && !clean.startsWith('wss://')) {
      clean = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + clean
    }

    try {
      const parsed = new URL(clean)
      if (!parsed.pathname || parsed.pathname === '/' || parsed.pathname === '') {
        parsed.pathname = '/ws'
      }
      parsed.searchParams.set('client_id', clientId)
      wsUrl = parsed.toString()
    } catch {
      const base = clean.replace(/\/+$/, '')
      const sep = base.includes('?') ? '&' : '?'
      const hasWs = base.includes('/ws')
      wsUrl = hasWs ? `${base}${sep}client_id=${clientId}` : `${base}/ws?client_id=${clientId}`
    }
  } else {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    wsUrl = `${protocol}//${host}/ws?client_id=${clientId}`
  }

  return wsUrl
}

/**
 * useWebSocket — Production-Grade WebSocket Hook with Keep-Alive & Auto-Reconnect.
 */
export default function useWebSocket({ url, onMessage, autoConnect = true } = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState(null)

  const wsRef = useRef(null)
  const onMessageRef = useRef(onMessage)
  const reconnectTimerRef = useRef(null)
  const heartbeatTimerRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const isUnmountedRef = useRef(false)
  const messageQueueRef = useRef([])
  const maxReconnectAttempts = 20

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  const getClientId = useCallback(() => {
    try {
      let id = sessionStorage.getItem('intervai_client_id')
      if (!id) {
        id = 'client-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36)
        sessionStorage.setItem('intervai_client_id', id)
      }
      return id
    } catch {
      return 'client-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36)
    }
  }, [])

  const startHeartbeat = useCallback((wsInstance) => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current)
    }
    // Ping every 20s to prevent reverse proxy (Render/Cloudflare) idle disconnects
    heartbeatTimerRef.current = setInterval(() => {
      if (wsRef.current && wsRef.current === wsInstance && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'ping' }))
        } catch (e) {
          console.warn('[useWebSocket] Heartbeat ping failed:', e)
        }
      }
    }, 20000)
  }, [])

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (isUnmountedRef.current) return

    // Clean up previous socket if existing
    if (wsRef.current) {
      try {
        wsRef.current.onclose = null
        wsRef.current.onerror = null
        wsRef.current.close(1000, 'Reconnecting')
      } catch (e) {}
      wsRef.current = null
    }
    stopHeartbeat()

    const clientId = getClientId()
    const wsUrl = resolveWebSocketUrl(url, clientId)

    try {
      console.log('[useWebSocket] Connecting to:', wsUrl)
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        if (isUnmountedRef.current) {
          ws.close()
          return
        }
        if (wsRef.current !== ws) return

        console.log('[useWebSocket] Connected successfully.')
        setIsConnected(true)
        reconnectAttemptsRef.current = 0
        startHeartbeat(ws)

        // Flush any queued messages
        while (messageQueueRef.current.length > 0 && ws.readyState === WebSocket.OPEN) {
          const queued = messageQueueRef.current.shift()
          ws.send(JSON.stringify(queued))
        }
      }

      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'pong') {
            // Heartbeat response acknowledged
            return
          }
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
        stopHeartbeat()

        if (wsRef.current === ws) {
          setIsConnected(false)
          wsRef.current = null

          if (!isUnmountedRef.current && reconnectAttemptsRef.current < maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 6000)
            console.log(`[useWebSocket] Reconnecting in ${Math.round(delay)}ms...`)
            reconnectTimerRef.current = setTimeout(() => {
              reconnectAttemptsRef.current++
              connect()
            }, delay)
          }
        }
      }

      ws.onerror = (error) => {
        console.warn('[useWebSocket] Socket error event:', error)
      }
    } catch (e) {
      console.error('[useWebSocket] Connection attempt failed:', e)
      setIsConnected(false)
    }
  }, [url, getClientId, startHeartbeat, stopHeartbeat])

  // Mount lifecycle
  useEffect(() => {
    isUnmountedRef.current = false
    if (autoConnect) {
      connect()
    }

    return () => {
      isUnmountedRef.current = true
      stopHeartbeat()
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
  }, [autoConnect, connect, stopHeartbeat])

  const sendMessage = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(data))
        return true
      } catch (e) {
        console.error('[useWebSocket] Send error:', e)
        return false
      }
    } else {
      // If socket is still connecting, queue message
      if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
        messageQueueRef.current.push(data)
        return true
      }
      // If disconnected, trigger reconnection and queue
      messageQueueRef.current.push(data)
      connect()
      return false
    }
  }, [connect])

  return {
    sendMessage,
    isConnected,
    lastMessage,
    reconnect: connect,
  }
}
