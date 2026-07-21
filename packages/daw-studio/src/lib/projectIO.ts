// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Yunus Emre Aslan

import type {
  DAWTrack, AudioTrack, MidiTrack, SavedProject, SerializedTrack,
  TransportState, AutomationLane,
} from '../types'

const PROJECT_VERSION = 2

const DEFAULT_TRANSPORT: TransportState = {
  bpm: 120,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 8,
  timeSignature: [4, 4],
  snapEnabled: true,
  snapBeats: 0.5,
}

export interface ProjectRuntimeState {
  automationLanes?: AutomationLane[]
  timelineLength?: number
  masterVolume?: number
}

/**
 * Serialise the current DAW project into a JSON-safe structure.
 *
 * `AudioBuffer`s are NOT embedded (they're巨型 binary blobs that don't belong
 * in JSON); we keep the source `url` on every clip so that the host app, on
 * load, simply needs to set `tracks` via `useDAWStore.getState().loadTracks()`
 * and the bundled {@link useBufferRehydration} hook re-fetches and decodes
 * them asynchronously.  This keeps project files small and lets the host
 * decide where buffers actually come from (CDN, signed-URL, base64, …).
 */
export function serializeProject(
  tracks:         DAWTrack[],
  transport:      TransportState,
  name = 'Untitled',
  runtime: ProjectRuntimeState = {},
): SavedProject {
  const serializedTracks: SerializedTrack[] = tracks.map(t => {
    if (t.type === 'audio') {
      const at = t as AudioTrack
      // Strip the opaque AudioBuffer; preserve url + trim + fades so the clip
      // can be perfectly reconstructed after hydration.
      return {
        ...at,
        clips: at.clips.map(c => {
          const { buffer: _buffer, ...rest } = c
          void _buffer
          return rest
        }),
      } as SerializedTrack
    }
    return t as SerializedTrack   // MIDI tracks are already JSON-serialisable
  })

  return {
    version: PROJECT_VERSION,
    name,
    transport,
    tracks: serializedTracks,
    automationLanes: runtime.automationLanes ?? [],
    timelineLength: Math.max(0, runtime.timelineLength ?? 0),
    masterVolume: Math.max(0, Math.min(1, runtime.masterVolume ?? 0.85)),
    savedAt: new Date().toISOString(),
  }
}

/**
 * Hydrate a SavedProject back into store-ready tracks/transport.  Caller then
 * invokes `useDAWStore.getState().loadTracks(...)` and
 * `useDAWStore.getState().loadTransport(...)`.  `useBufferRehydration()`
 * (mounted inside DAWLayout) takes care of re-decoding audio buffers from each
 * clip's `url` field.
 *
 * Returns the components separately rather than dispatching into the store so
 * callers can preview, migrate old versions, or apply migrations before commit.
 */
export function deserializeProject(project: SavedProject): {
  tracks:          DAWTrack[]
  transport:       TransportState
  automationLanes: AutomationLane[]
  timelineLength:  number
  masterVolume:    number
} {
  // Version 1 projects did not persist automation, timeline length or master
  // volume. Keep them loadable and fill those fields with safe defaults.
  if (project.version < 1 || project.version > PROJECT_VERSION) {
    throw new Error(
      `Unsupported project version: ${project.version}. This build of @sonaralabs/daw-studio understands version ${PROJECT_VERSION}.`,
    )
  }

  // Re-attach `buffer: null` to every audio clip so TrackRow / Timeline treat
  // the clip as "pending hydration" rather than missing.  useBufferRehydration
  // listens for clips with a url but no buffer and decodes them in the
  // background.
  const tracks: DAWTrack[] = (project.tracks as DAWTrack[]).map(t => {
    if (t.type !== 'audio') return t as MidiTrack
    const at = t as AudioTrack
    return {
      ...at,
      clips: at.clips.map(c => ({ ...c, buffer: null })),
    } as AudioTrack
  })

  return {
    tracks,
    transport: { ...DEFAULT_TRANSPORT, ...project.transport },
    automationLanes: Array.isArray(project.automationLanes) ? project.automationLanes : [],
    timelineLength: Math.max(0, project.timelineLength ?? 0),
    masterVolume: Math.max(0, Math.min(1, project.masterVolume ?? 0.85)),
  }
}

/** Convenience: stringify a SavedProject for download/persistence. */
export function encodeProject(project: SavedProject): string {
  return JSON.stringify(project, null, 2)
}

/** Convenience: parse a SavedProject from a string, with light validation. */
export function decodeProject(json: string): SavedProject {
  const obj = JSON.parse(json) as SavedProject
  if (typeof obj.version !== 'number' || !Array.isArray(obj.tracks)) {
    throw new Error('Invalid project file: expected { version, tracks, ... }')
  }
  return obj
}
