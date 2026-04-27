import { useEffect } from "react";
import { useThemeStore, applyTheme } from "../store/useThemeStore";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeId      = useThemeStore(s => s.themeId);
  const getTheme     = useThemeStore(s => s.getTheme);

  useEffect(() => {
    applyTheme(getTheme().vars);
  }, [themeId]);

  return <>{children}</>;
}
