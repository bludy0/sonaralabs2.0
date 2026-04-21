// Automation interpolation — used internally by useAudioEngine
export function lerp(
  points: { time: number; value: number }[],
  time: number,
): number {
  if (!points.length) return 0
  if (time <= points[0].time) return points[0].value
  for (let i = 1; i < points.length; i++) {
    if (time <= points[i].time) {
      const a = points[i - 1]
      const b = points[i]
      const t = (time - a.time) / (b.time - a.time)
      return a.value + (b.value - a.value) * t
    }
  }
  return points[points.length - 1].value
}
