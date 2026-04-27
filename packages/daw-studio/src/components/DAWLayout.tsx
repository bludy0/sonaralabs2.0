import { useState, useEffect, useRef, useCallback } from 'react'
import { Transport }   from './Transport'
import { Timeline }    from './Timeline/Timeline'
import { Mixer }       from './Mixer/Mixer'
import { PianoRoll }   from './PianoRoll/PianoRoll'
import { useDAWStore }    from '../store/useDAWStore'
import { useAudioEngine } from '../store/useAudioEngine'
import { useBufferRehydration } from '../lib/useBufferRehydration'
import { useDAWKeyboard }       from '../lib/useDAWKeyboard'
import { C, alpha } from '../constants'

type MainTab    = 'ARRANGER' | 'MIXER' | 'EDITOR'
type SideNavTab = 'TRACKS' | 'BROWSER' | 'PROJECT' | 'SAMPLES' | 'PLUGINS'

const MIXER_HEIGHT      = 240
const PIANO_ROLL_HEIGHT = 360
const MIN_PANEL_H       = 160
const MAX_PANEL_H       = 600
const SIDE_PANEL_W      = 220   // genişlik: soldan açılan içerik paneli

// ── DAWLayout prop'ları ───────────────────────────────────────────────────────
export interface DAWLayoutProps {
  /** Sol BROWSER sekmesinde gösterilecek içerik (opsiyonel) */
  browserPanel?:  React.ReactNode
  /** Sol PROJECT sekmesinde gösterilecek içerik (opsiyonel) */
  projectPanel?:  React.ReactNode
  /** Sol SAMPLES sekmesinde gösterilecek içerik (opsiyonel) */
  samplesPanel?:  React.ReactNode
  /** Sol PLUGINS sekmesinde gösterilecek içerik (opsiyonel) */
  pluginsPanel?:  React.ReactNode
}

