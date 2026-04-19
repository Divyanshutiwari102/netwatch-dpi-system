'use client'

import { useStore } from '@/store'

export function Toasts() {
  const toasts      = useStore((s) => s.toasts)
  const removeToast = useStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-5 right-5 flex flex-col gap-2 z-[1000] pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => removeToast(t.id)}
          className="pointer-events-auto flex items-center gap-2.5 rounded-lg px-4 py-2.5 cursor-pointer"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text1)',
            background: 'var(--bg3)',
            border: '1px solid var(--border-bright)',
            borderLeft: `3px solid ${
              t.type === 'success' ? 'var(--green)'
              : t.type === 'error' ? 'var(--red)'
              : t.type === 'info' ? 'var(--cyan)'
              : 'var(--text3)'
            }`,
            maxWidth: 300,
            boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
            animation: 'toast-in 0.15s ease-out',
          }}
        >
          <span className="shrink-0">
            {t.type === 'success' ? '✓' : t.type === 'error' ? '✗' : '·'}
          </span>
          <span style={{ lineHeight: 1.4 }}>{t.msg}</span>
        </div>
      ))}
    </div>
  )
}
