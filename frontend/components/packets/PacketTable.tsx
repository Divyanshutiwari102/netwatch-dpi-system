'use client'

import {
  useRef, useMemo, useState, useCallback, memo, useEffect,
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStore } from '@/store'
import { FilterBar } from './FilterBar'
import { PacketTooltip } from './PacketTooltip'
import { fmtTime, fmtBytes } from '@/lib/utils'
import type { Packet } from '@/types'

const ROW_H = 36

const COLUMNS = [
  { key: 'time',   label: 'Time',        width: 88  },
  { key: 'srcIp',  label: 'Source',      width: 132 },
  { key: 'dstIp',  label: 'Destination', width: 132 },
  { key: 'proto',  label: 'Proto',       width: 64  },
  { key: 'ports',  label: 'Ports',       width: 96  },
  { key: 'app',    label: 'Application', width: 0   },
  { key: 'size',   label: 'Size',        width: 72  },
  { key: 'status', label: 'Status',      width: 96  },
]

const COL_TEMPLATE = COLUMNS.map((c) => (c.width ? `${c.width}px` : '1fr')).join(' ')

const PROTO_STYLES: Record<string, { bg: string; color: string }> = {
  TCP:  { bg: 'var(--cyan-dim)',   color: 'var(--cyan)'   },
  UDP:  { bg: 'var(--amber-dim)',  color: 'var(--amber)'  },
  ICMP: { bg: 'var(--purple-dim)', color: 'var(--purple)' },
}

// Extended type with internal _seq for guaranteed-unique React keys
type StampedPacket = Packet & { _seq?: number }

const PacketRow = memo(function PacketRow({
  packet,
  style,
  onHover,
}: {
  packet: StampedPacket
  style: React.CSSProperties
  onHover: (p: StampedPacket | null, y: number) => void
}) {
  const ts = packet.capturedAt ?? packet.capturedAtMs
  const ps = PROTO_STYLES[packet.protocol] ?? { bg: 'var(--bg4)', color: 'var(--text3)' }
  const isBlocked = packet.blocked

  return (
    <div
      role="row"
      style={{
        ...style,
        display: 'grid',
        gridTemplateColumns: COL_TEMPLATE,
        alignItems: 'center',
        borderBottom: '1px solid var(--border)',
        background: isBlocked ? 'var(--row-blocked)' : 'transparent',
        cursor: 'default',
      }}
      className="packet-row"
      onMouseEnter={(e) => onHover(packet, e.currentTarget.getBoundingClientRect().top)}
      onMouseLeave={() => onHover(null, 0)}
    >
      {/* Time */}
      <div style={{ padding: '0 10px 0 12px' }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--text3)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.01em',
        }}>
          {fmtTime(ts)}
        </span>
      </div>

      {/* Source IP */}
      <div style={{ padding: '0 8px' }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text2)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {packet.srcIp || '—'}
        </span>
      </div>

      {/* Dest IP */}
      <div style={{ padding: '0 8px' }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text2)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {packet.dstIp || '—'}
        </span>
      </div>

      {/* Protocol badge */}
      <div style={{ padding: '0 8px' }}>
        <span style={{
          display: 'inline-block',
          fontSize: 9.5,
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          padding: '2px 6px',
          borderRadius: 4,
          background: ps.bg,
          color: ps.color,
          letterSpacing: '0.05em',
        }}>
          {packet.protocol}
        </span>
      </div>

      {/* Ports */}
      <div style={{ padding: '0 8px' }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--text3)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {packet.srcPort && packet.dstPort
            ? `${packet.srcPort} → ${packet.dstPort}`
            : '—'}
        </span>
      </div>

      {/* Application */}
      <div style={{ padding: '0 8px', display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', minWidth: 0 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 500,
            color: packet.application ? 'var(--text1)' : 'var(--text3)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flexShrink: 1,
            minWidth: 0,
          }}
        >
          {packet.application || '—'}
        </span>
        {packet.sni && (
          <span
            title={`SNI: ${packet.sni}`}
            style={{
              flexShrink: 0,
              fontSize: 8,
              fontFamily: 'var(--font-mono)',
              color: 'var(--cyan)',
              background: 'var(--cyan-dim)',
              border: '1px solid rgba(0,188,212,0.2)',
              borderRadius: 3,
              padding: '0 4px',
              lineHeight: '14px',
            }}
          >
            SNI
          </span>
        )}
      </div>

      {/* Size */}
      <div style={{ padding: '0 10px', textAlign: 'right' }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--text3)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {packet.totalBytes ? fmtBytes(packet.totalBytes) : '—'}
        </span>
      </div>

      {/* Status */}
      <div style={{ padding: '0 10px' }}>
        {isBlocked ? (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 9.5,
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            color: 'var(--red)',
            background: 'var(--red-dim)',
            border: '1px solid rgba(240,80,96,0.2)',
            borderRadius: 4,
            padding: '2px 7px',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            ✕ {(packet.blockedBy || '').split(':')[0] || 'RULE'}
          </span>
        ) : (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10.5,
            fontFamily: 'var(--font-mono)',
            color: 'var(--green)',
          }}>
            <span style={{ fontSize: 9 }}>✓</span> OK
          </span>
        )}
      </div>
    </div>
  )
})

