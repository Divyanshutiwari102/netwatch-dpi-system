'use client'

import { useStore } from '@/store'
import { Input, Select, Button } from '@/components/ui'
import { buildExportUrl } from '@/lib/utils'

interface Props {
  totalCount:    number
  filteredCount: number
  appNames:      string[]
  autoScroll:    boolean
  onToggleAutoScroll: () => void
}

export function FilterBar({ totalCount, filteredCount, appNames, autoScroll, onToggleAutoScroll }: Props) {
  const filter    = useStore((s) => s.filter)
  const setFilter = useStore((s) => s.setFilter)

  const hasFilter =
    filter.search || filter.srcIp || filter.dstIp ||
    filter.protocol || filter.port || filter.app || filter.blockedOnly

  const isFiltered = filteredCount !== totalCount

  function handleExport() {
    const port = parseInt(filter.port, 10)
    const url = buildExportUrl({
      srcIp:    filter.srcIp    || undefined,
      dstIp:    filter.dstIp    || undefined,
      protocol: filter.protocol || undefined,
      dstPort:  Number.isFinite(port) ? port : undefined,
      blocked:  filter.blockedOnly || undefined,
    })

    const a = document.createElement('a')
    a.href = url
    a.download = `netwatch-${new Date().toISOString().slice(0,19).replace(/[T:]/g, '-')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div
      className="flex items-center flex-wrap shrink-0"
      style={{
        gap: 6,
        padding: '7px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg1)',
        minHeight: 42,
      }}
    >
      {/* Search */}
      <div className="relative">
        <span
          className="absolute pointer-events-none select-none"
          style={{
            left: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text3)',
            fontSize: 12,
          }}
        >
          ⌕
        </span>
        <Input
          placeholder="Search IP, domain, app…"
          value={filter.search}
          onChange={(e) => setFilter({ search: e.target.value })}
          style={{ paddingLeft: 24, width: 160 }}
        />
      </div>

      <div style={{ width: 1, height: 18, background: 'var(--border)' }} />

      <Input
        placeholder="Src IP"
        value={filter.srcIp}
        onChange={(e) => setFilter({ srcIp: e.target.value })}
        style={{ width: 100 }}
      />
      <Input
        placeholder="Dst IP"
        value={filter.dstIp}
        onChange={(e) => setFilter({ dstIp: e.target.value })}
        style={{ width: 100 }}
      />

      <Select
        value={filter.protocol}
        onChange={(e) => setFilter({ protocol: e.target.value })}
        style={{ width: 92 }}
      >
        <option value="">All Proto</option>
        <option value="TCP">TCP</option>
        <option value="UDP">UDP</option>
        <option value="ICMP">ICMP</option>
      </Select>

      {appNames.length > 0 && (
        <Select
          value={filter.app}
          onChange={(e) => setFilter({ app: e.target.value })}
          style={{ maxWidth: 130 }}
        >
          <option value="">All Apps</option>
          {appNames.map((a) => <option key={a}>{a}</option>)}
        </Select>
      )}

      <Input
        placeholder="Port"
        value={filter.port}
        onChange={(e) => setFilter({ port: e.target.value })}
        style={{ width: 60 }}
      />

      <button
        onClick={() => setFilter({ blockedOnly: !filter.blockedOnly })}
        style={{
          height: 26,
          padding: '0 10px',
          borderRadius: 5,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.1s',
          background:  filter.blockedOnly ? 'var(--red-dim)' : 'transparent',
          border:      `1px solid ${filter.blockedOnly ? 'rgba(240,80,96,0.35)' : 'var(--border)'}`,
          color:       filter.blockedOnly ? 'var(--red)' : 'var(--text3)',
        }}
      >
        {filter.blockedOnly ? '✕' : '◯'} Blocked
      </button>

      {hasFilter && (
        <button
          onClick={() => setFilter({ search: '', srcIp: '', dstIp: '', protocol: '', port: '', app: '', blockedOnly: false })}
          style={{
            height: 26,
            padding: '0 10px',
            borderRadius: 5,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            cursor: 'pointer',
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text3)',
            transition: 'color 0.1s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text1)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text3)')}
        >
          ✕ Clear
        </button>
      )}

      <div style={{ flex: 1 }} />

      {/* Packet count */}
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--text3)',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}>
        {isFiltered
          ? <><span style={{ color: 'var(--text2)', fontWeight: 600 }}>{filteredCount.toLocaleString()}</span>
             <span style={{ opacity: 0.5 }}> / {totalCount.toLocaleString()}</span></>
          : <span style={{ color: 'var(--text3)' }}>{totalCount.toLocaleString()} pkts</span>
        }
      </span>

      {/* Auto-scroll toggle */}
      <button
        onClick={onToggleAutoScroll}
        title={autoScroll ? 'Auto-scroll ON — click to disable' : 'Auto-scroll OFF — click to enable'}
        style={{
          height: 26,
          padding: '0 9px',
          borderRadius: 5,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.1s',
          background: autoScroll ? 'var(--green-dim)' : 'transparent',
          border:     `1px solid ${autoScroll ? 'rgba(0,201,132,0.28)' : 'var(--border)'}`,
          color:      autoScroll ? 'var(--green)' : 'var(--text3)',
        }}
      >
        ↓ Auto
      </button>

      {/* Export */}
      <Button
        variant="action"
        size="sm"
        onClick={handleExport}
        disabled={totalCount === 0}
        title="Export as CSV"
      >
        ↓ CSV
      </Button>
    </div>
  )
}
