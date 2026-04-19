import { cn } from '@/lib/utils'
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react'

// ── Badge ─────────────────────────────────────────────────────────────────────
export function Badge({
  variant = 'default', children, className,
}: { variant?: string; children: ReactNode; className?: string }) {
  const styles: Record<string, React.CSSProperties> = {
    tcp:      { background: 'var(--cyan-dim)',   color: 'var(--cyan)',   border: '1px solid rgba(0,188,212,0.18)'   },
    udp:      { background: 'var(--amber-dim)',  color: 'var(--amber)',  border: '1px solid rgba(240,160,32,0.18)'  },
    icmp:     { background: 'var(--purple-dim)', color: 'var(--purple)', border: '1px solid rgba(156,126,240,0.18)' },
    blocked:  { background: 'var(--red-dim)',    color: 'var(--red)',    border: '1px solid rgba(240,80,96,0.18)'   },
    allowed:  { color: 'var(--green)',           border: '1px solid transparent' },
    default:  { background: 'var(--bg4)',        color: 'var(--text3)',  border: '1px solid var(--border)' },
  }
  const s = styles[variant.toLowerCase()] ?? styles.default

  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-px rounded font-mono font-medium tracking-wide',
        className,
      )}
      style={{ fontSize: 10, fontFamily: 'var(--font-mono)', ...s }}
    >
      {children}
    </span>
  )
}

// ── Button ────────────────────────────────────────────────────────────────────
type BtnVariant = 'start' | 'stop' | 'action' | 'danger' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant
  size?: 'sm' | 'md'
}

const BTN_BASE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  letterSpacing: '0.03em',
  transition: 'opacity 0.1s, background 0.1s',
}

const BTN_STYLES: Record<BtnVariant, React.CSSProperties> = {
  start:  { background: 'var(--green-dim)',  border: '1px solid rgba(0,201,132,0.28)',  color: 'var(--green)'  },
  stop:   { background: 'var(--red-dim)',    border: '1px solid rgba(240,80,96,0.28)',  color: 'var(--red)'    },
  action: { background: 'var(--cyan-dim)',   border: '1px solid rgba(0,188,212,0.28)',  color: 'var(--cyan)'   },
  danger: { background: 'var(--red-dim)',    border: '1px solid rgba(240,80,96,0.2)',   color: 'var(--red)'    },
  ghost:  { background: 'transparent',       border: '1px solid var(--border)',          color: 'var(--text3)'  },
}

export function Button({
  variant = 'action', size = 'md', className, children, style, ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded font-semibold',
        'disabled:opacity-25 disabled:cursor-not-allowed',
        'hover:opacity-90 active:scale-[0.98]',
        size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5',
        className,
      )}
      style={{ fontSize: size === 'sm' ? 10 : 11, ...BTN_BASE, ...BTN_STYLES[variant], ...style }}
    >
      {children}
    </button>
  )
}

// ── Input ─────────────────────────────────────────────────────────────────────
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode
}

export function Input({ icon, className, style, ...rest }: InputProps) {
  return (
    <div className="relative flex items-center">
      {icon && (
        <span
          className="absolute left-2 pointer-events-none select-none"
          style={{ color: 'var(--text3)', fontSize: 12 }}
        >
          {icon}
        </span>
      )}
      <input
        {...rest}
        className={cn(
          'w-full rounded px-2.5 py-1.5 outline-none transition-colors',
          'placeholder:text-[color:var(--text3)]',
          icon ? 'pl-6' : '',
          className,
        )}
        style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          background: 'var(--bg3)',
          border: '1px solid var(--border)',
          color: 'var(--text1)',
          ...style,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-focus)'
          e.currentTarget.style.background = 'var(--bg4)'
          rest.onFocus?.(e)
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.background = 'var(--bg3)'
          rest.onBlur?.(e)
        }}
      />
    </div>
  )
}

// ── Select ────────────────────────────────────────────────────────────────────
export function Select({ className, children, style, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cn(
        'rounded px-2 py-1.5 outline-none cursor-pointer transition-colors',
        className,
      )}
      style={{
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        color: 'var(--text1)',
        ...style,
      }}
    >
      {children}
    </select>
  )
}

// ── StatCard ──────────────────────────────────────────────────────────────────
const STAT_ACCENTS: Record<string, string> = {
  cyan:   'var(--cyan)',
  green:  'var(--green)',
  red:    'var(--red)',
  amber:  'var(--amber)',
  purple: 'var(--purple)',
}

const STAT_DIMS: Record<string, string> = {
  cyan:   'var(--cyan-dim)',
  green:  'var(--green-dim)',
  red:    'var(--red-dim)',
  amber:  'var(--amber-dim)',
  purple: 'var(--purple-dim)',
}

interface StatCardProps {
  label:   string
  value:   string | number
  accent?: keyof typeof STAT_ACCENTS
  sub?:    string
}

export function StatCard({ label, value, accent = 'cyan', sub }: StatCardProps) {
  const color = STAT_ACCENTS[accent] ?? STAT_ACCENTS.cyan
  const dim   = STAT_DIMS[accent]   ?? STAT_DIMS.cyan
  return (
    <div
      className="relative rounded"
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderLeft: `2px solid ${color}`,
      }}
    >
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div
          style={{
            fontSize: 9,
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text3)',
            marginBottom: 5,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 18,
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}
        >
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginTop: 3 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

// ── SectionLabel ──────────────────────────────────────────────────────────────
export function SectionLabel({
  children, accent,
}: { children: ReactNode; accent?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      {accent && (
        <div
          className="rounded-full shrink-0"
          style={{ width: 2, height: 9, background: accent, opacity: 0.8 }}
        />
      )}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          fontSize: 9,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text3)',
        }}
      >
        {children}
      </span>
    </div>
  )
}
