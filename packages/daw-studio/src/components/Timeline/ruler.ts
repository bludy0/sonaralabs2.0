// Timeline cetveli — canvas 2D çizimi.
// FL Studio tarzı: bar numaraları (1, 2, 3...) major tick'lerde,
// beat'ler "1.2", "1.3", "1.4" formatında — bar.beat — minor tick'lerde,
// bar label'larından daha soluk.
//
// Önemli mimari karar: canvas her zaman viewport genişliğindedir,
// timeline genişliği kadar DEĞİL.  Scroll position'ı bir offset olarak
// drawRuler'a geçirilir ve ruler sadece görünen kısmı çizer.  Bu sayede:
//   - Çok uzun projelerde canvas 10.000+ px olmaz (performans)
//   - Sticky position'a gerek yok (ruler scroll container DIŞINDA)
//   - Ruler asla "kayıp" olmaz
//
// Retina/HiDPI ekranlarda fontun net görünmesi için devicePixelRatio
// ile canvas internal resolution'ı 2x/3x yapılır, CSS boyutu aynı kalır.
import { getCSSVar } from '../../lib/cssVars'
import type { TransportState } from '../../types'

export const RULER_H = 30   // biraz daha yüksek — font nefes alsın

/** Beat cinsinden adım — zoom'a göre tick sıklığı. */
export function pickStep(zoom: number): number {
  if (zoom > 200) return 0.25   // 1/16
  if (zoom > 80)  return 0.5    // 1/8
  if (zoom > 40)  return 1      // 1/4 (beat)
  if (zoom > 20)  return 2      // 2 beat
  return 4                      // 1 bar @ 4/4
}

/**
 * @param canvas         Ruler canvas elementi (viewport genişliğinde)
 * @param zoom           Piksel / saniye
 * @param transport      BPM + timeSignature + loop bilgisi
 * @param scrollLeft     Scroll container'ın mevcut scroll offset'i (px)
 * @param contentWidth   Tüm timeline içeriğinin piksel genişliği
 */
