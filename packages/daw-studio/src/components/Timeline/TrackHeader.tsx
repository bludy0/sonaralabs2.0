// Sol kolondaki track başlığı: sürükle-bırak sıralama, yeniden adlandırma,
// renk seçici, M/S/R, volume/pan slider'ları, automation lane ekleme, resize.
import React from 'react'
import { useDAWStore } from '../../store/useDAWStore'
import { C, alpha, TRACK_COLORS } from '../../constants'
import { AUTOMATION_PARAM_LABELS } from '../../types'

const TRACK_DRAG_TYPE = 'application/x-daw-track'

export function TrackHeader({ track, trackHeight }: { track: import('../../types').DAWTrack; trackHeight: number }) {
  const updateTrack     = useDAWStore(s => s.updateTrack)
  const setTrackHeight  = useDAWStore(s => s.setTrackHeight)
  const removeTrack     = useDAWStore(s => s.removeTrack)
  const selectTrack     = useDAWStore(s => s.selectTrack)
  const reorderTracks   = useDAWStore(s => s.reorderTracks)
  const selectedId      = useDAWStore(s => s.selectedTrackId)
  const addLane         = useDAWStore(s => s.addAutomationLane)
  const automationLanes = useDAWStore(s => s.automationLanes)
  const isSelected      = selectedId === track.id
  const existingParams  = automationLanes.filter(l => l.trackId === track.id).map(l => l.param)

  const ALL_PARAMS      = Object.keys(AUTOMATION_PARAM_LABELS) as import('../../types').AutomationParam[]
  const availableParams = ALL_PARAMS.filter(p => !existingParams.includes(p))

  const isMidi  = track.type === 'midi'
  const [dropPos,    setDropPos]    = React.useState<'top' | 'bottom' | null>(null)
  const [isRenaming, setIsRenaming] = React.useState(false)
  const [renameVal,  setRenameVal]  = React.useState('')
  const [showColors, setShowColors] = React.useState(false)

  function onDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes(TRACK_DRAG_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    setDropPos(e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom')
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDropPos(null)
    const fromId = e.dataTransfer.getData(TRACK_DRAG_TYPE)
    if (fromId && fromId !== track.id) reorderTracks(fromId, track.id)
  }

  // Drag the bottom edge to resize ALL track lanes (height is global).
  function onResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const startY = e.clientY
    const startH = trackHeight
    const onMove = (mv: MouseEvent) => setTrackHeight(startH + (mv.clientY - startY))
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData(TRACK_DRAG_TYPE, track.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={() => setDropPos(null)}
      onDragOver={onDragOver}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropPos(null)
      }}
      onDrop={onDrop}
      onClick={() => selectTrack(track.id)}
      style={{
        height:      trackHeight,
        flexShrink:  0,
        display:     'flex',
        alignItems:  'stretch',
        borderBottom:`1px solid ${C.border}`,
        background:  isSelected ? C.bgHover : C.bgBase,
        cursor:      'grab',
        userSelect:  'none',
        position:    'relative',
        transition:  'background 0.1s',
        // Drop indicator lines
        borderTop:    dropPos === 'top'    ? `2px solid ${C.accent}` : undefined,
        boxShadow:    dropPos === 'bottom' ? `0 2px 0 ${C.accent}`  : undefined,
      }}
    >
      {/* Color tab */}
      <div
        onClick={e => { e.stopPropagation(); setShowColors(v => !v) }}
        title="Click to change track color"
        style={{
          width: 8, flexShrink: 0, background: track.color,
          cursor: 'pointer', position: 'relative',
          transition: 'width 0.1s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.width = '12px' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.width = showColors ? '12px' : '8px' }}
      >
        {showColors && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', left: 14, top: 0,
              zIndex: 200,
              background: C.bgSubtle, border: `1px solid ${C.border}`,
              borderRadius: 5, padding: 5,
              display: 'flex', flexWrap: 'wrap', gap: 4,
              width: 82, boxShadow: `0 4px 16px rgba(0,0,0,0.4)`,
            }}
          >
            {TRACK_COLORS.map(col => (
              <div
                key={col}
                onClick={e => { e.stopPropagation(); updateTrack(track.id, { color: col }); setShowColors(false) }}
                style={{
                  width: 16, height: 16, borderRadius: 3,
                  background: col, cursor: 'pointer',
                  outline: track.color === col ? `2px solid ${C.text1}` : 'none',
                  outlineOffset: 1,
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px 8px 4px 6px' }}>
        {/* Top row: icon + name + type badge + M/S/R */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: C.text3, flexShrink: 0 }}>
            {isMidi ? '🎹' : '≈'}
          </span>
          {isRenaming ? (
            <input
              autoFocus
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onKeyDown={e => {
                e.stopPropagation()
                if (e.key === 'Enter')  { if (renameVal.trim()) updateTrack(track.id, { name: renameVal.trim() }); setIsRenaming(false) }
                if (e.key === 'Escape') { setIsRenaming(false) }
              }}
              onBlur={() => { if (renameVal.trim()) updateTrack(track.id, { name: renameVal.trim() }); setIsRenaming(false) }}
              onClick={e => e.stopPropagation()}
              style={{
                flex: 1, minWidth: 0,
                background: C.bgDeep, border: `1px solid ${C.accent}`,
                borderRadius: 3, color: C.text1,
                fontSize: 11, fontWeight: 600,
                padding: '1px 5px', outline: 'none',
              }}
            />
          ) : (
            <span
              onDoubleClick={e => { e.stopPropagation(); setRenameVal(track.name); setIsRenaming(true) }}
              title="Double-click to rename"
              style={{
                fontSize: 11, fontWeight: 600, color: isSelected ? C.accentBright : C.text1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                letterSpacing: '0.01em', cursor: 'text',
              }}
            >
              {track.name}
            </span>
          )}
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            <TrackBtn
              active={track.muted}
              activeColor={C.warning}
              onClick={e => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }) }}
              title="Mute"
            >M</TrackBtn>
            <TrackBtn
              active={track.soloed}
              activeColor={C.accent}
              onClick={e => { e.stopPropagation(); updateTrack(track.id, { soloed: !track.soloed }) }}
              title="Solo"
            >S</TrackBtn>
            <TrackBtn
              active={false}
              activeColor={C.error}
              onClick={e => e.stopPropagation()}
              title="Record arm"
            >R</TrackBtn>
          </div>
        </div>

        {/* Bottom row: V slider + P slider + utils */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Volume */}
          <span style={{ fontSize: 8, color: C.text3, width: 10, flexShrink: 0 }}>V</span>
          <div style={{ position: 'relative', flex: 1, height: 4 }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: C.bgDeep, borderRadius: 2,
              boxShadow: `inset 0 1px 3px ${C.shadowSm}`,
            }}/>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width:  `${track.volume * 100}%`,
              background: C.accent, borderRadius: 2,
            }}/>
            <input
              type="range" min={0} max={1} step={0.01}
              value={track.volume}
              onClick={e => e.stopPropagation()}
              onChange={e => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
              style={{
                position: 'absolute', inset: '-4px 0',
                opacity: 0, cursor: 'pointer', width: '100%', margin: 0,
              }}
            />
          </div>

          {/* Pan */}
          <span style={{ fontSize: 8, color: C.text3, width: 10, flexShrink: 0, borderLeft: `1px solid ${C.border}`, paddingLeft: 4 }}>P</span>
          <div style={{ position: 'relative', flex: 1, height: 4 }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: C.bgDeep, borderRadius: 2,
              boxShadow: `inset 0 1px 3px ${C.shadowSm}`,
            }}/>
            <div style={{
              position: 'absolute', top: 0, bottom: 0,
              left: '50%', width: 1, background: C.text3,
            }}/>
            <input
              type="range" min={-1} max={1} step={0.01}
              value={track.pan ?? 0}
              onClick={e => e.stopPropagation()}
              onChange={e => updateTrack(track.id, { pan: parseFloat(e.target.value) })}
              style={{
                position: 'absolute', inset: '-4px 0',
                opacity: 0, cursor: 'pointer', width: '100%', margin: 0,
              }}
            />
          </div>

          {/* Automation + remove */}
          <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            {availableParams.length > 0 && (
              <select
                title="Add automation lane"
                value=""
                onClick={e => e.stopPropagation()}
                onChange={e => {
                  e.stopPropagation()
                  if (e.target.value) addLane(track.id, e.target.value as import('../../types').AutomationParam)
                }}
                style={{
                  background: C.bgSubtle, color: C.text3,
                  border: `1px solid ${C.border}`, borderRadius: 2,
                  fontSize: 8, cursor: 'pointer',
                  width: 18, height: 18, padding: 0, textAlign: 'center',
                }}
              >
                <option value="">+A</option>
                {availableParams.map(p => (
                  <option key={p} value={p}>{AUTOMATION_PARAM_LABELS[p]}</option>
                ))}
              </select>
            )}
            <button
              onClick={e => { e.stopPropagation(); removeTrack(track.id) }}
              style={{
                width: 18, height: 18,
                background: 'none', border: 'none', cursor: 'pointer',
                color: C.text3, fontSize: 13, padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 2,
              }}
              title="Remove track"
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.error }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.text3 }}
            >×</button>
          </div>
        </div>
      </div>

      {/* Resize handle — drag to change height of all track lanes */}
      <div
        onMouseDown={onResizeMouseDown}
        title="Drag to resize track height"
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: 6,
          cursor: 'ns-resize', zIndex: 50,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = alpha(C.accent, 30) }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      />
    </div>
  )
}

