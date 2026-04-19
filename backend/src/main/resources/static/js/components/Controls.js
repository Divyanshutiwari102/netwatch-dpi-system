/**
 * Controls.js — Right panel: capture engine controls + blocking rules.
 * Exposed as window.Controls.
 */

const { useState: useStateC } = React;

const RULE_TYPE_CLASS = {
  BLOCK_IP: 'rule-type-ip', BLOCK_DOMAIN: 'rule-type-domain',
  BLOCK_PORT: 'rule-type-port', BLOCK_PROTOCOL: 'rule-type-protocol',
};
const RULE_TYPE_LABEL = { BLOCK_IP: 'IP', BLOCK_DOMAIN: 'DOMAIN', BLOCK_PORT: 'PORT', BLOCK_PROTOCOL: 'PROTO' };
const RULE_PLACEHOLDERS = { BLOCK_IP: '192.168.1.50', BLOCK_DOMAIN: '*.tiktok.com', BLOCK_PORT: '3306', BLOCK_PROTOCOL: 'UDP' };

window.Controls = function Controls({ captureStatus, onStartLive, onStartFile, onStop, rules, onAddRule, onRemoveRule }) {
  const [mode,      setMode]      = useStateC('live');
  const [filePath,  setFilePath]  = useStateC('');
  const [ruleType,  setRuleType]  = useStateC('BLOCK_IP');
  const [ruleValue, setRuleValue] = useStateC('');
  const [ruleDesc,  setRuleDesc]  = useStateC('');

  const isRunning = captureStatus?.running;

  const handleStart   = () => { if (mode === 'file') onStartFile(filePath); else onStartLive(); };
  const handleAddRule = () => {
    if (!ruleValue.trim()) return;
    onAddRule(ruleType, ruleValue.trim(), ruleDesc.trim());
    setRuleValue(''); setRuleDesc('');
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <div className="panel-title-accent" style={{ background: 'var(--green)' }} />
          Control
        </div>
      </div>
      <div className="panel-body">

        {/* ── Capture ──────────────────────────────────────────────────── */}
        <div className="section-label">Capture Engine</div>
        <div className="capture-section">
          <div className="capture-mode-tabs">
            {['live', 'file'].map(m => (
              <button key={m} className={`mode-tab ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
                {m === 'live' ? 'Live' : 'PCAP File'}
              </button>
            ))}
          </div>

          {mode === 'file' && (
            <div className="form-row" style={{ marginBottom: 8 }}>
              <input className="form-input" placeholder="/path/to/capture.pcap" value={filePath} onChange={e => setFilePath(e.target.value)} />
            </div>
          )}

          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-start" disabled={isRunning}  onClick={handleStart} style={{ flex: 1 }}>▶ START</button>
            <button className="btn btn-stop"  disabled={!isRunning} onClick={onStop}      style={{ flex: 1 }}>■ STOP</button>
          </div>

          {captureStatus && (
            <div style={{
              marginTop: 10, background: 'var(--bg3)', borderRadius: 5,
              padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 10,
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              {[
                ['Status',  isRunning ? '● LIVE' : '○ STOPPED', isRunning ? 'var(--green)' : 'var(--red)'],
                ['Queue',   `${captureStatus.queueSize ?? 0} pkts`, 'var(--text-primary)'],
                ['Dropped', `${captureStatus.droppedPackets ?? 0}`,
                  (captureStatus.droppedPackets ?? 0) > 0 ? 'var(--amber)' : 'var(--text-dim)'],
                ['Interface', captureStatus.selectedInterface || '?', 'var(--text-secondary)'],
              ].map(([label, value, color]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                  <span style={{ color: 'var(--text-dim)' }}>{label}</span>
                  <span style={{ color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130, textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="section-divider" />

        {/* ── Rules ────────────────────────────────────────────────────── */}
        <div className="section-label" style={{ marginTop: 4 }}>Blocking Rules ({rules.length})</div>
        <div className="rule-add-form">
          <div className="form-row">
            <select className="form-select" value={ruleType} onChange={e => setRuleType(e.target.value)}>
              <option value="BLOCK_IP">Block IP</option>
              <option value="BLOCK_DOMAIN">Block Domain</option>
              <option value="BLOCK_PORT">Block Port</option>
              <option value="BLOCK_PROTOCOL">Block Protocol</option>
            </select>
            <input
              className="form-input"
              placeholder={RULE_PLACEHOLDERS[ruleType]}
              value={ruleValue}
              onChange={e => setRuleValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddRule()}
            />
          </div>
          <div className="form-row">
            <input className="form-input" placeholder="Description (optional)" value={ruleDesc} onChange={e => setRuleDesc(e.target.value)} />
            <button className="btn btn-action" onClick={handleAddRule} disabled={!ruleValue.trim()}>+ Add</button>
          </div>
        </div>

        <div className="rule-list">
          {rules.length === 0 && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', padding: '10px 0' }}>
              No active rules
            </div>
          )}
          {rules.map(r => (
            <div key={r.id} className="rule-item">
              <span className={`rule-type ${RULE_TYPE_CLASS[r.type]}`}>{RULE_TYPE_LABEL[r.type]}</span>
              <span className="rule-value">{r.value}</span>
              {r.description && <span className="rule-desc">{r.description}</span>}
              <button className="btn btn-danger" onClick={() => onRemoveRule(r.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
