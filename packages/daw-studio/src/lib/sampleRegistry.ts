/**
 * sampleRegistry — shared in-memory store for synthesized / imported AudioBuffers.
 *
 * Why: DataTransfer can only carry strings, not binary objects.
 * The SamplesPanel registers a buffer before drag starts and puts the key in
 * the DnD payload.  TrackRow / Timeline look up the buffer on drop.
 */

const registry = new Map<string, AudioBuffer>()
let _counter = 0

/** Store a buffer and return its stable key. */
export function registerBuffer(buf: AudioBuffer, id?: string): string {
  const key = id ?? `sample-${Date.now()}-${_counter++}`
  registry.set(key, buf)
  return key
}

/** Retrieve a buffer by key. Returns undefined if not found. */
export function lookupBuffer(id: string): AudioBuffer | undefined {
  return registry.get(id)
}

/** Remove a buffer from the registry (call when sample is permanently deleted). */
export function unregisterBuffer(id: string): void {
  registry.delete(id)
}
