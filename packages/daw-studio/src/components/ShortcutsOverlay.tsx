// Klavye kısayolları paneli — '?' tuşu veya transport'taki klavye ikonu açar.
import { useDAWStore } from '../store/useDAWStore'
import { C } from '../constants'
import { useDAWi18nStore } from '../i18n'

interface Row { keys: string[]; en: string; tr: string }
interface Group { en: string; tr: string; rows: Row[] }

const GROUPS: Group[] = [
  {
    en: 'Playback', tr: 'Çalma',
    rows: [
      { keys: ['Space'],           en: 'Play / Pause',                 tr: 'Çal / Duraklat' },
      { keys: ['Shift', 'Space'],  en: 'Stop (return to start)',       tr: 'Durdur (başa dön)' },
      { keys: ['Home'],            en: 'Playhead to start',            tr: "Playhead'i başa al" },
      { keys: ['End'],             en: 'Playhead to project end',      tr: "Playhead'i proje sonuna al" },
      { keys: ['L'],               en: 'Toggle loop',                  tr: 'Loop aç/kapat' },
      { keys: ['['],               en: 'Set loop start to playhead',   tr: "Loop başlangıcını playhead'e al" },
      { keys: [']'],               en: 'Set loop end to playhead',     tr: "Loop sonunu playhead'e al" },
    ],
  },
  {
    en: 'Editing', tr: 'Düzenleme',
    rows: [
      { keys: ['Ctrl', 'Z'],        en: 'Undo',                        tr: 'Geri al' },
      { keys: ['Ctrl', 'Shift', 'Z'], en: 'Redo',                      tr: 'Yinele' },
      { keys: ['Ctrl', 'C'],        en: 'Copy selected clips',         tr: 'Seçili klipleri kopyala' },
      { keys: ['Ctrl', 'V'],        en: 'Paste clips',                 tr: 'Klipleri yapıştır' },
      { keys: ['Ctrl', 'D'],        en: 'Duplicate clip',              tr: 'Klibi çoğalt' },
      { keys: ['Ctrl', 'A'],        en: 'Select all clips on track',   tr: 'Track üstündeki tüm klipleri seç' },
      { keys: ['Del'],              en: 'Delete selected clips',       tr: 'Seçili klipleri sil' },
      { keys: ['Esc'],              en: 'Deselect / close panel',      tr: 'Seçimi bırak / paneli kapat' },
    ],
  },
  {
    en: 'View & Tools', tr: 'Görünüm ve Araçlar',
    rows: [
      { keys: ['S'],               en: 'Toggle snap to grid',          tr: 'Izgaraya hizalamayı aç/kapat' },
      { keys: ['+', '−'],          en: 'Zoom in / out',                tr: 'Yakınlaştır / uzaklaştır' },
      { keys: ['Ctrl', 'Wheel'],   en: 'Zoom at cursor',               tr: 'İmleçte yakınlaştır' },
      { keys: ['Shift', 'Click'],  en: 'Add clip to selection',        tr: 'Klibi seçime ekle' },
      { keys: ['Drag'],            en: 'Marquee-select clips',         tr: 'Sürükleyerek çoklu seçim' },
      { keys: ['Ctrl', 'S'],       en: 'Save project',                 tr: 'Projeyi kaydet' },
      { keys: ['?'],               en: 'Show this panel',              tr: 'Bu paneli göster' },
    ],
  },
]

export function ShortcutsOverlay() {
  const open    = useDAWStore(s => s.shortcutsOpen)
  const setOpen = useDAWStore(s => s.setShortcutsOpen)
  const lang    = useDAWi18nStore(s => s.lang)
  if (!open) return null

  const title = lang === 'tr' ? 'Klavye Kısayolları' : 'Keyboard Shortcuts'

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
      style={{
        position: 'absolute', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        width: 680, maxWidth: '92vw', maxHeight: '84vh',
        overflowY: 'auto',
        background: C.bgBase,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        boxShadow: '0 16px 60px rgba(0,0,0,0.55)',
        padding: '18px 22px 22px',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <span style={{
            fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
            fontSize: 14, fontWeight: 800, letterSpacing: '0.04em',
            textTransform: 'uppercase', color: C.accentBright,
          }}>
            {title}
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
            title="Close (Esc)"
          >×</button>
        </div>

        {/* Groups — 3 column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 18 }}>
          {GROUPS.map(group => (
            <div key={group.en}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: C.text3,
                borderBottom: `1px solid ${C.border}`,
                paddingBottom: 5, marginBottom: 8,
              }}>
                {lang === 'tr' ? group.tr : group.en}
              </div>
              {group.rows.map(row => (
                <div key={row.en} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3.5px 0' }}>
                  <div style={{ display: 'flex', gap: 3, flexShrink: 0, minWidth: 86 }}>
                    {row.keys.map(k => (
                      <kbd key={k} style={{
                        fontFamily: "'Inter', monospace",
                        fontSize: 9.5, fontWeight: 700,
                        padding: '2px 5px',
                        borderRadius: 3,
                        background: C.bgSelected,
                        border: `1px solid ${C.border}`,
                        borderBottom: `2px solid ${C.border}`,
                        color: C.text1,
                        whiteSpace: 'nowrap',
                      }}>{k}</kbd>
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: C.text2 }}>
                    {lang === 'tr' ? row.tr : row.en}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div style={{
          marginTop: 14, paddingTop: 10, borderTop: `1px solid ${C.border}`,
          fontSize: 10, color: C.text3,
        }}>
          {lang === 'tr'
            ? 'İpucu: Mac\'te Ctrl yerine ⌘ kullanılır. Panel dışına tıklayarak veya Esc ile kapatabilirsin.'
            : 'Tip: On Mac, use ⌘ instead of Ctrl. Click outside or press Esc to close.'}
        </div>
      </div>
    </div>
  )
}

