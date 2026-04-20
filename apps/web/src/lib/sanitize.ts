const DANGEROUS = /[<>"'&]/g
const ESCAPE_MAP: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '&': '&amp;',
}

export function sanitize(str: string): string {
  return str.replace(DANGEROUS, ch => ESCAPE_MAP[ch])
}

export function stripTags(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim()
}
