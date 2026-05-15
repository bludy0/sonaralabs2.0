import { useEffect } from "react";
import { useThemeStore, applyTheme, PRESET_THEMES } from "../store/useThemeStore";

/**
 * Sayfa mount'ta belirli bir temayı zorla uygular,
 * unmount'ta kullanıcının kendi temasına döner.
 * Login, register ve welcome gibi sayfalar için kullanılır.
 */
export function useFixedTheme(themeId = "cyber-red") {
  const getTheme = useThemeStore(s => s.getTheme);

  useEffect(() => {
    const fixed = PRESET_THEMES.find(t => t.id === themeId) ?? PRESET_THEMES[0];
    applyTheme(fixed.vars);
    return () => { applyTheme(getTheme().vars); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
