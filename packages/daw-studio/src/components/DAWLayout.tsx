import { useState, useEffect } from 'react'
import { Transport }   from './Transport'
import { Timeline }    from './Timeline/Timeline'
import { Mixer }       from './Mixer/Mixer'
import { PianoRoll }   from './PianoRoll/PianoRoll'
import { useDAWStore }    from '../store/useDAWStore'
import { useAudioEngine } from '../store/useAudioEngine'
import { useBufferRehydration } from '../lib/useBufferRehydration'
import { C } from '../constants'

type BottomTab = 'Mixer' | 'Piano Roll'

export function DAWLayout() {
  const [tab, setTab]     = useState<BottomTab>('Mixer')
  const selectedClipId    = useDAWStore(s => s.selectedClipId)
  const tracks            = useDAWStore(s => s.tracks)
  const { init }          = useAudioEngine()

  useEffect(() => { init() }, [])
  useBufferRehydration()

  // Auto-switch to Piano Roll when a MIDI clip is selected
  const hasMidiClipSelected = tracks.some(
    t => t.type === 'midi' && t.clips.some(c => c.id === selectedClipId)
  )
  useEffect(() => {
    if (hasMidiClipSelected) setTab('Piano Roll')
  }, [hasMidiClipSelected])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: C.bgBase,
      color: C.text1,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      overflow: 'hidden',
    }}>
      {/* Transport bar */}
      <Transport />

      {/* Timeline — flex-grow takes all available space */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Timeline />
      </div>

      {/* Bottom panel */}
      <div style={{
        height: 220, flexShrink: 0,
        borderTop: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: `1px solid ${C.border}`,
          background: C.bgRaised,
        }}>
          {(['Mixer', 'Piano Roll'] as BottomTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '6px 16px',
                background: 'none',
                color: tab === t ? C.accent : C.text3,
                border: 'none',
                borderBottom: tab === t ? `2px solid ${C.accent}` : '2px solid transparent',
                fontSize: 11, fontWeight: 600,
                cursor: 'pointer',
                transition: 'color 0.1s',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Panel content */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {tab === 'Mixer'     && <Mixer />}
          {tab === 'Piano Roll'&& <PianoRoll />}
        </div>
      </div>
    </div>
  )
}
