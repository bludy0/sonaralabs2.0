export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastEvent {
  id:       number
  message:  string
  type:     ToastType
  duration: number
}

export function toast(
  message:  string,
  type:     ToastType = 'info',
  duration: number    = 4000,
) {
  window.dispatchEvent(
    new CustomEvent<ToastEvent>('sl:toast', {
      detail: { id: Date.now() + Math.random(), message, type, duration },
    }),
  )
}
