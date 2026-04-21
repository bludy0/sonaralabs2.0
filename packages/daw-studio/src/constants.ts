export const C = {
  bgDeep:    '#0b0b0f',
  bgBase:    '#111117',
  bgRaised:  '#18181f',
  bgSubtle:  '#1e1e28',
  bgHover:   '#252532',
  border:    '#2c2c3a',
  borderDim: '#1e1e28',
  accent:    '#7c6dfa',
  accentDim: '#3a3470',
  accentHover: '#9588fc',
  success:   '#2dca72',
  warning:   '#f5a623',
  error:     '#ff5757',
  text1:     '#eeeef6',
  text2:     '#8888a2',
  text3:     '#44445a',
  playhead:  '#7c6dfa',
  loopBg:    'rgba(245,166,35,0.08)',
  loopBorder:'#f5a623',
} as const

export const TRACK_COLORS = [
  '#e06c75',
  '#e5975c',
  '#e5c07b',
  '#61afef',
  '#56b6c2',
  '#c678dd',
  '#98c379',
  '#be5046',
] as const

export const DEFAULTS = {
  BPM: 120,
  VOLUME: 0.8,
  MASTER_VOLUME: 0.85,
  SAMPLE_RATE: 44100,
  PIXELS_PER_SECOND: 80,
  MIN_ZOOM: 20,
  MAX_ZOOM: 400,
  SNAP_GRID: 0.25,    // 1/4 beat in seconds at 120bpm → 0.125s, but we use beat fractions
  MAX_TRACKS: 16,
} as const
