import { create } from "zustand";
import { persist } from "zustand/middleware";
import { en } from "../lib/i18n/en";
import { tr } from "../lib/i18n/tr";
import type { Translations } from "../lib/i18n/en";
import { setDAWLang } from "@sonaralabs/daw-studio";

export type Language = "en" | "tr";

export const LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: "en", label: "English",  flag: "🇬🇧" },
  { code: "tr", label: "Türkçe",   flag: "🇹🇷" },
];

const DICT: Record<Language, Translations> = { en, tr };

interface I18nState {
  lang:    Language;
  t:       Translations;
  setLang: (lang: Language) => void;
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      lang: "tr",   // varsayılan Türkçe
      t:    tr,

      setLang: (lang) => {
        set({ lang, t: DICT[lang] });
        document.documentElement.lang = lang;
        setDAWLang(lang);
      },
    }),
    {
      name: "sonaralabs-lang",
      partialize: (s) => ({ lang: s.lang }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.t = DICT[state.lang];
          document.documentElement.lang = state.lang;
          setDAWLang(state.lang);
        }
      },
    }
  )
);

/** Kısa alias — bileşenler `useT()` ile çeviriyi alır */
export function useT() {
  return useI18nStore(s => s.t);
}
