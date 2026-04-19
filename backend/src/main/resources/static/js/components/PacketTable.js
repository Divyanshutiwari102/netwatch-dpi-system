/**
 * PacketTable.js — Center panel with virtual scroll, search, hover tooltip, CSV export.
 * Exposed as window.PacketTable.
 *
 * ─── Virtual scroll ───────────────────────────────────────────────────────────
 * Rendering 500 <tr> rows on every WebSocket batch update (up to 3/sec) was
 * causing the browser to re-layout the entire table.  With virtual scroll we:
 *   1. Measure the scroll container height → visible rows = floor(height / ROW_H)
 *   2. Calculate startIndex from scrollTop
 *   3. Render only VISIBLE + OVERSCAN rows
 *   4. Pad top/bottom with empty <div> blocks of the correct height
 *
 * This means 500 packets in state = ~14 DOM rows at any time regardless.
 *
 * ─── Hover tooltip ────────────────────────────────────────────────────────────
 * onMouseEnter on <tr> stores the packet in `hovered` state.
 * A positioned div (pointer-events:none) renders the detail card next to the row.
 */

const { useState, useRef, useCallback, useEffect, useMemo } = React;

const ROW_H  = 32;   // px — matches CSS td padding
const OVERSCAN = 6;  // extra rows above/below visible area

const PROTO_COLORS = { TCP: 'badge-tcp', UDP: 'badge-udp', ICMP: 'badge-icmp', OTHER: 'badge-new' };

function fmtTime(ts) {
  if (!ts) return '--';
  const d = new Date(typeof ts === 'number' ? ts : ts);
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}
function fmtBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

