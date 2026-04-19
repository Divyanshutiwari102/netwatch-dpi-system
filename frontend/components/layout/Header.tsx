'use client'

import { useStore } from '@/store'
import { fmtNum, fmtRate } from '@/lib/utils'

export function Header() {
  const wsState       = useStore((s) => s.wsState)
  const wsRetry       = useStore((s) => s.wsRetry)
  const captureStatus = useStore((s) => s.captureStatus)
  const stats         = useStore((s) => s.stats)
  const rules         = useStore((s) => s.rules)
  const theme         = useStore((s) => s.theme)
  const toggleTheme   = useStore((s) => s.toggleTheme)

  const isLive  = captureStatus?.running
  const wsOk    = wsState === 'CONNECTED'
  const wsConn  = wsState === 'CONNECTING'

  const statusColor = wsOk
    ? (isLive ? 'var(--green)' : 'var(--cyan)')
    : wsConn ? 'var(--amber)' : 'var(--red)'

  const statusLabel = wsOk
    ? (isLive ? 'CAPTURING' : 'CONNECTED')
    : wsConn ? 'CONNECTING' : 'DISCONNECTED'

  return (
    <header
      className="flex items-center shrink-0"
      style={{
        height: 46,
        background: 'var(--bg1)',
        borderBottom: '1px solid var(--border)',
        zIndex: 10,
        paddingLeft: 16,
        paddingRight: 16,
        gap: 24,
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 shrink-0" style={{ fontFamily: 'var(--font-mono)' }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="0.75" y="0.75" width="14.5" height="14.5" rx="2.5"
            stroke="var(--cyan)" strokeWidth="1.25" opacity="0.7" />
          <circle cx="8" cy="8" r="2.5" fill="var(--cyan)" />
          <line x1="8" y1="0" x2="8" y2="4" stroke="var(--cyan)" strokeWidth="1" opacity="0.35" />
          <line x1="8" y1="12" x2="8" y2="16" stroke="var(--cyan)" strokeWidth="1" opacity="0.35" />
          <line x1="0" y1="8" x2="4" y2="8" stroke="var(--cyan)" strokeWidth="1" opacity="0.35" />
          <line x1="12" y1="8" x2="16" y2="8" stroke="var(--cyan)" strokeWidth="1" opacity="0.35" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.15em', color: 'var(--text2)' }}>
          NET<span style={{ color: 'var(--cyan)' }}>WATCH</span>
        </span>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 18, background: 'var(--border)' }} />

      {/* WS Status */}
      <div className="flex items-center gap-2 shrink-0">
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: statusColor,
            animation: wsOk && isLive
              ? 'pulse-dot 2s ease-in-out infinite'
              : wsConn ? 'blink 1s step-start infinite' : 'none',
            flexShrink: 0,
          }}
        />
        <span style={{
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          letterSpacing: '0.1em',
          color: statusColor,
        }}>
          {statusLabel}
        </span>
        {wsState === 'DISCONNECTED' && wsRetry > 0 && (
          <span style={{
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            background: 'var(--amber-dim)',
            border: '1px solid rgba(240,160,32,0.2)',
            color: 'var(--amber)',
            padding: '1px 6px',
            borderRadius: 4,
          }}>
            retry #{wsRetry}
          </span>
        )}
      </div>

      <div className="flex-1" />

      {/* Stats row */}
      <div className="flex items-center gap-1">
        {[
          { k: 'Packets', v: fmtNum(stats.totalPackets),      c: 'var(--text1)' },
          { k: 'PPS',     v: fmtRate(stats.packetsPerSecond), c: 'var(--cyan)'  },
          { k: 'Blocked', v: fmtNum(stats.blockedPackets),    c: stats.blockedPackets > 0 ? 'var(--red)' : 'var(--text3)' },
          { k: 'Dropped', v: fmtNum(stats.droppedFromBuffer), c: stats.droppedFromBuffer > 0 ? 'var(--amber)' : 'var(--text3)' },
          { k: 'Rules',   v: String(rules.length),             c: 'var(--text2)' },
        ].map((chip) => (
          <div
            key={chip.k}
            className="flex items-center gap-1.5"
            style={{
              padding: '3px 10px',
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 5,
            }}
          >
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text3)', letterSpacing: '0.06em' }}>
              {chip.k.toUpperCase()}
            </span>
            <span style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: chip.c,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {chip.v}
            </span>
          </div>
        ))}
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          color: 'var(--text3)',
          fontSize: 13,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-bright)')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
      >
        {theme === 'dark' ? '☀' : '◑'}
      </button>
    </header>
  )
}
