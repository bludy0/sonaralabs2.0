import { useEffect, useState } from 'react'
import type { ToastEvent } from '../lib/toast'

interface ToastItem extends ToastEvent {
  exiting: boolean
}

const TYPE_STYLES: Record<ToastEvent['type'], { bg: string; color: string; accent: string }> = {
  success: { bg: 'color-mix(in srgb, var(--success)  10%, var(--bg-card))', color: 'var(--success)',  accent: 'var(--success)'  },
  error:   { bg: 'color-mix(in srgb, var(--error)    10%, var(--bg-card))', color: 'var(--error)',    accent: 'var(--error)'    },
  warning: { bg: 'color-mix(in srgb, var(--warning)  10%, var(--bg-card))', color: 'var(--warning)',  accent: 'var(--warning)'  },
  info:    { bg: 'color-mix(in srgb, var(--accent)   10%, var(--bg-card))', color: 'var(--text-1)',   accent: 'var(--accent)'   },
}

const ICONS: Record<ToastEvent['type'], string> = {
  success: '✓',
  error:   '✗',
  warning: '⚠',
  info:    'ℹ',
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    function onToast(e: Event) {
      const ev = e as CustomEvent<ToastEvent>
      const item: ToastItem = { ...ev.detail, exiting: false }

      setToasts(prev => [...prev, item])

      // Start exit animation before removing
      setTimeout(() => {
        setToasts(prev => prev.map(t => t.id === item.id ? { ...t, exiting: true } : t))
      }, item.duration - 300)

      // Remove from DOM
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== item.id))
      }, item.duration)
    }

    window.addEventListener('sl:toast', onToast)
    return () => window.removeEventListener('sl:toast', onToast)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div
      style={{
        position:      'fixed',
        bottom:        24,
        right:         24,
        zIndex:        9999,
        display:       'flex',
        flexDirection: 'column',
        gap:           8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map(t => {
        const s = TYPE_STYLES[t.type]
        return (
          <div
            key={t.id}
            style={{
              display:       'flex',
              alignItems:    'center',
              gap:           10,
              padding:       '10px 14px',
              borderRadius:  8,
              background:    s.bg,
              border:        `1px solid color-mix(in srgb, ${s.accent} 30%, transparent)`,
              boxShadow:     '0 4px 20px rgba(0,0,0,0.3)',
              minWidth:      220,
              maxWidth:      360,
              fontFamily:    "'Space Grotesk', system-ui, sans-serif",
              opacity:       t.exiting ? 0 : 1,
              transform:     t.exiting ? 'translateX(12px)' : 'translateX(0)',
              transition:    'opacity 0.28s ease, transform 0.28s ease',
              pointerEvents: 'auto',
            }}
          >
            <span style={{ color: s.accent, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
              {ICONS[t.type]}
            </span>
            <p style={{ fontSize: 12, color: s.color, lineHeight: 1.4, flex: 1 }}>
              {t.message}
            </p>
          </div>
        )
      })}
    </div>
  )
}
