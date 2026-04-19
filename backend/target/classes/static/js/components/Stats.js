/**
 * Stats.js — Left panel: metric cards, live sparkline charts, app donut, flow list.
 * Exposed as window.Stats.
 */

const { useEffect, useRef, useMemo } = React;

const CHART_COLORS = ['#00c8e8','#00e5a0','#ffaa00','#a78bfa','#ff4d6d','#38bdf8','#fb7185'];

function fmtNum(n)   { return (n ?? 0).toLocaleString(); }
function fmtBytes(n) {
  if (!n) return '0 B';
  if (n < 1024)    return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}
function fmtRate(n) {
  if (!n) return '0/s';
  if (n < 1000) return n + '/s';
  return (n / 1000).toFixed(1) + 'k/s';
}

// ── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, sub }) {
  return (
    <div className={`stat-card ${color}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${color}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

// ── SparklineChart ────────────────────────────────────────────────────────────
function SparklineChart({ label, history, color, fmt }) {
  const ref  = useRef(null);
  const inst = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const labels = history.map((_, i) => i);
    const data   = [...history];

    if (inst.current) {
      inst.current.data.labels                   = labels;
      inst.current.data.datasets[0].data         = data;
      inst.current.data.datasets[0].borderColor  = color;
      inst.current.data.datasets[0].pointBackgroundColor = color;
      inst.current.update('none');
      return;
    }

    inst.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: color,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 3,
          pointBackgroundColor: color,
          fill: true,
          backgroundColor: color.replace(')', ', 0.08)').replace('rgb', 'rgba'),
          tension: 0.4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: (ctx) => ` ${fmt ? fmt(ctx.raw) : ctx.raw}` },
          backgroundColor: '#0d1220',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          bodyColor: '#e8edf5',
          padding: 6,
        }},
        scales: {
          x: { display: false },
          y: { display: false, beginAtZero: true },
        },
      },
    });

    return () => {
      if (inst.current) { inst.current.destroy(); inst.current = null; }
    };
  }, [history.join(','), color]);

  const current = history[history.length - 1] ?? 0;

  return (
    <div className="sparkline-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span className="stat-label">{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color }}>{fmt ? fmt(current) : current}</span>
      </div>
      <div style={{ height: 36, position: 'relative' }}>
        <canvas ref={ref} role="img" aria-label={`${label} sparkline`}>{current}</canvas>
      </div>
    </div>
  );
}

// ── AppDonut ──────────────────────────────────────────────────────────────────
function AppDonut({ topApps, totalPackets }) {
  const ref  = useRef(null);
  const inst = useRef(null);
  const key  = topApps.map(([k, v]) => `${k}:${v}`).join(',');

  useEffect(() => {
    if (!ref.current || topApps.length === 0) return;
    const labels = topApps.map(([k]) => k);
    const data   = topApps.map(([, v]) => v);
    const colors = CHART_COLORS.slice(0, data.length);

    if (inst.current) {
      inst.current.data.labels                      = labels;
      inst.current.data.datasets[0].data            = data;
      inst.current.data.datasets[0].backgroundColor = colors;
      inst.current.update('none');
      return;
    }

    inst.current = new Chart(ref.current, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw}` },
            backgroundColor: '#0d1220', borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1, bodyColor: '#e8edf5', padding: 8,
          },
        },
      },
    });
    return () => { if (inst.current) { inst.current.destroy(); inst.current = null; } };
  }, [key]);

  return (
    <>
      <div style={{ height: 130, position: 'relative', marginBottom: 8 }}>
        <canvas ref={ref} role="img" aria-label="Application breakdown">
          {topApps.map(([k, v]) => `${k}: ${v}`).join(', ')}
        </canvas>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {topApps.map(([k, v], i) => {
          const pct = totalPackets > 0 ? ((v / totalPackets) * 100).toFixed(1) : '0.0';
          return (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: CHART_COLORS[i], flexShrink: 0 }} />
              <span style={{ flex: 1, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
              <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>{pct}%</span>
              <span style={{ color: 'var(--text-dim)', fontSize: 10, minWidth: 24, textAlign: 'right' }}>{v}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── FlowList ──────────────────────────────────────────────────────────────────
function FlowList({ flows }) {
  if (!flows.length) return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', padding: '10px 0' }}>
      No active flows
    </div>
  );
  return (
    <div className="flow-list">
      {flows.slice(0, 10).map((f, i) => {
        const proto = (f.key?.protocol || f.protocol || 'TCP');
        const sni   = f.sni || f.application;
        return (
          <div key={i} className="flow-item">
            <div className="flow-route">
              <span style={{ color: 'var(--text-primary)', fontSize: 11 }}>{f.key?.srcIp || f.srcIp}</span>
              <span className="flow-arrow">→</span>
              <span style={{ color: 'var(--text-primary)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.key?.dstIp || f.dstIp}</span>
            </div>
            <div className="flow-meta">
              <span className={`badge badge-${proto.toLowerCase()}`}>{proto}</span>
              {sni && <span style={{ color: 'var(--cyan)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90 }}>{sni}</span>}
              {f.blocked && <span className="badge badge-blocked">blocked</span>}
              <span className="flow-count">{fmtNum(f.totalPackets)} pkts</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Stats (main export) ───────────────────────────────────────────────────────
window.Stats = function Stats({ stats, flows, packets, ppsHistory, bpsHistory }) {
  const appCounts = useMemo(() => {
    const counts = {};
    packets.forEach(p => { const k = p.application || 'UNKNOWN'; counts[k] = (counts[k] || 0) + 1; });
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 6);
  }, [packets.length > 0 ? packets[0]?.id : 0]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <div className="panel-title-accent" style={{ background: 'var(--cyan)' }} />
          Statistics
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>live</span>
      </div>
      <div className="panel-body">

        {/* Primary counters */}
        <div className="stats-grid" style={{ marginBottom: 10 }}>
          <StatCard label="TOTAL"   value={fmtNum(stats.totalPackets)}   color="cyan" />
          <StatCard label="BLOCKED" value={fmtNum(stats.blockedPackets)} color="red" />
          <StatCard label="FLOWS"   value={fmtNum(stats.activeFlows)}    color="green" />
          <StatCard label="DROPPED" value={fmtNum(stats.droppedPackets)} color="amber" />
        </div>
        <div className="stats-grid" style={{ marginBottom: 12 }}>
          <StatCard label="TCP"     value={fmtNum(stats.tcpPackets)}     color="cyan" />
          <StatCard label="UDP"     value={fmtNum(stats.udpPackets)}     color="amber" />
          <StatCard label="BYTES"   value={fmtBytes(stats.totalBytes)}   color="purple" />
          <StatCard label="BUF"     value={fmtNum(stats.bufferedPackets)} color="green" />
        </div>

        {/* Live sparklines */}
        <SparklineChart label="Packets / sec" history={ppsHistory} color="#00c8e8" fmt={fmtRate} />
        <div style={{ height: 8 }} />
        <SparklineChart label="Bytes / sec"   history={bpsHistory} color="#00e5a0" fmt={fmtBytes} />

        {/* App breakdown */}
        {appCounts.length > 0 && (
          <>
            <div className="divider" style={{ margin: '12px 0 10px' }} />
            <div className="section-label">Application Breakdown</div>
            <AppDonut topApps={appCounts} totalPackets={stats.totalPackets} />
          </>
        )}

        {/* Active flows */}
        <div className="divider" style={{ margin: '12px 0 8px' }} />
        <div className="section-label">Active Flows ({flows.length})</div>
        <FlowList flows={flows} />
      </div>
    </div>
  );
};
