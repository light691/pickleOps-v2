export type ThemeMode = "dark" | "light";

const THEME_STORAGE_KEY = "pickleops.theme";

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light";
}

export function readTheme(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeMode(stored)) return stored;
  } catch {
    // Storage is unavailable; fall through to the default.
  }
  return "dark";
}

export function applyTheme({ theme }: { theme: ThemeMode }): void {
  document.documentElement.dataset["theme"] = theme;
}

export function toggleTheme({ theme }: { theme: ThemeMode }): ThemeMode {
  const next: ThemeMode = theme === "dark" ? "light" : "dark";
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage is unavailable; the attribute still flips for this session.
  }
  applyTheme({ theme: next });
  return next;
}
