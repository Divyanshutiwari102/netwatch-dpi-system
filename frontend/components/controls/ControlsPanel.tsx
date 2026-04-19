'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '@/store'
import { captureApi, ruleApi } from '@/lib/api'
import { Button, Input, Select } from '@/components/ui'
import { fmtNum } from '@/lib/utils'
import type { RuleType } from '@/types'

const RULE_LABELS: Record<RuleType, string> = {
  BLOCK_IP: 'IP', BLOCK_DOMAIN: 'DOMAIN',
  BLOCK_PORT: 'PORT', BLOCK_PROTOCOL: 'PROTO',
}
const RULE_PLACEHOLDERS: Record<RuleType, string> = {
  BLOCK_IP: '192.168.1.50', BLOCK_DOMAIN: '*.tiktok.com',
  BLOCK_PORT: '3306', BLOCK_PROTOCOL: 'UDP',
}
const RULE_COLOR: Record<RuleType, string> = {
  BLOCK_IP:       'var(--purple)',
  BLOCK_DOMAIN:   'var(--amber)',
  BLOCK_PORT:     'var(--cyan)',
  BLOCK_PROTOCOL: 'var(--green)',
}

interface Props {
  onRefresh: () => Promise<void>
}

function PanelHeader({ label, accent }: { label: string; accent: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '9px 14px',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
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
  )
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 6px' }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--text4)',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

// ── Portal Dropdown ────────────────────────────────────────────────────────────
interface PortalDropdownProps {
  options: string[]
  value: string
  onChange: (v: string) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
}

function PortalDropdown({ options, value, onChange, triggerRef, onClose }: PortalDropdownProps) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const dropH = Math.min(options.length * 52 + 8, 300)
    const spaceBelow = window.innerHeight - r.bottom
    const openAbove = spaceBelow < dropH + 8 && r.top > dropH + 8
    setPos({
      top: openAbove ? r.top - dropH - 4 : r.bottom + 4,
      left: r.left,
      width: Math.max(r.width, 260),
    })
  }, [options.length, triggerRef])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose, triggerRef])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={dropRef}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 9999,
        background: 'var(--bg3)',
        border: '1px solid var(--border-bright)',
        borderRadius: 7,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.3)',
        overflow: 'hidden',
        animation: 'dropdown-in 0.12s ease-out',
      }}
    >
      <div style={{ maxHeight: 300, overflowY: 'auto', padding: '4px 0' }}>
        {options.map((opt) => {
          const isSelected = opt === value
          const dashIdx = opt.indexOf('\u2014')
          const hasAlias = dashIdx !== -1
          const alias = hasAlias ? opt.slice(dashIdx + 1).trim() : ''
          const guid  = hasAlias ? opt.slice(0, dashIdx).trim() : opt

          return (
            <button
              key={opt}
              onClick={() => { onChange(opt); onClose() }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '6px 12px',
                background: isSelected ? 'rgba(0,188,212,0.08)' : 'transparent',
                border: 'none',
                borderLeft: `2px solid ${isSelected ? 'var(--cyan)' : 'transparent'}`,
                cursor: 'pointer',
                transition: 'background 0.08s',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
              }}
              onMouseEnter={(e) => {
                if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'
              }}
              onMouseLeave={(e) => {
                if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              {hasAlias ? (
                <>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? 'var(--cyan)' : 'var(--text1)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {alias}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 8.5,
                    color: 'var(--text4)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {guid}
                  </span>
                </>
              ) : (
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  fontWeight: isSelected ? 600 : 400,
                  color: isSelected ? 'var(--cyan)' : 'var(--text1)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {opt}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>,
    document.body
  )
}

// ── Interface Selector ─────────────────────────────────────────────────────────
function InterfaceSelector({
  interfaces, value, onChange, disabled,
}: {
  interfaces: string[]
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const handleClose = useCallback(() => setOpen(false), [])

  const dashIdx = value.indexOf('\u2014')
  const displayLabel = dashIdx !== -1 ? value.slice(dashIdx + 1).trim() : value

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: 'var(--text3)',
        flexShrink: 0,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}>
        Interface
      </span>
      <button
        ref={triggerRef}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        style={{
          flex: 1,
          padding: '5px 10px',
          background: open ? 'var(--bg4)' : 'var(--bg3)',
          border: `1px solid ${open ? 'var(--border-focus)' : 'var(--border)'}`,
          borderRadius: 5,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          opacity: disabled ? 0.45 : 1,
          transition: 'border-color 0.12s, background 0.12s',
          minWidth: 0,
        }}
      >
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: value ? 'var(--text1)' : 'var(--text3)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          textAlign: 'left',
        }}>
          {displayLabel || 'Select interface…'}
        </span>
        <span style={{
          color: 'var(--text3)',
          fontSize: 9,
          flexShrink: 0,
          display: 'inline-block',
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.15s',
        }}>▾</span>
      </button>

      {open && (
        <PortalDropdown
          options={interfaces}
          value={value}
          onChange={onChange}
          triggerRef={triggerRef}
          onClose={handleClose}
        />
      )}
    </div>
  )
}

export function ControlsPanel({ onRefresh }: Props) {
  const captureStatus = useStore((s) => s.captureStatus)
  const rules         = useStore((s) => s.rules)
  const stats         = useStore((s) => s.stats)
  const addToast      = useStore((s) => s.addToast)
  const clearPackets  = useStore((s) => s.clearPackets)

  const [mode,       setMode]       = useState<'live' | 'file'>('live')
  const [filePath,   setFilePath]   = useState('')
  const [interfaces, setInterfaces] = useState<string[]>([])
  const [selectedIf, setSelectedIf] = useState('')
  const [busy,       setBusy]       = useState(false)
  const [ruleType,   setRuleType]   = useState<RuleType>('BLOCK_IP')
  const [ruleValue,  setRuleValue]  = useState('')
  const [ruleDesc,   setRuleDesc]   = useState('')

  const isRunning = captureStatus?.running ?? false

  useEffect(() => {
    captureApi.interfaces()
      .then((list) => {
        if (Array.isArray(list) && list.length > 0) {
          setInterfaces(list)
          const any = list.find((s) => s.startsWith('any')) ?? list[0]
          setSelectedIf(any)
        }
      })
      .catch(() => {})
  }, [])

  async function handleStart() {
    setBusy(true)
    try {
      if (mode === 'file') {
        if (!filePath.trim()) { addToast('Enter a PCAP file path', 'error'); return }
        await captureApi.startFile(filePath.trim())
        addToast('File capture started', 'success')
      } else {
        await captureApi.startLive(selectedIf || undefined)
        addToast('Live capture started', 'success')
      }
      await onRefresh()
    } catch (e) {
      addToast(`Start failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleStop() {
    setBusy(true)
    try {
      await captureApi.stop()
      addToast('Capture stopped', 'info')
      await onRefresh()
    } catch (e) {
      addToast(`Stop failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleAddRule() {
    if (!ruleValue.trim()) return
    try {
      await ruleApi.add(ruleType, ruleValue.trim(), ruleDesc.trim() || undefined)
      addToast(`Rule added: ${ruleValue}`, 'success')
      setRuleValue('')
      setRuleDesc('')
      await onRefresh()
    } catch (e) {
      addToast(`Add rule failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }

  async function handleRemoveRule(id: string) {
    try {
      await ruleApi.remove(id)
      addToast('Rule removed', 'info')
      await onRefresh()
    } catch (e) {
      addToast(`Remove failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }

  const statusColor = isRunning ? 'var(--green)' : 'var(--text4)'
  const statusLabel = isRunning ? 'CAPTURING' : 'STOPPED'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PanelHeader label="Control" accent="var(--green)" />

      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        minHeight: 0,
      }}>

        {/* ── Capture Engine ─────────────────────────── */}
        <div>
          <Divider label="Capture" />
          <div style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 7,
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            {/* Mode tabs */}
            <div style={{ display: 'flex', gap: 4 }}>
              {(['live', 'file'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1,
                    padding: '5px 0',
                    borderRadius: 5,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                    background: mode === m ? 'var(--bg5)' : 'transparent',
                    border: `1px solid ${mode === m ? 'var(--border-bright)' : 'var(--border)'}`,
                    color: mode === m ? 'var(--text1)' : 'var(--text3)',
                  }}
                >
                  {m === 'live' ? 'Live' : 'PCAP File'}
                </button>
              ))}
            </div>

            {/* Interface selector — portal-based, escapes all overflow clipping */}
            {mode === 'live' && interfaces.length > 0 && (
              <InterfaceSelector
                interfaces={interfaces}
                value={selectedIf}
                onChange={setSelectedIf}
                disabled={isRunning}
              />
            )}

            {/* PCAP path */}
            {mode === 'file' && (
              <Input
                placeholder="/path/to/capture.pcap"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !isRunning) handleStart() }}
                style={{ fontSize: 10 }}
              />
            )}

            {/* Start / Stop */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn-start"
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 5,
                  fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.04em',
                  cursor: (isRunning || busy) ? 'not-allowed' : 'pointer',
                  opacity: (isRunning || busy) ? 0.35 : 1,
                  transition: 'all 0.12s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
                disabled={isRunning || busy}
                onClick={handleStart}
              >
                ▶ Start
              </button>
              <button
                className="btn-stop"
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 5,
                  fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.04em',
                  cursor: (!isRunning || busy) ? 'not-allowed' : 'pointer',
                  opacity: (!isRunning || busy) ? 0.35 : 1,
                  transition: 'all 0.12s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
                disabled={!isRunning || busy}
                onClick={handleStop}
              >
                ■ Stop
              </button>
            </div>

            {/* Status readout */}
            {captureStatus && (
              <div style={{
                background: 'var(--bg3)',
                borderRadius: 5,
                padding: '7px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}>
                {([
                  ['Status',    statusLabel,  statusColor],
                  ['Interface', captureStatus.selectedInterface || selectedIf || '—', 'var(--text2)'],
                  ['Queue',     `${captureStatus.queueSize ?? 0} pkts`,  'var(--text2)'],
                  ['Dropped',   String(captureStatus.droppedPackets ?? 0),
                                (captureStatus.droppedPackets ?? 0) > 0 ? 'var(--amber)' : 'var(--text4)'],
                  ['Buffered',  fmtNum(stats.bufferedPackets), 'var(--text3)'],
                ] as [string, string, string][]).map(([k, v, c]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text4)' }}>
                      {k}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9.5,
                      fontWeight: 600,
                      color: c,
                      maxWidth: 120,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {k === 'Status' && isRunning && <span style={{ marginRight: 4 }}>●</span>}
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Buffer ──────────────────────────────────── */}
        <div>
          <Divider label="Buffer" />
          <Button
            variant="ghost"
            size="sm"
            style={{ width: '100%' }}
            onClick={() => { clearPackets(); addToast('Packet buffer cleared', 'info') }}
          >
            Clear Packet Buffer
          </Button>
        </div>

        {/* ── Blocking Rules ───────────────────────────── */}
        <div style={{ flex: 1 }}>
          <Divider label={`Rules${rules.length > 0 ? ` (${rules.length})` : ''}`} />

          <div style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 7,
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            marginBottom: 8,
          }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <Select
                value={ruleType}
                onChange={(e) => setRuleType(e.target.value as RuleType)}
                style={{ flexShrink: 0, fontSize: 10 }}
              >
                <option value="BLOCK_IP">Block IP</option>
                <option value="BLOCK_DOMAIN">Block Domain</option>
                <option value="BLOCK_PORT">Block Port</option>
                <option value="BLOCK_PROTOCOL">Block Protocol</option>
              </Select>
              <Input
                placeholder={RULE_PLACEHOLDERS[ruleType]}
                value={ruleValue}
                onChange={(e) => setRuleValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddRule() }}
                style={{ flex: 1, minWidth: 0, fontSize: 10 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Input
                placeholder="Description (optional)"
                value={ruleDesc}
                onChange={(e) => setRuleDesc(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddRule() }}
                style={{ flex: 1, fontSize: 10 }}
              />
              <Button variant="action" size="sm" onClick={handleAddRule} disabled={!ruleValue.trim()}>
                + Add
              </Button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {rules.length === 0 ? (
              <p style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text4)',
                textAlign: 'center',
                padding: '10px 0',
              }}>
                No active rules
              </p>
            ) : rules.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '6px 10px',
                  transition: 'border-color 0.1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-bright)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 8.5, fontWeight: 700,
                  padding: '1px 5px', borderRadius: 3,
                  background: `${RULE_COLOR[r.type]}15`,
                  color: RULE_COLOR[r.type],
                  border: `1px solid ${RULE_COLOR[r.type]}28`,
                  letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0,
                }}>
                  {RULE_LABELS[r.type]}
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10.5,
                  color: 'var(--text1)', flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {r.value}
                </span>
                {r.description && (
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9.5,
                    color: 'var(--text4)', maxWidth: 56,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {r.description}
                  </span>
                )}
                <button
                  onClick={() => handleRemoveRule(r.id)}
                  style={{
                    flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 12,
                    color: 'var(--text4)', background: 'none', border: 'none',
                    cursor: 'pointer', padding: '0 2px', lineHeight: 1, transition: 'color 0.1s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--red)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text4)')}
                  title="Remove rule"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
