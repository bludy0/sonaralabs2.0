# @sonaralabs/daw-studio

In-browser Digital Audio Workstation (DAW) studio package — a self-contained,
framework-agnostic React component suite + TypeScript audio engine that ships
as an importable package for the Sonara Labs web app.

## Quick start

```tsx
import { DAWLayout } from '@sonaralabs/daw-studio'

export default function StudioPage() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <DAWLayout
        browserPanel={<CustomBrowserPanel />}
        projectPanel={<CustomProjectPanel />}
        samplesPanel={<CustomSamplesPanel />}
        pluginsPanel={<CustomPluginsPanel />}
      />
    </div>
  )
}
```

Mount the component anywhere — there are no routing / global-provider
prerequisites.  The studio owns its own internal state via Zustand stores and
a single shared `AudioContext`.

## Architecture

```
src/
├── engine/                  Framework-agnostic audio graph (no React)
│   ├── context.ts           Shared AudioContext singleton
│   ├── TrackNode.ts         Per-track graph: gain→pan→eq→reverb→delay→chorus→comp→limiter→analyser
│   ├── SynthEngine.ts       Polyphonic subtractive synth (osc+biquad)
│   ├── SamplerEngine.ts     SoundFont-style sampler with pitch-shift
│   ├── instruments.ts       General MIDI instrument catalog
│   └── effects/             EQ, Reverb, Delay, Chorus, Compressor, Limiter
├── store/
│   ├── useDAWStore.ts       Project model — tracks, automation, transport,
│   │                        undo/redo (subscribeWithSelector middleware).
│   │                        Mutations record a history snapshot before apply.
│   └── useAudioEngine.ts    Live playback engine — RAF loop, scheduler,
│                            loop-wrap with no audible gap, automation
│                            smoothing, real AnalyserNode-driven meters.
├── lib/
│   ├── lerp.ts              Automation interpolation (linear/step/hold/exp)
│   ├── exportMix.ts         WAV / MP3 / OGG export via a Web Worker
│   ├── exportMp3.ts         @breezystack/lamejs-backed encoder
│   ├── renderMixWorker.ts   Offline render graph (mirrors TrackNode)
│   ├── projectIO.ts         SavedProject serialise/deserialise
│   ├── audioUtils.ts        WAV encoder, data-URL round-trip, format time
│   ├── audioAnalysis.ts     mono mixdown, waveform summary, BPM detection
│   ├── sampleRegistry.ts    In-memory AudioBuffer registry for DnD
│   ├── useDAWKeyboard.ts     Global keyboard shortcuts hook
│   ├── useBufferRehydration.ts  Async clip re-decode after project load
│   └── cssVars.ts            CSS variable helpers for canvas theming
├── components/
│   ├── DAWLayout.tsx        Top-level shell (nav rail + workspace + bottom)
│   ├── Transport.tsx        BPM, time sig, play/stop, snap, loop, export
│   ├── ShortcutsOverlay.tsx Keyboard-shortcut modal
│   ├── Timeline/            Track headers, rows, clip blocks, ruler, marquee
│   ├── Mixer/               Channel strip, master strip, real meters
│   ├── PianoRoll/           Note grid, velocity editor, instrument picker
│   ├── Effects/             Tabbed EQ/Reverb/Delay/Chorus/Comp/Limiter panel
│   ├── Mastering/           AI mastering suggestions
│   └── AutomationLane/      Canvas-based automation curve editor
├── types.ts                 Domain types + defaults (EffectChain, SynthPreset…)
├── constants.ts             Theming tokens (CSS-var backed), TRACK_COLORS, DEFAULTS
├── i18n.ts                  en / tr locale store
├── index.ts                 Public API surface
├── App.tsx                  Default-exports DAWLayout (dev convenience)
└── main.tsx                 Vite dev entry (port 5175)
```

### Store boundaries

- **`useDAWStore`** owns the *project model*. Undo/redo, dirty flag, transport,
  tracks, automation lanes. History is module-level and snapshot-based (200ms
  debounce collapses drags into one step).
- **`useAudioEngine`** owns *runtime playback*. It subscribes to the project
  store via `subscribeWithSelector` keyed by a `projectSignature()` — UI-only
  mutations (zoom, selection, shortcuts panel) don't trigger a graph resync.

### Audio graph per track

```
gain → panner → EQ → reverb → delay → chorus → comp → limiter → analyser → master
```

