'use client'

import { useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Chart,
  LineElement, PointElement, LineController,
  CategoryScale, LinearScale,
  ArcElement, DoughnutController,
  BarElement, BarController,
  Tooltip,
} from 'chart.js'
import { useStore } from '@/store'
import { StatCard, SectionLabel } from '@/components/ui'
import { fmtNum, fmtBytes, fmtRate, stableColor } from '@/lib/utils'

Chart.register(
  LineElement, PointElement, LineController,
  CategoryScale, LinearScale,
  ArcElement, DoughnutController,
  BarElement, BarController,
  Tooltip,
)

// ── Resolve CSS variable to actual color value (Chart.js can't read CSS vars) ──
function resolveCssColor(varStr: string): string {
  // Map known design tokens to their actual hex values
  const MAP: Record<string, string> = {
    'var(--cyan)':   '#00bcd4',
    'var(--green)':  '#00c984',
    'var(--red)':    '#f05060',
    'var(--amber)':  '#f0a020',
    'var(--purple)': '#9c7ef0',
  }
  if (MAP[varStr]) return MAP[varStr]
  // Fallback: try to read from DOM if available
  if (typeof window !== 'undefined') {
    const raw = varStr.match(/var\(([^)]+)\)/)?.[1]
    if (raw) {
      const resolved = getComputedStyle(document.documentElement).getPropertyValue(raw).trim()
      if (resolved) return resolved
    }
  }
  return varStr
}

