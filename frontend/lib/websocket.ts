'use client'

import { Client, type Frame, type IMessage } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import type { Packet, WsState } from '@/types'

const TOPIC     = '/topic/packets'
const RETRY_MS  = 4_000

export interface WsCallbacks {
  onBatch:       (packets: Packet[]) => void
  onStateChange: (state: WsState, retryCount: number) => void
}

export interface WsManager {
  connect:    () => void
  disconnect: () => void
}

// ── Field normalisation ───────────────────────────────────────────────────────
// WsPacketSummary uses capturedAtMs (long epoch millis).
// We unify it to capturedAt so the rest of the UI uses one field.
function normalise(raw: Record<string, unknown>): Packet {
  if (raw.capturedAtMs !== undefined && raw.capturedAt === undefined) {
    raw.capturedAt = raw.capturedAtMs
  }
  return raw as unknown as Packet
}

export function createWsManager(callbacks: WsCallbacks): WsManager {
  let client:     Client | null = null
  let retryCount  = 0
  let active      = true
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  function setState(state: WsState) {
    console.log(`[WS] ${state} (retries: ${retryCount})`)
    callbacks.onStateChange(state, retryCount)
  }

  function connect() {
    if (!active) return
    setState('CONNECTING')

    client = new Client({
      // SockJS factory — relative URL works behind Next.js proxy
      webSocketFactory: () => new SockJS('/ws') as WebSocket,

      // STOMP heartbeats: client sends every 10s, backend may send every 10s
      heartbeatIncoming: 10_000,
      heartbeatOutgoing: 10_000,

      // Suppress STOMP debug frame logging
      debug: () => {},

      onConnect: (_frame: Frame) => {
        retryCount = 0
        setState('CONNECTED')

        client!.subscribe(TOPIC, (msg: IMessage) => {
          try {
            const parsed = JSON.parse(msg.body)
            // Backend sends List<WsPacketSummary> as JSON array.
            // Guard against legacy single-object format.
            const raw: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : [parsed]
            const batch = raw.map(normalise)
            if (batch.length > 0) callbacks.onBatch(batch)
          } catch (e) {
            console.warn('[WS] Failed to parse message', e)
          }
        })
      },

      onStompError: (frame: Frame) => {
        console.warn('[WS] STOMP error', frame)
        scheduleReconnect()
      },

      onDisconnect: () => {
        if (active) scheduleReconnect()
      },

      onWebSocketClose: () => {
        if (active) {
          console.warn('[WS] WebSocket closed')
          scheduleReconnect()
        }
      },
    })

    client.activate()
  }

  function scheduleReconnect() {
    if (!active || retryTimer) return
    setState('DISCONNECTED')
    retryCount++
    console.log(`[WS] Retry #${retryCount} in ${RETRY_MS / 1000}s`)
    retryTimer = setTimeout(() => {
      retryTimer = null
      connect()
    }, RETRY_MS)
  }

  function disconnect() {
    active = false
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
    if (client) {
      try { client.deactivate() } catch { /* ignore */ }
      client = null
    }
  }

  return { connect, disconnect }
}