export function DAWLayout({
  browserPanel, projectPanel, samplesPanel, pluginsPanel,
}: DAWLayoutProps = {}) {
  const [mainTab, setMainTab]   = useState<MainTab>('ARRANGER')
  const [sideTab, setSideTab]   = useState<SideNavTab | null>(null)
  const [panelH, setPanelH]     = useState(MIXER_HEIGHT)
  const [panelOpen, setPanelOpen] = useState(true)

  // Hangi sekmeler için içerik var?
  const sidePanelContent: Partial<Record<SideNavTab, React.ReactNode>> = {
    BROWSER: browserPanel,
    PROJECT: projectPanel,
    SAMPLES: samplesPanel,
    PLUGINS: pluginsPanel,
  }
  const activeSideContent = sideTab ? sidePanelContent[sideTab] : null

  const selectedClipId = useDAWStore(s => s.selectedClipId)
  const tracks         = useDAWStore(s => s.tracks)
  const { init }       = useAudioEngine()
  const dragRef        = useRef<{ startY: number; startH: number } | null>(null)

  useEffect(() => { init() }, [])
  useBufferRehydration()
  useDAWKeyboard()

  const hasMidiClipSelected = tracks.some(
    t => t.type === 'midi' && t.clips.some(c => c.id === selectedClipId)
  )
  useEffect(() => {
    if (hasMidiClipSelected) {
      setMainTab('EDITOR')
      setPanelH(h => Math.max(h, PIANO_ROLL_HEIGHT))
      setPanelOpen(true)
    }
  }, [hasMidiClipSelected])

  function handleTabChange(tab: MainTab) {
    setMainTab(tab)
    if (tab === 'ARRANGER') {
      setPanelOpen(false)
    } else {
      setPanelOpen(true)
      if (tab === 'EDITOR') setPanelH(h => Math.max(h, PIANO_ROLL_HEIGHT))
      else                  setPanelH(h => Math.min(h, MIXER_HEIGHT))
    }
  }

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startH: panelH }
    const onMove = (mv: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startY - mv.clientY
      const next  = Math.max(MIN_PANEL_H, Math.min(MAX_PANEL_H, dragRef.current.startH + delta))
      setPanelH(next)
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }, [panelH])

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      height:        '100%',
      background:    C.bgBase,
      color:         C.text1,
      fontFamily:    "'Inter', system-ui, sans-serif",
      overflow:      'hidden',
    }}>
      {/* ── Top header / Transport ─────────────────────────────────────── */}
      <Transport activeTab={mainTab} onTabChange={handleTabChange} />

      {/* ── Body row: sidebar + workspace ─────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* ── Left sidebar (icon rail) ────────────────────────────────── */}
        <nav style={{
          width:          64,
          flexShrink:     0,
          display:        'flex',
          flexDirection:  'column',
          background:     C.bgSubtle,
          borderRight:    `1px solid ${C.border}`,
          paddingTop:     8,
          zIndex:         40,
        }}>
          {SIDE_ITEMS.map(item => {
            const hasContent = item.id === 'TRACKS' || !!sidePanelContent[item.id]
            return (
              <SideNavItem
                key={item.id}
                item={item}
                active={sideTab === item.id}
                hasContent={hasContent}
                onClick={() => {
                  // Toggle: ikinci tıklamada kapat
                  setSideTab(prev => (prev === item.id ? null : item.id))
                }}
              />
            )
          })}
        </nav>

        {/* ── Side panel (BROWSER / PROJECT / SAMPLES / PLUGINS) ───────── */}
        {sideTab && activeSideContent && (
          <div style={{
            width:       SIDE_PANEL_W,
            flexShrink:  0,
            display:     'flex',
            flexDirection: 'column',
            background:  C.bgBase,
            borderRight: `1px solid ${C.border}`,
            overflow:    'hidden',
          }}>
            {/* Panel header */}
            <div style={{
              height:       36,
              display:      'flex',
              alignItems:   'center',
              padding:      '0 12px',
              borderBottom: `1px solid ${C.border}`,
              background:   C.bgSubtle,
              flexShrink:   0,
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text2 }}>
                {sideTab}
              </span>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => setSideTab(null)}
                style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}
              >×</button>
            </div>
            {/* Panel content */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {activeSideContent}
            </div>
          </div>
        )}

        {/* ── Main workspace ──────────────────────────────────────────── */}
        <main style={{
          flex:          1,
          display:       'flex',
          flexDirection: 'column',
          overflow:      'hidden',
          minWidth:      0,
          background:    C.bgDeep,
        }}>
          {/* Timeline — always visible, flex-1 */}
          <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
            <Timeline />
          </div>

          {/* Bottom panel */}
          {panelOpen && (
            <div style={{
              height:        panelH,
              flexShrink:    0,
              borderTop:     `1px solid ${C.border}`,
              display:       'flex',
              flexDirection: 'column',
              background:    C.bgBase,
            }}>
              {/* Resize handle */}
              <div
                onMouseDown={onResizeMouseDown}
                style={{
                  height:     5,
                  flexShrink: 0,
                  cursor:     'ns-resize',
                  background: 'transparent',
                  borderTop:  `1px solid ${C.border}`,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = alpha(C.accent, 25) }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              />

              {/* Panel header / tabs */}
              <div style={{
                height:       32,
                display:      'flex',
                alignItems:   'stretch',
                borderBottom: `1px solid ${C.border}`,
                background:   C.bgSubtle,
                flexShrink:   0,
              }}>
                {(['MIXER', 'EDITOR'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => handleTabChange(t)}
                    style={{
                      padding:      '0 16px',
                      background:   mainTab === t ? C.bgHover : 'none',
                      color:        mainTab === t ? C.accent : C.text2,
                      border:       'none',
                      borderBottom: mainTab === t ? `2px solid ${C.accent}` : '2px solid transparent',
                      fontSize:     11,
                      fontWeight:   600,
                      letterSpacing:'0.06em',
                      textTransform:'uppercase' as const,
                      cursor:       'pointer',
                      transition:   'color 0.1s, background 0.1s',
                    }}
                  >
                    {t === 'EDITOR' ? 'PIANO ROLL' : t}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                {/* Close button */}
                <button
                  onClick={() => setPanelOpen(false)}
                  style={{
                    width: 32, background: 'none', border: 'none',
                    color: C.text3, cursor: 'pointer', fontSize: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title="Close panel"
                >
                  ×
                </button>
              </div>

              {/* Panel content */}
              <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
                {mainTab === 'MIXER'  && <Mixer />}
                {mainTab === 'EDITOR' && <PianoRoll />}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

// ── Side nav ──────────────────────────────────────────────────────────────────

interface SideItem {
  id:    SideNavTab
  label: string
  icon:  React.ReactNode
}

const SIDE_ITEMS: SideItem[] = [
  { id: 'TRACKS',  label: 'Tracks',  icon: <TracksIcon /> },
  { id: 'BROWSER', label: 'Browser', icon: <BrowserIcon /> },
  { id: 'PROJECT', label: 'Project', icon: <ProjectIcon /> },
  { id: 'SAMPLES', label: 'Samples', icon: <SamplesIcon /> },
  { id: 'PLUGINS', label: 'Plugins', icon: <PluginsIcon /> },
]

function SideNavItem({ item, active, hasContent, onClick }: {
  item: SideItem; active: boolean; hasContent: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={item.label}
      style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        width:          '100%',
        padding:        '12px 4px',
        background:     active ? C.bgHover : 'none',
        border:         'none',
        borderLeft:     active ? `2px solid ${C.accentBright}` : '2px solid transparent',
        color:          active ? C.accentBright : hasContent ? C.text3 : C.text3 + '60',
        cursor:         hasContent ? 'pointer' : 'default',
        gap:            4,
        transition:     'color 0.1s, background 0.1s',
        userSelect:     'none',
        opacity:        hasContent ? 1 : 0.4,
      }}
      onMouseEnter={e => { if (!active && hasContent) { const el = e.currentTarget as HTMLElement; el.style.color = C.text1; el.style.background = C.bgHover } }}
      onMouseLeave={e => { if (!active && hasContent) { const el = e.currentTarget as HTMLElement; el.style.color = C.text3; el.style.background = 'none' } }}
    >
      <span style={{ fontSize: 20, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
        {item.icon}
      </span>
      <span style={{
        fontFamily:    "'Space Grotesk', 'Inter', system-ui, sans-serif",
        fontSize:      9,
        fontWeight:    700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase' as const,
      }}>
        {item.label}
      </span>
    </button>
  )
}

// ── Side nav icons (SVG) ──────────────────────────────────────────────────────

function TracksIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2" y="4"  width="16" height="3" rx="1"/>
      <rect x="2" y="9"  width="16" height="3" rx="1"/>
      <rect x="2" y="14" width="16" height="3" rx="1"/>
    </svg>
  )
}

function BrowserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="3" y="3" width="14" height="14" rx="1"/>
      <path d="M3 7h14M7 7v10"/>
    </svg>
  )
}

function ProjectIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M5 3h6l4 4v10a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z"/>
      <path d="M11 3v4h4"/>
    </svg>
  )
}

function SamplesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 10 L5 5 L8 13 L11 7 L14 10 L17 8"/>
      <line x1="2" y1="16" x2="18" y2="16"/>
    </svg>
  )
}

function PluginsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7" cy="7" r="2.5"/>
      <circle cx="13" cy="7" r="2.5"/>
      <circle cx="7" cy="13" r="2.5"/>
      <circle cx="13" cy="13" r="2.5"/>
    </svg>
  )
}
