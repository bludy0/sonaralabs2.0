import { useState, useEffect } from 'react'

/**
 * :root'tan CSS değişkeninin hesaplanmış değerini döndürür.
 * Canvas 2D API CSS değişkenlerini çözemediği için bu helper gereklidir.
 * Örnek: getCSSVar('--daw-deep') → '#0e0e10'
 */
export function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'
}

/**
 * data-theme-light ve style değişimlerini izleyen versiyon sayacı.
 * Canvas draw useEffect bağımlılığına ekleyerek tema değişince
 * canvas'ın yeniden çizilmesini sağlar.
 */
export function useThemeVersion(): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    const obs = new MutationObserver(() => setV(n => n + 1))
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'data-theme-light'],
    })
    return () => obs.disconnect()
  }, [])
  return v
}
