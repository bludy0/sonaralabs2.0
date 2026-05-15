import { useEffect, useRef } from "react";
import { useThemeStore, applyTheme } from "../store/useThemeStore";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeId  = useThemeStore(s => s.themeId);
  const getTheme = useThemeStore(s => s.getTheme);
  const isFirst  = useRef(true);

  useEffect(() => {
    // İlk render'ı atla — tema zaten store rehydration'da senkron uygulandı.
    // Böylece auth/landing sayfalarının useFixedTheme'i ezilmez.
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    applyTheme(getTheme().vars);
  }, [themeId]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>;
}