function ProtoBadge({ proto }) {
  return <span className={`proto-badge ${PROTO_COLORS[proto] || 'badge-new'}`}>{proto || '?'}</span>;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function Tooltip({ packet, y }) {
  if (!packet) return null;
  const rows = [
    ['ID',          packet.id],
    ['Time',        fmtTime(packet.capturedAt ?? packet.capturedAtMs)],
    ['Src IP',      packet.srcIp],
    ['Src Port',    packet.srcPort],
    ['Dst IP',      packet.dstIp],
    ['Dst Port',    packet.dstPort],
    ['Protocol',    packet.protocol],
    ['Application', packet.application || '--'],
    ['SNI',         packet.sni || '--'],
    ['Size',        fmtBytes(packet.totalBytes)],
    ['Status',      packet.blocked ? `BLOCKED (${packet.blockedBy || 'rule'})` : 'ALLOWED'],
  ].filter(([, v]) => v !== undefined && v !== null);

  return (
    <div className="packet-tooltip" style={{ top: Math.min(y, window.innerHeight - 280) }}>
      {rows.map(([k, v]) => (
        <div key={k} className="tooltip-row">
          <span className="tooltip-key">{k}</span>
          <span className="tooltip-val" style={k === 'Status' && packet.blocked ? { color: 'var(--red)' } : {}}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
window.PacketTable = function PacketTable({ packets, liveTexts }) {
  const [filterSrcIp,   setFilterSrcIp]   = useState('');
  const [filterDstIp,   setFilterDstIp]   = useState('');
  const [filterProto,   setFilterProto]   = useState('');
  const [filterPort,    setFilterPort]    = useState('');
  const [filterApp,     setFilterApp]     = useState('');
  const [filterBlocked, setFilterBlocked] = useState(false);
  const [searchText,    setSearchText]    = useState('');
  const [scrollTop,     setScrollTop]     = useState(0);
  const [containerH,    setContainerH]    = useState(400);
  const [hovered,       setHovered]       = useState(null);
  const [tooltipY,      setTooltipY]      = useState(0);

  const scrollRef   = useRef(null);
  const containerRef = useRef(null);

  // Observe container height for responsive virtual scroll
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerH(entry.contentRect.height);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Unique app names for the filter dropdown
  const appNames = useMemo(() => {
    const s = new Set();
    packets.forEach(p => { if (p.application) s.add(p.application); });
    return [...s].sort();
  }, [packets.length]);

  // Filter
  const filtered = useMemo(() => {
    return packets.filter(p => {
      if (filterSrcIp   && !(p.srcIp || '').includes(filterSrcIp))   return false;
      if (filterDstIp   && !(p.dstIp || '').includes(filterDstIp))   return false;
      if (filterProto   && p.protocol !== filterProto)                return false;
      if (filterApp     && p.application !== filterApp)               return false;
      if (filterPort) {
        const port = parseInt(filterPort, 10);
        if (p.srcPort !== port && p.dstPort !== port)                  return false;
      }
      if (filterBlocked && !p.blocked)                                return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        const hit = (p.srcIp || '').includes(q)
          || (p.dstIp || '').includes(q)
          || (p.sni || '').toLowerCase().includes(q)
          || (p.application || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [packets, filterSrcIp, filterDstIp, filterProto, filterApp, filterPort, filterBlocked, searchText]);

  // Virtual scroll math
  const totalH      = filtered.length * ROW_H;
  const visibleRows = Math.ceil(containerH / ROW_H);
  const startIdx    = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const endIdx      = Math.min(filtered.length, startIdx + visibleRows + OVERSCAN * 2);
  const paddingTop  = startIdx * ROW_H;
  const paddingBot  = Math.max(0, (filtered.length - endIdx) * ROW_H);
  const visible     = filtered.slice(startIdx, endIdx);

  const handleScroll = useCallback(e => setScrollTop(e.currentTarget.scrollTop), []);

  // CSV export
  const exportCsv = useCallback(() => {
    const header = 'Time,Src IP,Src Port,Dst IP,Dst Port,Protocol,Application,SNI,Size,Blocked,Blocked By';
    const rows = filtered.map(p => [
      fmtTime(p.capturedAt ?? p.capturedAtMs),
      p.srcIp, p.srcPort, p.dstIp, p.dstPort,
      p.protocol, p.application || '', p.sni || '',
      p.totalBytes, p.blocked, p.blockedBy || '',
    ].map(v => `"${v ?? ''}"`).join(','));
    const csv  = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `packets_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  const clearFilters = useCallback(() => {
    setFilterSrcIp(''); setFilterDstIp(''); setFilterProto('');
    setFilterPort(''); setFilterApp(''); setFilterBlocked(false); setSearchText('');
  }, []);

  const hasFilter = filterSrcIp || filterDstIp || filterProto || filterPort || filterApp || filterBlocked || searchText;

  return (
    <div className="center-panel">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="table-toolbar">
        <span className="toolbar-label">Packets</span>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', fontSize: 11, pointerEvents: 'none' }}>⌕</span>
          <input
            className="filter-input search-input"
            placeholder="Search IP, domain, app…"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ paddingLeft: 22, width: 160 }}
          />
        </div>

        <input className="filter-input" placeholder="Src IP"  value={filterSrcIp}  onChange={e => setFilterSrcIp(e.target.value)}  style={{ width: 100 }} />
        <input className="filter-input" placeholder="Dst IP"  value={filterDstIp}  onChange={e => setFilterDstIp(e.target.value)}  style={{ width: 100 }} />

        <select className="filter-select" value={filterProto} onChange={e => setFilterProto(e.target.value)}>
          <option value="">All Proto</option>
          <option value="TCP">TCP</option>
          <option value="UDP">UDP</option>
          <option value="ICMP">ICMP</option>
        </select>

        <select className="filter-select" value={filterApp} onChange={e => setFilterApp(e.target.value)} style={{ maxWidth: 110 }}>
          <option value="">All Apps</option>
          {appNames.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <input className="filter-input" placeholder="Port" value={filterPort} onChange={e => setFilterPort(e.target.value)} style={{ width: 56 }} />

        <button className={`filter-toggle ${filterBlocked ? 'active' : ''}`} onClick={() => setFilterBlocked(v => !v)}>
          ⛔ Blocked
        </button>

        {hasFilter && (
          <button className="filter-toggle" onClick={clearFilters} style={{ color: 'var(--text-dim)', borderColor: 'var(--border)' }}>
            ✕ Clear
          </button>
        )}

        <div className="toolbar-spacer" />
        <span className="packet-count-badge">{filtered.length.toLocaleString()}/{packets.length.toLocaleString()}</span>
        <button className="btn btn-action" onClick={exportCsv} title="Export visible packets to CSV" style={{ padding: '4px 10px' }}>
          ↓ CSV
        </button>
      </div>

      {/* ── Virtual Table ────────────────────────────────────────────────── */}
      <div
        className="table-wrap"
        ref={containerRef}
        onMouseLeave={() => setHovered(null)}
        style={{ position: 'relative' }}
      >
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">◈</div>
            <div>{packets.length === 0 ? 'No packets yet' : 'No packets match filters'}</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>
              {packets.length === 0 ? 'Start capture to see live traffic' : 'Try adjusting or clearing the filters'}
            </div>
          </div>
        ) : (
          <div
            ref={scrollRef}
            style={{ overflowY: 'auto', height: '100%' }}
            onScroll={handleScroll}
          >
            <table>
              <thead>
                <tr>
                  <th style={{ width: 88 }}>Time</th>
                  <th style={{ width: 115 }}>Source</th>
                  <th style={{ width: 115 }}>Destination</th>
                  <th style={{ width: 52 }}>Proto</th>
                  <th style={{ width: 90 }}>Ports</th>
                  <th>Application</th>
                  <th style={{ width: 66, textAlign: 'right' }}>Size</th>
                  <th style={{ width: 78 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {/* Top padding spacer */}
                {paddingTop > 0 && <tr style={{ height: paddingTop }}><td colSpan={8} /></tr>}

                {visible.map((p, localIdx) => {
                  const globalIdx = startIdx + localIdx;
                  return (
                    <tr
                      key={p.id ?? globalIdx}
                      className={p.blocked ? 'blocked-row' : ''}
                      onMouseEnter={e => { setHovered(p); setTooltipY(e.currentTarget.getBoundingClientRect().top); }}
                    >
                      <td className="time-cell">{fmtTime(p.capturedAt ?? p.capturedAtMs)}</td>
                      <td className="ip-cell">{p.srcIp || '--'}</td>
                      <td className="ip-cell">{p.dstIp || '--'}</td>
                      <td><ProtoBadge proto={p.protocol} /></td>
                      <td style={{ color: 'var(--text-dim)', fontSize: 10 }}>
                        {p.srcPort && p.dstPort ? `${p.srcPort}→${p.dstPort}` : '--'}
                      </td>
                      <td className="app-cell">{p.application || p.sni || '--'}</td>
                      <td className="size-cell">{p.totalBytes ? fmtBytes(p.totalBytes) : '--'}</td>
                      <td>
                        {p.blocked
                          ? <span className="blocked-chip">⛔ {(p.blockedBy || '').split(':')[0] || 'RULE'}</span>
                          : <span className="allowed-chip">✓</span>
                        }
                      </td>
                    </tr>
                  );
                })}

                {/* Bottom padding spacer */}
                {paddingBot > 0 && <tr style={{ height: paddingBot }}><td colSpan={8} /></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* Hover tooltip — pointer-events:none so it doesn't interfere with mouse */}
        {hovered && <Tooltip packet={hovered} y={tooltipY} />}
      </div>

      {/* ── Live ticker ──────────────────────────────────────────────────── */}
      <div className="live-bar">
        <div className="live-bar-inner">
          {liveTexts.length > 0
            ? liveTexts.concat(liveTexts).map((t, i) => (
                <span key={i} style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <span>{t}</span><span className="live-item-sep">◆</span>
                </span>
              ))
            : <span style={{ paddingLeft: 20, color: 'var(--text-dim)' }}>Waiting for traffic…</span>
          }
        </div>
      </div>
    </div>
  );
};