function TickerBar() {
  const texts = useStore((s) => s.liveTexts)

  return (
    <div
      className="flex items-center overflow-hidden shrink-0"
      style={{
        height: 24,
        borderTop: '1px solid var(--border)',
        background: 'var(--bg1)',
      }}
    >
      {texts.length === 0 ? (
        <span style={{
          paddingLeft: 16,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text4)',
          fontStyle: 'italic',
        }}>
          Waiting for traffic…
        </span>
      ) : (
        <div
          className="flex gap-10 whitespace-nowrap"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text3)',
            animation: 'marquee 40s linear infinite',
            paddingLeft: '100%',
          }}
        >
          {[...texts, ...texts].map((t, i) => (
            <span key={i} className="inline-flex items-center gap-3">
              {t}
              <span style={{ color: 'var(--border-bright)' }}>◆</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 40,
      }}
    >
      <div style={{
        width: 44,
        height: 44,
        borderRadius: '50%',
        border: '1px solid var(--border-bright)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text4)',
        fontSize: 18,
        opacity: 0.5,
      }}>
        {filtered ? '⊘' : '◈'}
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text3)',
          marginBottom: 4,
        }}>
          {filtered ? 'No matching packets' : 'No packets captured yet'}
        </p>
        <p style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 11,
          color: 'var(--text4)',
        }}>
          {filtered ? 'Adjust or clear filters to see results' : 'Start capture to see live traffic'}
        </p>
      </div>
    </div>
  )
}

export function PacketTable() {
  const packets = useStore((s) => s.packets)
  const filter  = useStore((s) => s.filter)

  const [hovered,  setHovered]  = useState<StampedPacket | null>(null)
  const [tooltipY, setTooltipY] = useState(0)
  const [autoScroll, setAutoScroll] = useState(true)

  const handleHover = useCallback((p: StampedPacket | null, y: number) => {
    setHovered(p)
    setTooltipY(y)
  }, [])

  const filtered = useMemo(() => {
    const q = filter.search.toLowerCase().trim()
    return (packets as StampedPacket[]).filter((p) => {
      if (filter.srcIp    && !(p.srcIp     || '').includes(filter.srcIp))   return false
      if (filter.dstIp    && !(p.dstIp     || '').includes(filter.dstIp))   return false
      if (filter.protocol && p.protocol    !== filter.protocol)              return false
      if (filter.app      && p.application !== filter.app)                   return false
      if (filter.blockedOnly && !p.blocked)                                  return false
      if (filter.port) {
        const n = parseInt(filter.port, 10)
        if (!isNaN(n) && p.srcPort !== n && p.dstPort !== n)                return false
      }
      if (q) {
        return (
          (p.srcIp       || '').includes(q) ||
          (p.dstIp       || '').includes(q) ||
          (p.sni         || '').toLowerCase().includes(q) ||
          (p.application || '').toLowerCase().includes(q) ||
          String(p.srcPort || '').includes(q) ||
          String(p.dstPort || '').includes(q)
        )
      }
      return true
    })
  }, [packets, filter])

  const appNames = useMemo(() => {
    const s = new Set<string>()
    packets.forEach((p) => { if (p.application) s.add(p.application) })
    return [...s].sort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packets.length > 0 ? (packets[0] as StampedPacket)._seq : 0])

  const outerRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count:            filtered.length,
    getScrollElement: () => outerRef.current,
    estimateSize:     () => ROW_H,
    overscan:         12,
  })

  // Auto-scroll to bottom when new data arrives
  useEffect(() => {
    if (!autoScroll || !outerRef.current) return
    const el = outerRef.current
    el.scrollTop = el.scrollHeight
  }, [filtered.length, autoScroll])

  // Detect manual scroll to disable auto-scroll
  const handleScroll = useCallback(() => {
    if (!outerRef.current) return
    const el = outerRef.current
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < ROW_H * 2
    setAutoScroll(atBottom)
  }, [])

  const items     = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()

  const hasFilters = !!(
    filter.search || filter.srcIp || filter.dstIp ||
    filter.protocol || filter.port || filter.app || filter.blockedOnly
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <FilterBar
        totalCount={packets.length}
        filteredCount={filtered.length}
        appNames={appNames}
        autoScroll={autoScroll}
        onToggleAutoScroll={() => setAutoScroll((v) => !v)}
      />

      <div className="flex-1 flex flex-col overflow-hidden relative" style={{ minHeight: 0 }}>
        {/* Column headers */}
        <div
          className="shrink-0"
          style={{
            display: 'grid',
            gridTemplateColumns: COL_TEMPLATE,
            background: 'var(--bg2)',
            borderBottom: '1px solid var(--border)',
            zIndex: 2,
          }}
        >
          {COLUMNS.map((c, i) => (
            <div
              key={c.key}
              style={{
                padding: i === 0 ? '7px 10px 7px 12px' : '7px 8px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                fontSize: 9,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--text4)',
                textAlign: c.key === 'size' ? 'right' : 'left',
              }}
            >
              {c.label}
            </div>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState filtered={hasFilters} />
        ) : (
          <div
            ref={outerRef}
            className="flex-1 overflow-y-auto overflow-x-hidden"
            style={{ minHeight: 0 }}
            onScroll={handleScroll}
            onMouseLeave={() => handleHover(null, 0)}
          >
            <div style={{ height: totalSize, position: 'relative', width: '100%' }}>
              {items.map((vRow) => {
                const pkt = filtered[vRow.index]
                const rowKey = pkt._seq !== undefined ? pkt._seq : `idx-${vRow.index}`
                return (
                  <PacketRow
                    key={rowKey}
                    packet={pkt}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${vRow.size}px`,
                      transform: `translateY(${vRow.start}px)`,
                    }}
                    onHover={handleHover}
                  />
                )
              })}
            </div>
          </div>
        )}

        {hovered && <PacketTooltip packet={hovered} y={tooltipY} />}
      </div>

      <TickerBar />
    </div>
  )
}