All six effects are always instantiated (eager allocation, lenient at runtime
for short sessions). `TrackNode.dispose()` disconnects everything when a track
is removed — no leaked `AudioNode`s across a long session. The offline render
worker (`renderMixWorker.ts`) builds the same graph so live playback and export
sound identical.

### Performance notes

- Mixer meters read the per-track `AnalyserNode` (Faz 2.1) — no fake random
  animation.
- Loop wrap re-schedules clips at the current `AudioContext.currentTime`
  rather than `stop() + play()` (Faz 2.2) — no audible gap at the loop point.
- Automation params go through `setTargetAtTime` (Faz 2.3) — no zipper noise.
- Playhead position is pushed to Zustand state at most ~30 fps (Faz 2.7)
  while the RAF scheduler keeps full 60 fps resolution for clip scheduling.
- `useBufferRehydration` subscribes to a narrow `(clipId,url)` signature
  instead of the entire `tracks` array (Faz 2.8) — fader moves no longer
  iterate all clips.
- Reverb IR regenerates are throttled to 80ms during `roomSize` drags (Faz 2.5).
- `audioBufferToDataUrl`, `audioAnalysis.*` and the export pipeline use the
  shared singleton `AudioContext` (Faz 0.6 / 2.6) — no `AudioContext` cap leaks.

## Public API

See `src/index.ts` for the exact list. The most-used exports are:

```ts
import {
  // Components & hooks
  DAWLayout, useDAWStore, useAudioEngine,
  // Audio helpers used by host apps
  exportMix, exportMixMp3, exportMixOgg, renderMix,
  serializeProject, deserializeProject, encodeProject, decodeProject,
  // Audio buffers / analysis
  audioBufferToWav, audioBufferToDataUrl, dataUrlToAudioBuffer,
  analyzeAudio, analyzeAudioBuffer, computeWaveformData, detectBPM, mixToMono,
  // Context entries
  getAudioContext, decodeWithContext, closeContext,
  // Sample registry for DnD ingestion
  registerBuffer, lookupBuffer, unregisterBuffer,
  // Locale
  setDAWLang,
  // Types
  type SavedProject, type SerializedTrack, type DAWTrack, type EffectChain,
  type ChorusSettings, type EQSettings, type ReverbSettings, type DelaySettings,
  type CompressorSettings, type LimiterSettings,
  type TransportState, type SynthPreset, type AudioClip, type MidiClip, type MidiNote,
} from '@sonaralabs/daw-studio'
```

## Keyboard shortcuts

| Key | Action |
|---|---|
| Space | Play / Pause |
| Shift+Space | Stop |
| `L` | Toggle loop |
| `[` / `]` | Set loop in / out at playhead |
| `S` or `G` | Toggle snap |
| `M` | Mute selected track |
| `B` | Solo selected track |
| `Ctrl+A` | Select all clips on selected track |
| `Ctrl+C` / `Ctrl+V` | Copy / paste selected clips |
| `Ctrl+D` | Duplicate selected clip |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |
| `Home` / `End` | Seek to start / end of project |
| `+` / `−` | Zoom in / out |
| `?` | Open the keyboard-shortcut overlay |
| `Esc` | Close overlay / clear selection |

## Development

```bash
pnpm install
pnpm --filter @sonaralabs/daw-studio dev:app   # Vite playground at :5175
pnpm --filter @sonaralabs/daw-studio build     # tsc type-check only
pnpm --filter @sonaralabs/daw-studio test      # vitest in jsdom env
```

Tests run under jsdom with a light mock `AudioContext` registered in
`src/__test__/`.  Engine / effect / store / export / encode / projectIO tests
are provided; React Testing Library is intentionally not yet wired up
(component-level tests are a future task).

## Project save / load

`serializeProject(tracks, transport, name)` produces JSON-safe
`SavedProject` (AudioBuffer NOT embedded — only `url` references survive).
`deserializeProject(...)` reattaches `buffer: null` on every audio clip so
`useBufferRehydration` re-decodes lazily after the host rehydrates URLs.

```ts
const project = serializeProject(useDAWStore.getState().tracks, transport, 'My Beat')
const json = encodeProject(project)
// persist → then later:
const back = decodeProject(json)
const { tracks, transport: t2 } = deserializeProject(back)
useDAWStore.getState().loadTracks(tracks)
useDAWStore.getState().loadTransport(t2)
useDAWStore.getState().markSaved()
```

## License

AGPL-3.0-only — © 2026 Yunus Emre Aslan. See `../LICENSE` at the repo root.