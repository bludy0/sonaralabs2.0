import { useState, useCallback } from 'react'
import { useDAWStore } from '../../store/useDAWStore'
import type { EffectChain } from '../../types'
import { useDAWT } from '../../i18n'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MasteringSuggestion {
  trackIndex:    number
  parameter:     string   // e.g. "reverb.wet", "eq.lowGain"
  currentValue:  number
  suggestedValue: number
  reason:        string
  applied?:      boolean
}

interface MasteringApiTrack {
  id:      string
  name:    string
  type:    string
  volume:  number
  pan:     number
  muted:   boolean
  effects: EffectChain
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** "reverb.wet" → { section: "reverb", key: "wet" } */
function parseParam(parameter: string): { section: keyof EffectChain; key: string } | null {
  const parts = parameter.split('.')
  if (parts.length !== 2) return null
  return { section: parts[0] as keyof EffectChain, key: parts[1] }
}

function formatParam(parameter: string): string {
  const parsed = parseParam(parameter)
  if (!parsed) return parameter
  const sectionLabels: Record<string, string> = {
    eq: 'EQ', reverb: 'Reverb', delay: 'Delay',
    compressor: 'Compressor', limiter: 'Limiter',
  }
  const keyLabels: Record<string, string> = {
    wet: 'Wet Mix', roomSize: 'Room Size', time: 'Time',
    feedback: 'Feedback', threshold: 'Threshold', ratio: 'Ratio',
    attack: 'Attack', release: 'Release', knee: 'Knee',
    lowGain: 'Low Gain', loMidGain: 'Lo-Mid Gain',
    hiMidGain: 'Hi-Mid Gain', highGain: 'High Gain',
  }
  const section = sectionLabels[parsed.section] ?? parsed.section
  const key     = keyLabels[parsed.key] ?? parsed.key
  return `${section} › ${key}`
}

function formatValue(parameter: string, value: number): string {
  const key = parameter.split('.')[1] ?? ''
  if (key.includes('Gain') || key === 'threshold') return `${value > 0 ? '+' : ''}${value} dB`
  if (key === 'ratio') return `${value}:1`
  if (key === 'attack' || key === 'release') return `${Math.round(value * 1000)} ms`
  if (key === 'time') return `${Math.round(value * 1000)} ms`
  return `${Math.round(value * 100)}%`
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MasteringPanel() {
  const dt = useDAWT()
  const tracks      = useDAWStore(s => s.tracks)
  const transport   = useDAWStore(s => s.transport)
  const updateEffects = useDAWStore(s => s.updateEffects)

  const [suggestions, setSuggestions] = useState<MasteringSuggestion[]>([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [analyzed, setAnalyzed]       = useState(false)

  const analyze = useCallback(async () => {
    if (tracks.length === 0) {
      setError('No tracks to analyze.')
      return
    }
    setLoading(true)
    setError(null)

    const apiTracks: MasteringApiTrack[] = tracks.map(t => ({
      id:      t.id,
      name:    t.name,
      type:    t.type,
      volume:  t.volume,
      pan:     t.pan,
      muted:   t.muted,
      effects: t.effects,
    }))

    try {
      const res = await fetch('/api/generate/master', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'include',
        body:        JSON.stringify({ bpm: transport.bpm, tracks: apiTracks }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `HTTP ${res.status}`)
      }
      const raw: Omit<MasteringSuggestion, 'applied'>[] = json.data?.suggestions ?? []
      setSuggestions(raw.map(s => ({ ...s, applied: false })))
      setAnalyzed(true)
    } catch (e) {
      const err = e as Error
      setError(err.message ?? 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }, [tracks, transport.bpm])

  const applySuggestion = useCallback((idx: number) => {
    const s = suggestions[idx]
    if (!s || s.applied) return
    const track = tracks[s.trackIndex]
    if (!track) return

    const parsed = parseParam(s.parameter)
    if (!parsed) return

    const currentSection = track.effects[parsed.section] as unknown as Record<string, unknown>
    const patch = {
      [parsed.section]: {
        ...currentSection,
        [parsed.key]: s.suggestedValue,
        enabled: true,  // ensure section is enabled when applying
      },
    } as Partial<EffectChain>

    updateEffects(track.id, patch)
    setSuggestions(prev => prev.map((sug, i) => i === idx ? { ...sug, applied: true } : sug))
  }, [suggestions, tracks, updateEffects])

  const applyAll = useCallback(() => {
    suggestions.forEach((_, i) => applySuggestion(i))
  }, [suggestions, applySuggestion])

  const unappliedCount = suggestions.filter(s => !s.applied).length

  return (
    <div className="flex flex-col h-full bg-zinc-900 text-white select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-100">{dt.aiMastering}</span>
          <span className="text-xs text-zinc-500 bg-zinc-800 rounded px-1.5 py-0.5">{dt.beta}</span>
        </div>
        {analyzed && unappliedCount > 0 && (
          <button
            onClick={applyAll}
            className="text-xs px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 transition-colors font-medium"
          >
            {dt.applyAll}
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

        {/* Analyze button */}
        <button
          onClick={analyze}
          disabled={loading}
          className={[
            'w-full py-2 rounded-lg text-sm font-semibold transition-colors',
            loading
              ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white',
          ].join(' ')}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              {dt.analyzing}
            </span>
          ) : analyzed ? dt.reanalyzeMix : dt.analyzeMix}
        </button>

        {/* Error */}
        {error && (
          <div className="text-xs text-red-400 bg-red-900/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Empty state */}
        {analyzed && suggestions.length === 0 && !error && (
          <div className="text-center text-xs text-zinc-500 py-6">
            {dt.mixLooksGreat}
          </div>
        )}

        {/* Suggestions */}
        {suggestions.map((sug, idx) => {
          const track = tracks[sug.trackIndex]
          const trackName = track?.name ?? `Track ${sug.trackIndex + 1}`
          return (
            <div
              key={idx}
              className={[
                'rounded-lg border px-3 py-2.5 space-y-1.5 transition-colors',
                sug.applied
                  ? 'border-indigo-500/40 bg-indigo-900/20'
                  : 'border-zinc-700 bg-zinc-800/60',
              ].join(' ')}
            >
              {/* Track + parameter */}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[11px] font-medium text-zinc-400 block truncate">
                    {trackName}
                  </span>
                  <span className="text-xs font-semibold text-zinc-200">
                    {formatParam(sug.parameter)}
                  </span>
                </div>
                {sug.applied ? (
                  <span className="shrink-0 text-[10px] font-semibold text-indigo-400 bg-indigo-900/50 rounded px-1.5 py-0.5">
                    {dt.applied}
                  </span>
                ) : (
                  <button
                    onClick={() => applySuggestion(idx)}
                    className="shrink-0 text-[11px] px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors font-medium"
                  >
                    {dt.apply}
                  </button>
                )}
              </div>

              {/* Value comparison */}
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-zinc-500">{formatValue(sug.parameter, sug.currentValue)}</span>
                <svg className="h-3 w-3 text-zinc-600" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 5l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className={sug.applied ? 'text-indigo-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                  {formatValue(sug.parameter, sug.suggestedValue)}
                </span>
              </div>

              {/* Reason */}
              <p className="text-[11px] text-zinc-400 leading-snug">{sug.reason}</p>
            </div>
          )
        })}

        {/* Placeholder when not yet analyzed */}
        {!analyzed && !loading && !error && (
          <div className="text-center text-xs text-zinc-500 py-6 space-y-1">
            <div className="text-2xl">🎛️</div>
            <p>{dt.analyzeMixHint}</p>
          </div>
        )}
      </div>
    </div>
  )
}
