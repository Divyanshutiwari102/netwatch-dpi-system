import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Tailwind class merge helper
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Number formatters ─────────────────────────────────────────────────────────
export function fmtNum(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString()
}

export function fmtBytes(n: number | undefined | null): string {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1_073_741_824) return `${(n / 1_048_576).toFixed(1)} MB`
  return `${(n / 1_073_741_824).toFixed(2)} GB`
}

export function fmtRate(n: number | undefined | null): string {
  if (!n) return '0/s'
  if (n < 1_000) return `${Math.round(n)}/s`
  return `${(n / 1000).toFixed(1)}k/s`
}

export function fmtTime(ts: number | string | undefined | null): string {
  if (!ts) return '--'
  const d = new Date(typeof ts === 'string' ? Date.parse(ts) : ts)
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${d.toTimeString().slice(0, 8)}.${ms}`
}

export function fmtTimeISO(ts: number | undefined | null): string {
  if (!ts) return '--'
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 23)
}

// ── Stable chart colors ───────────────────────────────────────────────────────
// Fixed palette so the same domain always maps to the same color in the donut.
const PALETTE = [
  '#00c8e8', '#00e5a0', '#ffaa00', '#a78bfa',
  '#ff4d6d', '#38bdf8', '#fb7185', '#34d399',
]

const colorCache = new Map<string, string>()
let colorIdx = 0

export function stableColor(label: string): string {
  if (!colorCache.has(label)) {
    colorCache.set(label, PALETTE[colorIdx % PALETTE.length])
    colorIdx++
  }
  return colorCache.get(label)!
}

// ── Misc ──────────────────────────────────────────────────────────────────────
export function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}

export function buildExportUrl(filter: {
  srcIp?: string; dstIp?: string; protocol?: string
  srcPort?: number; dstPort?: number; blocked?: boolean
}): string {
  const params = new URLSearchParams()
  if (filter.srcIp)    params.set('srcIp', filter.srcIp)
  if (filter.dstIp)    params.set('dstIp', filter.dstIp)
  if (filter.protocol) params.set('protocol', filter.protocol)
  if (filter.srcPort)  params.set('srcPort', String(filter.srcPort))
  if (filter.dstPort)  params.set('dstPort', String(filter.dstPort))
  if (filter.blocked)  params.set('blocked', 'true')
  params.set('limit', '5000')
  const qs = params.toString()
  return `/api/packets/export${qs ? `?${qs}` : ''}`
}
