// ── General MIDI Instrument Definitions ──────────────────────────────────────
// id: gleitz/midi-js-soundfonts instrument name (matches CDN folder names)

export interface Instrument {
  id:       string
  name:     string
  category: string
  emoji:    string
}

export const INSTRUMENTS: Instrument[] = [
  // ── Piano ──────────────────────────────────────────────────────────────────
  { id: 'acoustic_grand_piano', name: 'Grand Piano',     category: 'Piano',    emoji: '🎹' },
  { id: 'electric_piano_1',     name: 'Electric Piano',  category: 'Piano',    emoji: '🎹' },
  { id: 'harpsichord',          name: 'Harpsichord',     category: 'Piano',    emoji: '🎹' },
  // ── Chromatic Perc ─────────────────────────────────────────────────────────
  { id: 'vibraphone',           name: 'Vibraphone',      category: 'Perc',     emoji: '🎵' },
  { id: 'marimba',              name: 'Marimba',         category: 'Perc',     emoji: '🎵' },
  { id: 'xylophone',            name: 'Xylophone',       category: 'Perc',     emoji: '🎵' },
  // ── Organ ──────────────────────────────────────────────────────────────────
  { id: 'rock_organ',           name: 'Rock Organ',      category: 'Organ',    emoji: '🎸' },
  { id: 'church_organ',         name: 'Church Organ',    category: 'Organ',    emoji: '🏛️' },
  // ── Guitar ─────────────────────────────────────────────────────────────────
  { id: 'acoustic_guitar_nylon',name: 'Nylon Guitar',    category: 'Guitar',   emoji: '🎸' },
  { id: 'acoustic_guitar_steel',name: 'Steel Guitar',    category: 'Guitar',   emoji: '🎸' },
  { id: 'electric_guitar_clean',name: 'Clean Guitar',    category: 'Guitar',   emoji: '🎸' },
  { id: 'distortion_guitar',    name: 'Distortion',      category: 'Guitar',   emoji: '🔥' },
  // ── Bass ───────────────────────────────────────────────────────────────────
  { id: 'acoustic_bass',        name: 'Acoustic Bass',   category: 'Bass',     emoji: '🎸' },
  { id: 'electric_bass_finger', name: 'Finger Bass',     category: 'Bass',     emoji: '🎸' },
  { id: 'synth_bass_1',         name: 'Synth Bass',      category: 'Bass',     emoji: '🔊' },
  // ── Strings ────────────────────────────────────────────────────────────────
  { id: 'violin',               name: 'Violin',          category: 'Strings',  emoji: '🎻' },
  { id: 'cello',                name: 'Cello',           category: 'Strings',  emoji: '🎻' },
  { id: 'string_ensemble_1',    name: 'Strings Ens.',    category: 'Strings',  emoji: '🎻' },
  { id: 'pizzicato_strings',    name: 'Pizzicato',       category: 'Strings',  emoji: '🎻' },
  // ── Brass ──────────────────────────────────────────────────────────────────
  { id: 'trumpet',              name: 'Trumpet',         category: 'Brass',    emoji: '🎺' },
  { id: 'trombone',             name: 'Trombone',        category: 'Brass',    emoji: '🎺' },
  { id: 'brass_section',        name: 'Brass Section',   category: 'Brass',    emoji: '🎺' },
  // ── Woodwind ───────────────────────────────────────────────────────────────
  { id: 'soprano_sax',          name: 'Soprano Sax',     category: 'Woodwind', emoji: '🎷' },
  { id: 'alto_sax',             name: 'Alto Sax',        category: 'Woodwind', emoji: '🎷' },
  { id: 'tenor_sax',            name: 'Tenor Sax',       category: 'Woodwind', emoji: '🎷' },
  { id: 'flute',                name: 'Flute',           category: 'Woodwind', emoji: '🎵' },
  { id: 'clarinet',             name: 'Clarinet',        category: 'Woodwind', emoji: '🎵' },
  // ── Synth Lead ─────────────────────────────────────────────────────────────
  { id: 'lead_1_square',        name: 'Square Lead',     category: 'Synth',    emoji: '🔊' },
  { id: 'lead_2_sawtooth',      name: 'Saw Lead',        category: 'Synth',    emoji: '🔊' },
  { id: 'lead_6_voice',         name: 'Voice Lead',      category: 'Synth',    emoji: '🔊' },
  // ── Synth Pad ──────────────────────────────────────────────────────────────
  { id: 'pad_2_warm',           name: 'Warm Pad',        category: 'Synth',    emoji: '🌊' },
  { id: 'pad_3_polysynth',      name: 'Poly Pad',        category: 'Synth',    emoji: '🌊' },
  { id: 'pad_8_sweep',          name: 'Sweep Pad',       category: 'Synth',    emoji: '🌊' },
]

export const DEFAULT_INSTRUMENT_ID = 'acoustic_grand_piano'
export const INSTRUMENT_MAP = new Map(INSTRUMENTS.map(i => [i.id, i]))

/** Group instruments by category for UI rendering */
export function getInstrumentsByCategory(): Map<string, Instrument[]> {
  const map = new Map<string, Instrument[]>()
  for (const inst of INSTRUMENTS) {
    if (!map.has(inst.category)) map.set(inst.category, [])
    map.get(inst.category)!.push(inst)
  }
  return map
}
