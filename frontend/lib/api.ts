import type {
  ApiResponse, CaptureStatus, FlowRecord, Packet,
  PacketStats, Rule, RuleType,
} from '@/types'

// ── Core fetch wrapper ────────────────────────────────────────────────────────
// All requests go through Next.js rewrites → Spring Boot on :8080.
// Unwraps the { success, message, data } envelope automatically.

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  }
  if (body !== undefined) init.body = JSON.stringify(body)

  const res = await fetch(path, init)

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`[${res.status}] ${path} — ${text || res.statusText}`)
  }

  const json: ApiResponse<T> = await res.json()
  // Backend always wraps in { success, message, data }
  return json.data ?? (json as unknown as T)
}

const get  = <T>(path: string)              => request<T>('GET',    path)
const post = <T>(path: string, body: unknown) => request<T>('POST',   path, body)
const del  = <T>(path: string)              => request<T>('DELETE', path)

// ── Capture endpoints ─────────────────────────────────────────────────────────
export const captureApi = {
  startLive: (iface?: string) =>
    post<{ message: string }>('/api/capture/start', iface ? { networkInterface: iface } : {}),

  startFile: (path: string) =>
    post<{ message: string }>('/api/capture/start', { pcapFilePath: path }),

  stop: () =>
    post<{ message: string }>('/api/capture/stop', {}),

  status: () =>
    get<CaptureStatus>('/api/capture/status'),

  interfaces: () =>
    get<string[]>('/api/capture/interfaces'),
}

// ── Packet endpoints ──────────────────────────────────────────────────────────
export const packetApi = {
  stats: () => get<PacketStats>('/api/packets/stats'),

  list: (params?: {
    srcIp?: string; dstIp?: string; protocol?: string
    srcPort?: number; dstPort?: number; blocked?: boolean; limit?: number
  }) => {
    const qs = new URLSearchParams()
    if (params?.srcIp)    qs.set('srcIp',    params.srcIp)
    if (params?.dstIp)    qs.set('dstIp',    params.dstIp)
    if (params?.protocol) qs.set('protocol', params.protocol)
    if (params?.srcPort)  qs.set('srcPort',  String(params.srcPort))
    if (params?.dstPort)  qs.set('dstPort',  String(params.dstPort))
    if (params?.blocked)  qs.set('blocked',  'true')
    qs.set('limit', String(params?.limit ?? 200))
    return get<Packet[]>(`/api/packets?${qs}`)
  },
}

// ── Flow endpoints ────────────────────────────────────────────────────────────
export const flowApi = {
  list: (limit = 30) => get<FlowRecord[]>(`/api/flows?limit=${limit}`),
}

// ── Rule endpoints ────────────────────────────────────────────────────────────
export const ruleApi = {
  list: () => get<Rule[]>('/api/rules'),

  add: (type: RuleType, value: string, description?: string) =>
    post<Rule>('/api/rules', { type, value, description }),

  remove: (id: string) => del<void>(`/api/rules/${id}`),
}

// ── Metrics endpoint (Actuator) ───────────────────────────────────────────────
export const metricsApi = {
  summary: () => get<Record<string, unknown>>('/api/metrics/summary'),
}
