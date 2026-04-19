'use client'

import { useEffect, useRef } from 'react'
import { createWsManager } from '@/lib/websocket'
import { useStore } from '@/store'
import type { Packet } from '@/types'

export function useWebSocket() {
  const addBatch     = useStore((s) => s.addBatch)
  const setWsState   = useStore((s) => s.setWsState)
  const addToast     = useStore((s) => s.addToast)
  const wsStateRef   = useRef(useStore.getState().wsState)
  const managerRef   = useRef<ReturnType<typeof createWsManager> | null>(null)

  useEffect(() => {
    // One manager per mount; cleaned up on unmount (page nav or HMR)
    const manager = createWsManager({
      onBatch: (batch: Packet[]) => addBatch(batch),
      onStateChange: (state, retry) => {
        const prev = wsStateRef.current
        wsStateRef.current = state
        setWsState(state, retry)

        if (state === 'CONNECTED'    && retry > 0) addToast('WebSocket reconnected', 'success')
        if (state === 'DISCONNECTED' && prev !== 'CONNECTING') addToast('WebSocket disconnected — retrying…', 'error')
      },
    })

    managerRef.current = manager
    manager.connect()

    return () => {
      manager.disconnect()
      managerRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
