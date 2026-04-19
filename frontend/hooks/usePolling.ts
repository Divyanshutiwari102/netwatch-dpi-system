'use client'

import { useCallback, useEffect } from 'react'
import { captureApi, flowApi, packetApi, ruleApi } from '@/lib/api'
import { useStore } from '@/store'

const POLL_MS = 2_000

export function usePolling() {
  const setStats         = useStore((s) => s.setStats)
  const setFlows         = useStore((s) => s.setFlows)
  const setRules         = useStore((s) => s.setRules)
  const setCaptureStatus = useStore((s) => s.setCaptureStatus)

  const poll = useCallback(async () => {
    const [statusRes, statsRes, flowsRes, rulesRes] = await Promise.allSettled([
      captureApi.status(),
      packetApi.stats(),
      flowApi.list(30),
      ruleApi.list(),
    ])

    if (statusRes.status === 'fulfilled' && statusRes.value) {
      setCaptureStatus(statusRes.value)
    }
    if (statsRes.status === 'fulfilled' && statsRes.value) {
      setStats(statsRes.value)
    }
    if (flowsRes.status === 'fulfilled') {
      setFlows(Array.isArray(flowsRes.value) ? flowsRes.value : [])
    }
    if (rulesRes.status === 'fulfilled') {
      setRules(Array.isArray(rulesRes.value) ? rulesRes.value : [])
    }
  }, [setCaptureStatus, setStats, setFlows, setRules])

  // Exposed for manual refresh after user actions (start/stop/add rule)
  const refresh = useCallback(async () => {
    try { await poll() } catch { /* backend may be unreachable, swallow */ }
  }, [poll])

  useEffect(() => {
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [poll])

  return { refresh }
}
