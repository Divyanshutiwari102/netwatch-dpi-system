/**
 * app.js — Root React application.
 *
 * State managed here:
 *   packets      — ring buffer of last MAX_PACKETS WsPacketSummary objects
 *   flows        — active flow list from REST poll
 *   rules        — active rule list from REST poll
 *   captureStatus — engine status from REST poll
 *   stats         — aggregate stats from REST poll
 *   ppsHistory    — last 60 pps readings (1/sec from stats poll)
 *   bpsHistory    — last 60 bps readings
 *   liveTexts     — ticker bar texts for classified packets
 *   wsState       — 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'
 */

const { useState, useEffect, useRef, useCallback, useMemo } = React;

const MAX_PACKETS      = 500;
const POLL_MS          = 2000;
const HISTORY_LEN      = 60;    // data points on sparkline

// ── Header ────────────────────────────────────────────────────────────────────
function Header({ wsState, retryCount, captureStatus, stats, rules }) {
  const isLive = captureStatus?.running;
  const dot    = wsState === 'CONNECTED' ? 'ws-connected' : wsState === 'CONNECTING' ? 'ws-connecting' : 'ws-disconnected';
  const label  = wsState === 'CONNECTED' ? (isLive ? 'CAPTURING' : 'CONNECTED')
               : wsState === 'CONNECTING' ? 'CONNECTING...' : 'DISCONNECTED';

  const fmt = n => (n ?? 0).toLocaleString();

  const chips = [
    { label: 'pkts',    value: fmt(stats.totalPackets),   cls: 'cyan'  },
    { label: 'pps',     value: fmt(stats.packetsPerSecond || 0) + '/s', cls: 'cyan'  },
    { label: 'flows',   value: fmt(stats.activeFlows),    cls: 'green' },
    { label: 'blocked', value: fmt(stats.blockedPackets), cls: 'red'   },
    { label: 'dropped', value: fmt(stats.droppedPackets), cls: 'amber' },
    { label: 'rules',   value: rules.length,              cls: ''      },
    { label: 'ws',      value: wsState === 'CONNECTED' ? 'OK' : 'ERR', cls: wsState === 'CONNECTED' ? 'green' : 'red' },
  ];

  return (
    <div className="header">
      <div className="logo"><span className="logo-bracket">[</span>NetWatch<span className="logo-bracket">]</span></div>
      <div className={`pulse-dot ${dot}`} />
      <span className={`status-text ${wsState.toLowerCase()}`}>{label}</span>
      {wsState === 'DISCONNECTED' && retryCount > 0 && <span className="ws-retry-badge">retry #{retryCount}</span>}
      <div className="header-spacer" />
      <div className="header-stats">
        {chips.map(c => (
          <div key={c.label} className="hstat">
            <span className="hstat-label">{c.label}</span>
            <span className={`hstat-value ${c.cls}`}>{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toasts({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span>{t.type === 'success' ? '✓' : t.type === 'error' ? '✗' : '●'}</span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  const [packets,        setPackets]        = useState([]);
  const [flows,          setFlows]          = useState([]);
  const [rules,          setRules]          = useState([]);
  const [captureStatus,  setCaptureStatus]  = useState(null);
  const [stats,          setStats]          = useState({});
  const [ppsHistory,     setPpsHistory]     = useState(Array(HISTORY_LEN).fill(0));
  const [bpsHistory,     setBpsHistory]     = useState(Array(HISTORY_LEN).fill(0));
  const [wsState,        setWsState]        = useState('CONNECTING');
  const [wsRetry,        setWsRetry]        = useState(0);
  const [liveTexts,      setLiveTexts]      = useState([]);
  const [toasts,         setToasts]         = useState([]);

  const wsRef     = useRef(null);
  const toastRefs = useRef({});

  // ── Toast ──────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    toastRefs.current[id] = setTimeout(() => {
      setToasts(t => t.filter(x => x.id !== id));
      delete toastRefs.current[id];
    }, 3500);
  }, []);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const ws = window.WS.createWebSocketManager({
      // onPacket receives one packet at a time — websocket.js unpacks the batch
      onPacket: (pkt) => {
        setPackets(prev => {
          const next = [pkt, ...prev];
          return next.length > MAX_PACKETS ? next.slice(0, MAX_PACKETS) : next;
        });
        const label = pkt.sni || pkt.application;
        if (label) {
          setLiveTexts(prev => {
            const next = [`${pkt.srcIp} → ${pkt.dstIp} [${label}]`, ...prev];
            return next.length > 25 ? next.slice(0, 25) : next;
          });
        }
      },
      onStateChange: (state, retry) => {
        setWsState(state);
        setWsRetry(retry);
        if (state === 'CONNECTED'    && retry > 0) showToast('WebSocket reconnected',          'success');
        if (state === 'DISCONNECTED')               showToast('WebSocket disconnected — retrying…', 'error');
      },
    });
    wsRef.current = ws;
    ws.connect();
    return () => ws.disconnect();
  }, []); // eslint-disable-line

  // ── REST polling ───────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const [sRes, statsRes, flowsRes, rulesRes] = await Promise.allSettled([
      window.API.capture.status(),
      window.API.packets.stats(),
      window.API.flows.list(30),
      window.API.rules.list(),
    ]);

    if (sRes.status === 'fulfilled') {
      const s = sRes.value;
      setCaptureStatus(s);
    }
    if (statsRes.status === 'fulfilled') {
      const s = statsRes.value;
      setStats(prev => ({ ...prev, ...s }));
      // Update sparkline history
      setPpsHistory(h => { const n = [...h.slice(1), s.packetsPerSecond ?? 0]; return n; });
      setBpsHistory(h => { const n = [...h.slice(1), s.bytesPerSecond   ?? 0]; return n; });
    }
    if (flowsRes.status === 'fulfilled') {
      const list = Array.isArray(flowsRes.value) ? flowsRes.value : [];
      setFlows(list);
      setStats(prev => ({ ...prev, activeFlows: list.length }));
    }
    if (rulesRes.status === 'fulfilled') {
      setRules(Array.isArray(rulesRes.value) ? rulesRes.value : []);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, POLL_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  // ── Capture actions ────────────────────────────────────────────────────────
  const startLive = async () => {
    try   { await window.API.capture.startLive(); showToast('Live capture started', 'success'); fetchAll(); }
    catch (e) { showToast(`Start failed: ${e.message}`, 'error'); }
  };
  const startFile = async (path) => {
    if (!path.trim()) { showToast('Enter a PCAP file path', 'error'); return; }
    try   { await window.API.capture.startFile(path); showToast('File capture started', 'success'); fetchAll(); }
    catch (e) { showToast(`Start failed: ${e.message}`, 'error'); }
  };
  const stopCapture = async () => {
    try   { await window.API.capture.stop(); showToast('Capture stopped', 'info'); fetchAll(); }
    catch (e) { showToast(`Stop failed: ${e.message}`, 'error'); }
  };

  // ── Rule actions ───────────────────────────────────────────────────────────
  const addRule    = async (type, value, desc) => {
    try   { await window.API.rules.add(type, value, desc); showToast(`Rule added: ${value}`, 'success'); fetchAll(); }
    catch (e) { showToast(`Add rule failed: ${e.message}`, 'error'); }
  };
  const removeRule = async (id) => {
    try   { await window.API.rules.remove(id); showToast('Rule removed', 'info'); fetchAll(); }
    catch (e) { showToast(`Remove failed: ${e.message}`, 'error'); }
  };

  const mergedStats = useMemo(() => ({
    ...stats,
    droppedPackets: captureStatus?.droppedPackets ?? 0,
  }), [stats, captureStatus]);

  return (
    <>
      <Header wsState={wsState} retryCount={wsRetry} captureStatus={captureStatus} stats={mergedStats} rules={rules} />
      <div className="main">
        <Stats  stats={mergedStats} flows={flows} packets={packets} ppsHistory={ppsHistory} bpsHistory={bpsHistory} />
        <PacketTable packets={packets} liveTexts={liveTexts} />
        <Controls captureStatus={captureStatus} onStartLive={startLive} onStartFile={startFile} onStop={stopCapture} rules={rules} onAddRule={addRule} onRemoveRule={removeRule} />
      </div>
      <Toasts toasts={toasts} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
