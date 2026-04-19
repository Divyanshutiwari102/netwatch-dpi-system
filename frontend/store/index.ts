import { create } from 'zustand'
import type {
  CaptureStatus, FlowRecord, Packet, PacketFilter,
  PacketStats, Rule, WsState,
} from '@/types'

export const MAX_PACKETS  = 2_000
export const HISTORY_LEN  = 60

interface AppStore {
  packets:       Packet[]
  flows:         FlowRecord[]
  rules:         Rule[]
  captureStatus: CaptureStatus | null
  stats:         PacketStats
  ppsHistory:    number[]
  bpsHistory:    number[]
  wsState:       WsState
  wsRetry:       number
  liveTexts:     string[]
  toasts:        Toast[]
  filter:        PacketFilter
  theme:         'dark' | 'light'

  addBatch:         (batch: Packet[]) => void
  setFlows:         (flows: FlowRecord[]) => void
  setRules:         (rules: Rule[]) => void
  setCaptureStatus: (s: CaptureStatus) => void
  setStats:         (s: PacketStats) => void
  setWsState:       (state: WsState, retry: number) => void
  setFilter:        (patch: Partial<PacketFilter>) => void
  clearPackets:     () => void
  toggleTheme:      () => void

  addToast:         (msg: string, type: Toast['type']) => void
  removeToast:      (id: number) => void
}

export interface Toast {
  id:   number
  msg:  string
  type: 'success' | 'error' | 'info'
}

const EMPTY_STATS: PacketStats = {
  totalPackets: 0, totalBytes: 0, blockedPackets: 0,
  tcpPackets: 0, udpPackets: 0, icmpPackets: 0,
  bufferedPackets: 0, droppedFromBuffer: 0,
  packetsPerSecond: 0, bytesPerSecond: 0,
}

const EMPTY_FILTER: PacketFilter = {
  search: '', srcIp: '', dstIp: '', protocol: '',
  port: '', app: '', blockedOnly: false,
}

// Sequence counter for truly unique keys when IDs collide
let _seq = 0

export const useStore = create<AppStore>((set, get) => ({
  packets:       [],
  flows:         [],
  rules:         [],
  captureStatus: null,
  stats:         EMPTY_STATS,
  ppsHistory:    Array(HISTORY_LEN).fill(0),
  bpsHistory:    Array(HISTORY_LEN).fill(0),
  wsState:       'CONNECTING',
  wsRetry:       0,
  liveTexts:     [],
  toasts:        [],
  filter:        EMPTY_FILTER,
  theme:         'dark',

  addBatch: (batch) => {
    const { packets, liveTexts } = get()

    // Stamp each packet with a guaranteed-unique _seq so React keys never collide
    const stamped = batch.map((p) => ({ ...p, _seq: _seq++ }))

    const newTexts: string[] = []
    for (const p of stamped) {
      if (p.sni || p.application) {
        const label = p.application || p.sni!
        newTexts.push(`${p.srcIp} → ${p.dstIp} [${label}]`)
      }
    }

    const nextPackets = [...stamped, ...packets]
    const trimmed = nextPackets.length > MAX_PACKETS
      ? nextPackets.slice(0, MAX_PACKETS)
      : nextPackets

    const nextTexts = [...newTexts, ...liveTexts].slice(0, 30)
    set({ packets: trimmed, liveTexts: nextTexts })
  },

  setFlows: (flows) => set({ flows }),
  setRules: (rules) => set({ rules }),
  setCaptureStatus: (captureStatus) => set({ captureStatus }),

  setStats: (s) => {
    const { ppsHistory, bpsHistory } = get()
    set({
      stats:      s,
      ppsHistory: [...ppsHistory.slice(1), s.packetsPerSecond ?? 0],
      bpsHistory: [...bpsHistory.slice(1), s.bytesPerSecond   ?? 0],
    })
  },

  setWsState: (wsState, wsRetry) => set({ wsState, wsRetry }),
  setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
  clearPackets: () => set({ packets: [], liveTexts: [] }),

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    set({ theme: next })
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', next)
    }
  },

  addToast: (msg, type) => {
    const id = Date.now()
    set((s) => ({ toasts: [...s.toasts, { id, msg, type }] }))
    setTimeout(() => get().removeToast(id), 3_500)
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