export function drawRuler(
  canvas: HTMLCanvasElement,
  zoom: number,
  transport: TransportState,
  scrollLeft: number,
  contentWidth: number,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // ── Retina/HiDPI: canvas internal resolution'ı devicePixelRatio ile çarp ──
  const dpr = window.devicePixelRatio || 1
  const cssW = canvas.clientWidth
  const cssH = RULER_H
  const pxW = Math.round(cssW * dpr)
  const pxH = Math.round(cssH * dpr)

  // Canvas attribute'lerini sadece değiştiğinde güncelle (flicker önler)
  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW
    canvas.height = pxH
  }
  // Tüm çizimleri DPI-scale ile yap
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const W = cssW   // artık CSS px cinsinden çalışıyoruz

  // Renkleri çözümle
  const bgBase    = getCSSVar('--daw-base')    || '#1a1a2e'
  const bgSubtle  = getCSSVar('--daw-subtle')  || '#16213e'
  const border    = getCSSVar('--daw-border')  || '#333'
  const borderDim = getCSSVar('--daw-border-dim') || 'rgba(255,255,255,0.04)'
  const text1     = getCSSVar('--daw-text1')   || '#eee'
  const text3     = getCSSVar('--daw-text3')   || '#888'
  const accent    = getCSSVar('--daw-accent')  || '#ffdc73'

  // ── Zemin ──
  ctx.clearRect(0, 0, W, cssH)
  ctx.fillStyle = bgSubtle
  ctx.fillRect(0, 0, W, cssH)

  // Alt border
  ctx.fillStyle = border
  ctx.fillRect(0, cssH - 1, W, 1)

  // ── Müzikal konum hesapları ──
  const secPerBeat  = 60 / transport.bpm
  const beatsPerBar = transport.timeSignature[0]
  const secPerBar   = beatsPerBar * secPerBeat
  const pxPerBar    = secPerBar * zoom
  const pxPerBeat   = secPerBeat * zoom

  // Scroll offset'i: ekranda x=0 olan piksel aslında timeline'da scrollLeft px'e
  // karşılık gelir.  time = (x + scrollLeft) / zoom
  const startTime = scrollLeft / zoom          // saniye — görünür alanın başı
  const endTime   = (scrollLeft + W) / zoom    // saniye — görünür alanın sonu

  // ── Bar arka plan bantları (tek/çift bar) ──
  const startBar = Math.floor(startTime / secPerBar)
  const endBar   = Math.ceil(endTime / secPerBar)
  for (let bar = startBar; bar <= endBar; bar++) {
    if (bar % 2 === 1) {
      const x = Math.round(bar * pxPerBar - scrollLeft)
      ctx.fillStyle = borderDim
      ctx.fillRect(x, 0, Math.ceil(pxPerBar), cssH - 1)
    }
  }

  // ── Label seyrekleme ──
  let labelEveryNBars = 1
  if (pxPerBar < 24) labelEveryNBars = 2
  if (pxPerBar < 12) labelEveryNBars = 4

  // Beat label eşiği
  const showBeatLabels = pxPerBeat > 16 && pxPerBar > 50

  // ── Font ayarı ──
  ctx.font = '600 11px "Inter", -apple-system, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.lineWidth = 1

  // ── Çizim: sadece görünür aralıktaki beat'leri çiz ──
  const startBeat = Math.floor(startTime / secPerBeat)
  const endBeat   = Math.ceil(endTime / secPerBeat)

  const step = pickStep(zoom)

  // Bar çizgilerini önce çiz (alt katman)
  for (let beat = startBeat; beat <= endBeat; beat++) {
    const x = Math.round(beat * pxPerBeat - scrollLeft) + 0.5
    if (x < -1 || x > W + 1) continue

    const beatInBar = beat % beatsPerBar
    const isBar     = beatInBar === 0
    const isHalf    = beatInBar === Math.floor(beatsPerBar / 2)

    if (isBar) {
      // Bar çizgisi — tam yükseklik, belirgin
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, cssH - 1)
      ctx.strokeStyle = text3
      ctx.globalAlpha = 0.6
      ctx.stroke()
      ctx.globalAlpha = 1
    } else {
      // Beat çizgisi — alt yarı, ince
      const tickTop = isHalf ? cssH - 12 : cssH - 8
      ctx.beginPath()
      ctx.moveTo(x, tickTop)
      ctx.lineTo(x, cssH - 1)
      ctx.strokeStyle = border
      ctx.stroke()
    }
  }

  // ── Sub-beat çizgileri (1/8, 1/16) ──
  if (step < 1) {
    const subStart = Math.floor(startTime / (secPerBeat * step))
    const subEnd   = Math.ceil(endTime / (secPerBeat * step))
    for (let s = subStart; s <= subEnd; s++) {
      const beatPos = s * step
      // Tam beat'leri atla
      if (Math.abs(beatPos - Math.round(beatPos)) < 0.001) continue
      const x = Math.round(beatPos * pxPerBeat - scrollLeft) + 0.5
      if (x < -1 || x > W + 1) continue
      ctx.beginPath()
      ctx.moveTo(x, cssH - 5)
      ctx.lineTo(x, cssH - 1)
      ctx.strokeStyle = border
      ctx.globalAlpha = 0.4
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

  // ── Label'lar (üst katman — çizgilerin üstüne) ──
  for (let bar = startBar; bar <= endBar; bar++) {
    if ((bar - 0) % labelEveryNBars !== 0) continue   // 0-tabanlı: bar 0 → "1"

    const x = Math.round(bar * pxPerBar - scrollLeft)
    if (x < -20 || x > W + 20) continue

    // Bar numarası (1-tabanlı) — parlak, tam opakite
    ctx.fillStyle = text1
    ctx.fillText(`${bar + 1}`, x + 5, 4)

    // Beat label'ları bu bar içinde — "1.2", "1.3", "1.4" ...
    if (showBeatLabels) {
      ctx.fillStyle = text3
      ctx.globalAlpha = 0.5
      for (let b = 1; b < beatsPerBar; b++) {
        const bx = Math.round((bar * beatsPerBar + b) * pxPerBeat - scrollLeft)
        if (bx < -20 || bx > W + 20) continue
        ctx.fillText(`${bar + 1}.${b + 1}`, bx + 4, 4)
      }
      ctx.globalAlpha = 1
    }
  }

  // ── Loop markers ──
  if (transport.loopEnabled) {
    ctx.fillStyle = accent

    const startX = Math.round(transport.loopStart * zoom - scrollLeft)
    const endX   = Math.round(transport.loopEnd   * zoom - scrollLeft)

    if (startX > -10 && startX < W + 10) {
      ctx.beginPath()
      ctx.moveTo(startX - 5, 0)
      ctx.lineTo(startX + 5, 0)
      ctx.lineTo(startX, 9)
      ctx.closePath()
      ctx.fill()
      ctx.fillRect(startX, 0, 1, cssH)
    }

    if (endX > -10 && endX < W + 10) {
      ctx.beginPath()
      ctx.moveTo(endX - 5, 0)
      ctx.lineTo(endX + 5, 0)
      ctx.lineTo(endX, 9)
      ctx.closePath()
      ctx.fill()
      ctx.fillRect(endX - 1, 0, 1, cssH)
    }
  }
}