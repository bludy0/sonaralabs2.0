// Linear interpolation between sorted { time, value, curve? } points.
//
// Kept as a framework-agnostic util so both the live playback engine
// (useAudioEngine.ts) and the offline render worker can share the same
// implementation, rather than re-implementing it in two places.
//
// Per-point `curve` mode controls how the segment *leaving* a point is shaped:
//
//   'linear' (default) — a mathematically straight line to the next point.
//   'step'              — advance immediately to the next value at the very
//                        end of the segment (staircase).
//   'hold'              — never advance; the point's value lasts until the
//                        next point's time, then jumps (sample-and-hold).
//   'exp'               — exponential ease-out toward the next value, useful
//                        for filter / volume sweeps.  Implemented symmetrically
//                        around the start value and clamped to avoid `Math.pow`
//                        of 0 (which is 1, not the expected attenuation).

export interface LerpPoint {
  time:  number
  value: number
  curve?: 'linear' | 'step' | 'hold' | 'exp'
}

export function lerp(
  points: LerpPoint[],
  time: number,
): number {
  if (!points.length) return 0
  if (time <= points[0].time) return points[0].value
  for (let i = 1; i < points.length; i++) {
    if (time <= points[i].time) {
      const a = points[i - 1]
      const b = points[i]
      const span = b.time - a.time
      // Guard against two coincident points right next to each other.
      const tn = span <= 0 ? 1 : (time - a.time) / span
      switch (a.curve) {
        case 'step':
          // Staircase: keep the *previous* point's value across the whole
          // segment and snap to the next value only at the boundary.  Visually
          // renders as a square wave whose edge sits exactly on the next
          // point.  At the boundary itself the next point is reached, so we
          // return `b.value`.
          return tn >= 1 ? b.value : a.value
        case 'hold':
          // Sample-and-hold: behave exactly like `step` in a renderer — the
          // value of a point persists until the time of the next point.  The
          // distinction is purely conceptual / UI-facing (a "hold" point is
          // drawn as a flat tick with no slope indicator, while "step" is
          // drawn as a right-angle).  At the boundary the next point's value
          // takes over.
          return tn >= 1 ? b.value : a.value
        case 'exp': {
          // Exponential ease-out from `a` to `b`: shape = 1 - (1-t)^2.
          // Stays bounded within [a.value, b.value] and smooths ramps.
          const shaped = 1 - Math.pow(1 - tn, 2)
          return a.value + (b.value - a.value) * shaped
        }
        case 'linear':
        default:
          return a.value + (b.value - a.value) * tn
      }
    }
  }
  return points[points.length - 1].value
}