export function AddTrackBtn({ onClick, label, accent }: {
  onClick: () => void
  label:   string
  accent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={accent ? 'Add MIDI Track — instrument / piano roll' : 'Add Audio Track — audio clips'}
      style={{
        flex: 1,
        padding: '7px 8px',
        borderRadius: 4,
        background: accent ? alpha(C.accent, 14) : C.bgHover,
        color:      accent ? C.accent : C.text2,
        border:     `1px solid ${accent ? alpha(C.accent, 38) : C.border}`,
        fontSize:   11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        cursor:     'pointer',
        transition: 'all 0.1s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement
        el.style.background = accent ? alpha(C.accent, 24) : C.bgDeep
        el.style.borderColor = accent ? C.accent : alpha(C.text3, 40)
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.background = accent ? alpha(C.accent, 14) : C.bgHover
        el.style.borderColor = accent ? alpha(C.accent, 38) : C.border
      }}
    >
      {label}
    </button>
  )
}

function TrackBtn({ children, active, activeColor, onClick, title }: {
  children:    React.ReactNode
  active:      boolean
  activeColor: string
  onClick:     (e: React.MouseEvent) => void
  title?:      string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width:      18,
        height:     18,
        borderRadius: 2,
        background: active ? alpha(activeColor, 19) : C.bgHover,
        color:      active ? activeColor : C.text3,
        border:     `1px solid ${active ? alpha(activeColor, 38) : C.border}`,
        fontSize:   9,
        fontWeight: 700,
        cursor:     'pointer',
        display:    'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow:  active ? `0 0 6px ${alpha(activeColor, 31)}` : 'none',
        transition: 'all 0.1s',
      }}
    >
      {children}
    </button>
  )
}
