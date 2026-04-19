// ── Packet (WsPacketSummary wire format from backend) ─────────────────────────
export interface Packet {
  id: number
  capturedAtMs: number   // epoch millis — from WsPacketSummary
  capturedAt?: number    // alias after normalisation in websocket.ts
  srcIp: string
  dstIp: string
  protocol: 'TCP' | 'UDP' | 'ICMP' | 'OTHER'
  srcPort: number
  dstPort: number
  application: string    // simplified domain e.g. "googlevideo.com"
  sni: string | null     // full TLS SNI e.g. "r1---sn-xxx.googlevideo.com"
  totalBytes: number
  blocked: boolean
  blockedBy: string | null
}

// ── Stats (from GET /api/packets/stats) ──────────────────────────────────────
export interface PacketStats {
  totalPackets: number
  totalBytes: number
  blockedPackets: number
  tcpPackets: number
  udpPackets: number
  icmpPackets: number
  bufferedPackets: number
  droppedFromBuffer: number
  packetsPerSecond: number
  bytesPerSecond: number
  activeFlows?: number
}

// ── Flow record (from GET /api/flows) ────────────────────────────────────────
export interface FlowRecord {
  key?: { srcIp: string; dstIp: string; protocol: string; srcPort: number; dstPort: number }
  srcIp?: string
  dstIp?: string
  protocol?: string
  sni?: string
  application?: string
  blocked?: boolean
  totalPackets: number
  totalBytes?: number
  state?: string
}

// ── Rule (from GET /api/rules) ───────────────────────────────────────────────
export type RuleType = 'BLOCK_IP' | 'BLOCK_DOMAIN' | 'BLOCK_PORT' | 'BLOCK_PROTOCOL'

export interface Rule {
  id: string
  type: RuleType
  value: string
  description?: string
  enabled: boolean
}

// ── Capture status (from GET /api/capture/status) ────────────────────────────
export interface CaptureStatus {
  running: boolean
  queueSize: number
  droppedPackets: number
  selectedInterface?: string
}

// ── Backend envelope ──────────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean
  message: string
  data: T
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export interface User {
  email: string
  name: string
  role: 'admin' | 'viewer'
}

export interface AuthState {
  user: User | null
  token: string | null
}

// ── WebSocket connection state ────────────────────────────────────────────────
export type WsState = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'

// ── Filter state for packet table ────────────────────────────────────────────
export interface PacketFilter {
  search: string
  srcIp: string
  dstIp: string
  protocol: string
  port: string
  app: string
  blockedOnly: boolean
}
