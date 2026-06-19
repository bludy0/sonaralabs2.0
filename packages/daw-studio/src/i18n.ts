import { create } from 'zustand'

export type DAWLang = 'en' | 'tr'

export interface DAWTranslations {
  addAudio: string; addMidi: string;
  aiMastering: string; beta: string; applyAll: string; analyzeMix: string;
  reanalyzeMix: string; analyzing: string; mixLooksGreat: string; applied: string;
  apply: string; analyzeMixHint: string;
  snap: string; aiGenerate: string; aiMelodyGenerator: string; describeMelody: string;
  keyLabel: string; scaleLabel: string; barsLabel: string; creditWarning: string;
  cancel: string; generate: string; generating: string; selectMidiClip: string;
  shortcuts: string; shortcutsTitle: string; gridLabel: string;
  snapOnTitle: string; snapOffTitle: string; zoomFit: string;
}

const DICT: Record<DAWLang, DAWTranslations> = {
  en: {
    addAudio:         '+Audio',
    addMidi:          '+MIDI',
    aiMastering:      'AI Mastering',
    beta:             'Beta',
    applyAll:         'Apply All',
    analyzeMix:       'Analyze Mix',
    reanalyzeMix:     'Re-analyze Mix',
    analyzing:        'Analyzing…',
    mixLooksGreat:    'Your mix looks great — no suggestions!',
    applied:          'Applied',
    apply:            'Apply',
    analyzeMixHint:   'Click Analyze Mix to get AI suggestions for your track effects, levels, and dynamics.',
    snap:             'Snap',
    aiGenerate:       '✨ AI Generate',
    aiMelodyGenerator:'✨ AI Melody Generator',
    describeMelody:   'Describe the melody',
    keyLabel:         'Key',
    scaleLabel:       'Scale',
    barsLabel:        'Bars',
    creditWarning:    '1 credit will be charged. Notes will replace the current clip content.',
    cancel:           'Cancel',
    generate:         '✨ Generate',
    generating:       'Generating…',
    selectMidiClip:   'Select a MIDI clip to open the Piano Roll',
    shortcuts:        'Keyboard Shortcuts',
    shortcutsTitle:   'Keyboard Shortcuts (?) — View all available shortcuts',
    gridLabel:        'Grid',
    snapOnTitle:      'Snap ON (S) — Clips snap to the beat grid while dragging',
    snapOffTitle:     'Snap OFF (S) — Clips move freely; click to snap to the grid',
    zoomFit:          'Fit — Zoom to show the whole project',
  },
  tr: {
    addAudio:         '+Ses',
    addMidi:          '+MIDI',
    aiMastering:      'AI Mastering',
    beta:             'Beta',
    applyAll:         'Tümünü Uygula',
    analyzeMix:       'Mix Analiz Et',
    reanalyzeMix:     'Yeniden Analiz Et',
    analyzing:        'Analiz Ediliyor…',
    mixLooksGreat:    "Mix'in harika görünüyor — öneri yok!",
    applied:          'Uygulandı',
    apply:            'Uygula',
    analyzeMixHint:   "Parça efektlerin, seviyelerin ve dinamiklerin için AI önerileri almak için Analiz Et'e tıkla.",
    snap:             'Hizala',
    aiGenerate:       '✨ AI Üret',
    aiMelodyGenerator:'✨ AI Melodi Üretici',
    describeMelody:   'Melodiyi tanımla',
    keyLabel:         'Ton',
    scaleLabel:       'Gam',
    barsLabel:        'Ölçü',
    creditWarning:    '1 kredi harcanacak. Notlar mevcut klip içeriğini değiştirecek.',
    cancel:           'İptal',
    generate:         '✨ Üret',
    generating:       'Üretiliyor…',
    selectMidiClip:   "Piano Roll'u açmak için bir MIDI klibi seç",
    shortcuts:        'Klavye Kısayolları',
    shortcutsTitle:   'Klavye Kısayolları (?) — Tüm kısayolları görüntüle',
    gridLabel:        'Izgara',
    snapOnTitle:      'Hizalama AÇIK (S) — Klipler sürüklerken vuruş ızgarasına oturur',
    snapOffTitle:     'Hizalama KAPALI (S) — Klipler serbest hareket eder; ızgaraya oturtmak için tıkla',
    zoomFit:          'Sığdır — Tüm projeyi görünecek şekilde yakınlaştır',
  },
}

interface DAWi18nState {
  lang: DAWLang
  dt:   DAWTranslations
}

export const useDAWi18nStore = create<DAWi18nState>(() => ({
  lang: 'tr',
  dt:   DICT['tr'],
}))

export function setDAWLang(lang: DAWLang): void {
  useDAWi18nStore.setState({ lang, dt: DICT[lang] })
}

export function useDAWT(): DAWTranslations {
  return useDAWi18nStore(s => s.dt)
}
