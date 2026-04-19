'use client'

import { useWebSocket } from '@/hooks/useWebSocket'
import { usePolling } from '@/hooks/usePolling'
import { Header } from '@/components/layout/Header'
import { Toasts } from '@/components/layout/Toasts'
import { StatsPanel } from '@/components/stats/StatsPanel'
import { PacketTable } from '@/components/packets/PacketTable'
import { ControlsPanel } from '@/components/controls/ControlsPanel'

function DashboardProviders() {
  useWebSocket()
  const { refresh } = usePolling()
  return <DashboardLayout refresh={refresh} />
}

function DashboardLayout({ refresh }: { refresh: () => Promise<void> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg0)' }}>
      <Header />

      <div
        style={{
          flex: 1,
          display: 'grid',
          // LEFT: fixed stats, CENTER: dominant packet area, RIGHT: narrower controls
          gridTemplateColumns: '272px 1fr 264px',
          gap: '1px',
          background: 'var(--divider)',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* LEFT — Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg1)' }}>
          <StatsPanel />
        </div>

        {/* CENTER — Packet table (dominant) */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg0)' }}>
          <PacketTable />
        </div>

        {/* RIGHT — Controls (no overflow:hidden — portal dropdown must escape) */}
        <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg1)', minHeight: 0 }}>
          <ControlsPanel onRefresh={refresh} />
        </div>
      </div>

      <Toasts />
    </div>
  )
}

export default function DashboardPage() {
  return <DashboardProviders />
}
