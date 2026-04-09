import { AutomationLane, DAWTrack } from '../types'

function lerp(points: { time: number; value: number }[], time: number): number {
  if (points.length === 0) return 0.5
  if (points.length === 1) return points[0].value
  if (time <= points[0].time) return points[0].value
  if (time >= points[points.length - 1].time) return points[points.length - 1].value

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (time >= a.time && time <= b.time) {
      const t = (time - a.time) / (b.time - a.time)
      return a.value + t * (b.value - a.value)
    }
  }
  return 0.5
}

export class AutomationEngine {
  applyLane(lane: AutomationLane, currentTime: number, track: DAWTrack, gainNode: GainNode, pannerNode: StereoPannerNode): void {
    if (!lane.enabled || lane.points.length === 0) return
    const value = lerp(lane.points, currentTime)

    switch (lane.parameter) {
      case 'volume':
        gainNode.gain.value = track.muted ? 0 : value
        break
      case 'pan':
        pannerNode.pan.value = (value * 2) - 1
        break
    }
  }
}
