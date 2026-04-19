'use client'

import type { Packet } from '@/types'
import { fmtTime, fmtBytes } from '@/lib/utils'

interface Props {
  packet: Packet & { _seq?: number }
  y: number
}

const TOOLTIP_H = 300

export function PacketTooltip({ packet, y }: Props) {
  const ts = packet.capturedAt ?? packet.capturedAtMs
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800

  // Clamp so tooltip stays on screen
  const top = Math.min(y - 8, winH - TOOLTIP_H - 12)

  const isBlocked = packet.blocked

  return (
    <div
      className="fixed pointer-events-none"
      style={{
        right: 294,
        top,
        zIndex: 500,
        width: 256,
        background: 'var(--bg3)',
        border: '1px solid var(--border-bright)',
        borderRadius: 8,
        boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
        animation: 'toast-in 0.12s ease-out',
        overflow: 'hidden',
      }}
    >
      {/* Status strip at top */}
      <div style={{
        height: 3,
        background: isBlocked ? 'var(--red)' : 'var(--green)',
        opacity: 0.7,
      }} />

      {/* Header */}
      <div style={{
        padding: '10px 14px 8px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: '0.12em',
          color: 'var(--text3)',
          textTransform: 'uppercase',
        }}>
          Packet Detail
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          fontWeight: 600,
          color: isBlocked ? 'var(--red)' : 'var(--green)',
          background: isBlocked ? 'var(--red-dim)' : 'var(--green-dim)',
          padding: '1px 7px',
          borderRadius: 4,
        }}>
          {isBlocked ? 'BLOCKED' : 'ALLOWED'}
        </span>
      </div>

      {/* Content */}
      <div style={{ padding: '8px 14px 12px' }}>
        {/* Connection info */}
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--text2)',
        }}>
          <span style={{ color: 'var(--text1)', fontWeight: 500 }}>
            {packet.srcIp}
          </span>
          <span style={{ color: 'var(--text4)', fontSize: 9 }}>→</span>
          <span style={{ fontWeight: 500, color: 'var(--text2)' }}>
            {packet.dstIp}
          </span>
        </div>

        {/* SNI — prominent if present */}
        {packet.sni && (
          <div style={{
            background: 'var(--cyan-dim)',
            border: '1px solid rgba(0,188,212,0.15)',
            borderRadius: 5,
            padding: '5px 10px',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
              SNI
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--text1)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {packet.sni}
            </span>
          </div>
        )}

        {/* Rows */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {[
              ['Time',        fmtTime(ts)],
              ['Protocol',    packet.protocol],
              ['Src Port',    String(packet.srcPort || '—')],
              ['Dst Port',    String(packet.dstPort || '—')],
              ['Application', packet.application || '—'],
              ['Size',        packet.totalBytes ? fmtBytes(packet.totalBytes) : '—'],
              ...(isBlocked ? [['Blocked by', (packet.blockedBy || '').split(':')[0] || 'rule']] : []),
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--text3)',
                  padding: '2.5px 0',
                  paddingRight: 12,
                  whiteSpace: 'nowrap',
                  verticalAlign: 'top',
                }}>
                  {k}
                </td>
                <td style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  color: k === 'Application' ? 'var(--text1)' : 'var(--text2)',
                  padding: '2.5px 0',
                  textAlign: 'right',
                  maxWidth: 160,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontWeight: k === 'Application' ? 500 : 400,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {v}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