// ── Sparkline ──────────────────────────────────────────────────────────────────
function Sparkline({
  label, history, color, fmtFn,
}: {
  label:   string
  history: number[]
  color:   string
  fmtFn:  (n: number) => string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<Chart | null>(null)
  const fmtRef    = useRef(fmtFn)
  useEffect(() => { fmtRef.current = fmtFn }, [fmtFn])

  const histKey = history.join(',')

  useEffect(() => {
    if (!canvasRef.current) return
    const data   = [...history]
    const labels = data.map((_, i) => i)

    if (chartRef.current) {
      chartRef.current.data.labels           = labels
      chartRef.current.data.datasets[0].data = data
      chartRef.current.update('none')
      return
    }

    const resolvedColor = resolveCssColor(color)
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor:          resolvedColor,
          borderWidth:          2,
          pointRadius:          0,
          pointHoverRadius:     4,
          pointBackgroundColor: resolvedColor,
          fill:                 true,
          backgroundColor:      `${resolvedColor}22`,
          tension:              0.35,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        animation:           false,
        interaction:         { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (ctx) => ` ${fmtRef.current(ctx.raw as number)}` },
            backgroundColor: 'var(--bg4)',
            borderColor:     'var(--border-bright)',
            borderWidth:     1,
            bodyColor:       'var(--text1)',
            padding:         7,
            cornerRadius:    5,
          },
        },
        scales: {
          x: { display: false },
          y: { display: false, beginAtZero: true },
        },
      },
    })

    return () => { chartRef.current?.destroy(); chartRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histKey, color])

  const current = history[history.length - 1] ?? 0
  const peak    = Math.max(...history, 0)

  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 7,
        padding: '10px 12px 8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text3)',
        }}>
          {label}
        </span>
        <div style={{ textAlign: 'right' }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 700,
            color,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {fmtFn(current)}
          </span>
        </div>
      </div>
      <div style={{ position: 'relative', height: 34 }}>
        <canvas ref={canvasRef} role="img" aria-label={`${label} chart`} />
      </div>
      {peak > 0 && (
        <div style={{ marginTop: 4, display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--text4)',
          }}>
            peak {fmtFn(peak)}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Protocol Bar ───────────────────────────────────────────────────────────────
function ProtoBar({ tcp, udp, icmp, other }: { tcp: number; udp: number; icmp: number; other: number }) {
  const total = tcp + udp + icmp + other
  if (total === 0) return null

  const segments = [
    { label: 'TCP',   value: tcp,   color: 'var(--cyan)'   },
    { label: 'UDP',   value: udp,   color: 'var(--amber)'  },
    { label: 'ICMP',  value: icmp,  color: 'var(--purple)' },
    { label: 'Other', value: other, color: 'var(--text4)'  },
  ].filter((s) => s.value > 0)

  return (
    <div>
      {/* Bar */}
      <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', height: 6, gap: 1, marginBottom: 8 }}>
        {segments.map((s) => (
          <div
            key={s.label}
            style={{
              flex: s.value,
              background: s.color,
              opacity: 0.75,
            }}
            title={`${s.label}: ${((s.value / total) * 100).toFixed(1)}%`}
          />
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>
              {s.label}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text2)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {((s.value / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── App Donut ──────────────────────────────────────────────────────────────────
function AppDonut({ counts, total }: { counts: [string, number][]; total: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<Chart | null>(null)
  const dataKey   = counts.map(([k, v]) => `${k}:${v}`).join(',')

  useEffect(() => {
    if (!canvasRef.current || counts.length === 0) return
    const labels = counts.map(([k]) => k)
    const data   = counts.map(([, v]) => v)
    const colors = labels.map(stableColor)

    if (chartRef.current) {
      chartRef.current.data.labels                      = labels
      chartRef.current.data.datasets[0].data            = data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(chartRef.current.data.datasets[0] as any).backgroundColor = colors
      chartRef.current.update('none')
      return
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '72%', animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw} pkts` },
            backgroundColor: 'var(--bg4)',
            borderColor: 'var(--border-bright)',
            borderWidth: 1, bodyColor: 'var(--text1)', padding: 8, cornerRadius: 5,
          },
        },
      },
    })

    return () => { chartRef.current?.destroy(); chartRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey])

  if (counts.length === 0) return null

  return (
    <>
      <div style={{ position: 'relative', height: 88, marginBottom: 10 }}>
        <canvas ref={canvasRef} role="img" aria-label="Application breakdown" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {counts.map(([k, v]) => {
          const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0.0'
          return (
            <div key={k} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontFamily: 'var(--font-mono)',
            }}>
              <div style={{
                width: 6,
                height: 6,
                borderRadius: 2,
                background: stableColor(k),
                flexShrink: 0,
              }} />
              <span style={{
                flex: 1,
                fontSize: 10.5,
                color: 'var(--text2)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {k}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>
                {pct}%
              </span>
              <span style={{
                fontSize: 10,
                color: 'var(--text4)',
                width: 28,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {v}
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── Flow List ──────────────────────────────────────────────────────────────────
function FlowList() {
  const flows = useStore((s) => s.flows)

  if (flows.length === 0) {
    return (
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--text4)',
        textAlign: 'center',
        padding: '12px 0',
      }}>
        No active flows
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {flows.slice(0, 10).map((f, i) => {
        const srcIp = f.key?.srcIp  ?? f.srcIp  ?? '?'
        const dstIp = f.key?.dstIp  ?? f.dstIp  ?? '?'
        const proto = f.key?.protocol ?? f.protocol ?? 'TCP'
        const label = f.sni ?? f.application

        const protoColor =
          proto === 'TCP'  ? 'var(--cyan)'   :
          proto === 'UDP'  ? 'var(--amber)'  :
                             'var(--purple)'

        return (
          <div
            key={i}
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '7px 10px',
            }}
          >
            {/* IPs row */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              marginBottom: 4,
              overflow: 'hidden',
            }}>
              <span style={{ color: 'var(--text1)', flexShrink: 0 }}>{srcIp}</span>
              <span style={{ color: 'var(--text4)', fontSize: 9, flexShrink: 0 }}>→</span>
              <span style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {dstIp}
              </span>
            </div>

            {/* Meta row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                fontWeight: 600,
                padding: '1px 5px',
                borderRadius: 3,
                background: `${protoColor}18`,
                color: protoColor,
                letterSpacing: '0.05em',
                flexShrink: 0,
              }}>
                {proto}
              </span>
              {label && (
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--text3)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}>
                  {label}
                </span>
              )}
              {f.blocked && (
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  fontWeight: 600,
                  color: 'var(--red)',
                  flexShrink: 0,
                }}>
                  blocked
                </span>
              )}
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                color: 'var(--text4)',
                marginLeft: 'auto',
                flexShrink: 0,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {fmtNum(f.totalPackets)} pkts
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Panel Header ───────────────────────────────────────────────────────────────
function PanelHeader({ label, accent, right }: { label: string; accent: string; right?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '9px 14px',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 2, height: 11, borderRadius: 1, background: accent }} />
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--text3)',
        }}>
          {label}
        </span>
      </div>
      {right}
    </div>
  )
}

// ── StatsPanel ─────────────────────────────────────────────────────────────────
export function StatsPanel() {
  const stats      = useStore((s) => s.stats)
  const packets    = useStore((s) => s.packets)
  const ppsHistory = useStore((s) => s.ppsHistory)
  const bpsHistory = useStore((s) => s.bpsHistory)

  const ppsFormatter = useCallback(fmtRate,  [])
  const bpsFormatter = useCallback(fmtBytes, [])

  const topApps = useMemo<[string, number][]>(() => {
    const c: Record<string, number> = {}
    packets.forEach((p) => {
      const k = p.application || 'UNKNOWN'
      c[k] = (c[k] || 0) + 1
    })
    return Object.entries(c).sort(([, a], [, b]) => b - a).slice(0, 6) as [string, number][]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packets.length > 0 ? packets[0]?.id : 0])

  const protoOther = Math.max(0,
    stats.totalPackets - stats.tcpPackets - stats.udpPackets - stats.icmpPackets
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <PanelHeader
        label="Statistics"
        accent="var(--cyan)"
        right={
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            fontWeight: 600,
            color: 'var(--green)',
            letterSpacing: '0.08em',
          }}>
            ● live
          </span>
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>

        {/* Primary stat cards — 2-col grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <StatCard label="TOTAL"   value={fmtNum(stats.totalPackets)}      accent="cyan"   />
          <StatCard label="BLOCKED" value={fmtNum(stats.blockedPackets)}    accent="red"    />
          <StatCard label="TCP"     value={fmtNum(stats.tcpPackets)}        accent="cyan"   />
          <StatCard label="UDP"     value={fmtNum(stats.udpPackets)}        accent="amber"  />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <StatCard label="BYTES"   value={fmtBytes(stats.totalBytes)}         accent="purple" />
          <StatCard label="DROPPED" value={fmtNum(stats.droppedFromBuffer)}    accent="amber"  />
        </div>

        {/* Sparklines */}
        <Sparkline label="Packets / sec" history={ppsHistory} color="var(--cyan)"  fmtFn={ppsFormatter} />
        <Sparkline label="Bytes / sec"   history={bpsHistory} color="var(--green)" fmtFn={bpsFormatter} />

        {/* Protocol distribution */}
        {stats.totalPackets > 0 && (
          <div style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 7,
            padding: '10px 12px',
          }}>
            <SectionLabel accent="var(--amber)">Protocol Distribution</SectionLabel>
            <ProtoBar
              tcp={stats.tcpPackets}
              udp={stats.udpPackets}
              icmp={stats.icmpPackets}
              other={protoOther}
            />
          </div>
        )}

        {/* App breakdown donut */}
        {topApps.length > 0 && (
          <div style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 7,
            padding: '10px 12px',
          }}>
            <SectionLabel accent="var(--cyan)">Application Breakdown</SectionLabel>
            <AppDonut counts={topApps} total={stats.totalPackets ?? 0} />
          </div>
        )}

        {/* Active flows */}
        <div>
          <SectionLabel accent="var(--green)">Active Flows</SectionLabel>
          <FlowList />
        </div>

      </div>
    </div>
  )
}
