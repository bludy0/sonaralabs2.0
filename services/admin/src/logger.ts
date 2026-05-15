/**
 * Lightweight structured logger — no external dependencies.
 * Development: human-readable colored output
 * Production:  JSON lines (stdout) for log aggregators (CloudWatch, ELK, etc.)
 */

const IS_PROD = process.env.NODE_ENV === 'production'
const SVC     = process.env.SERVICE_NAME ?? process.argv[1]?.split('/').slice(-2, -1)[0] ?? 'service'

type Level = 'info' | 'warn' | 'error' | 'debug'

const COLORS: Record<Level, string> = {
  info:  '\x1b[36m',   // cyan
  warn:  '\x1b[33m',   // yellow
  error: '\x1b[31m',   // red
  debug: '\x1b[90m',   // gray
}
const RESET = '\x1b[0m'

function log(level: Level, message: string, meta?: Record<string, unknown>) {
  const ts = new Date().toISOString()
  if (IS_PROD) {
    const entry: Record<string, unknown> = { ts, level, service: SVC, message }
    if (meta) Object.assign(entry, meta)
    process.stdout.write(JSON.stringify(entry) + '\n')
  } else {
    const color = COLORS[level]
    const metaStr = meta ? ' ' + JSON.stringify(meta) : ''
    process.stdout.write(`${color}[${level.toUpperCase()}]${RESET} ${ts} [${SVC}] ${message}${metaStr}\n`)
  }
}

export const logger = {
  info:  (msg: string, meta?: Record<string, unknown>) => log('info',  msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => log('warn',  msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
}
