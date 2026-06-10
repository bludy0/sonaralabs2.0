// Timeline cetveli — canvas 2D çizimi.
// CSS değişkenleri canvas API tarafından çözülemediğinden getCSSVar() ile
// hesaplanan değerler kullanılır; çağıran taraf themeVersion ile yeniden çizdirir.
import { getCSSVar } from '../../lib/cssVars'
import type { TransportState } from '../../types'

export const RULER_H = 28

export function pickStep(zoom: number): number {
  if (zoom > 200) return 0.25
  if (zoom > 80)  return 0.5
  if (zoom > 40)  return 1
  if (zoom > 20)  return 2
  return 4
}

function formatTime(s: number): string {
  const m  = Math.floor(s / 60)
  const ss = (s % 60).toFixed(1)
  return m > 0 ? `${m}:${ss.padStart(4, '0')}` : `${ss}s`
}

export function drawRuler(canvas: HTMLCanvasElement, zoom: number, transport: TransportState) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width

  // Renkleri çözümle (her çizimde taze değer)
  const bgSubtle  = getCSSVar('--daw-subtle')
  const border    = getCSSVar('--daw-border')
  const text2     = getCSSVar('--daw-text2')
  const text3     = getCSSVar('--daw-text3')

  ctx.clearRect(0, 0, W, RULER_H)
  ctx.fillStyle = bgSubtle
  ctx.fillRect(0, 0, W, RULER_H)

  // Bottom border line
  ctx.fillStyle = border
  ctx.fillRect(0, RULER_H - 1, W, 1)

  const step  = pickStep(zoom)
  const total = W / zoom + 4

  ctx.font      = '10px "Inter", system-ui'
  ctx.textAlign = 'left'
  ctx.lineWidth = 1

  for (let t = 0; t < total; t += step) {
    const x       = Math.round(t * zoom)
    const isMajor = Math.round(t / step) % 4 === 0
    ctx.beginPath()
    ctx.moveTo(x, isMajor ? 6 : 16)
    ctx.lineTo(x, RULER_H - 1)
    ctx.strokeStyle = isMajor ? text3 : border
    ctx.stroke()
    if (isMajor) {
      ctx.fillStyle = text2
      ctx.fillText(formatTime(t), x + 2, 9)
    }
  }

  // Draw loop markers when loop is enabled
  if (transport.loopEnabled) {
    const accentHex = getCSSVar('--daw-accent') || '#ffdc73'
    ctx.fillStyle = accentHex

    const startX = Math.round(transport.loopStart * zoom)
    const endX   = Math.round(transport.loopEnd   * zoom)

    // Start triangle (pointing down)
    ctx.beginPath()
    ctx.moveTo(startX - 5, 0)
    ctx.lineTo(startX + 5, 0)
    ctx.lineTo(startX, 9)
    ctx.closePath()
    ctx.fill()
    // Start line
    ctx.fillRect(startX, 0, 1, RULER_H)

    // End triangle
    ctx.beginPath()
    ctx.moveTo(endX - 5, 0)
    ctx.lineTo(endX + 5, 0)
    ctx.lineTo(endX, 9)
    ctx.closePath()
    ctx.fill()
    // End line
    ctx.fillRect(endX - 1, 0, 1, RULER_H)
  }
}
