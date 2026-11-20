/**
 * Light, dark or follow the system. The choice is kept on this device and applied as
 * data-theme="light" | "dark" on <html>, which the stylesheet keys its colours on.
 * index.html applies the saved choice before the app loads, so pages never flash the
 * wrong theme.
 */
import { useSyncExternalStore } from 'react';

export type Theme = 'system' | 'light' | 'dark';

const KEY = 'recall.theme';
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

let theme = read();

function apply() {
  const resolved = theme === 'system' ? (dark.matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
}

// When following the system, switch as the system does.
dark.addEventListener('change', () => {
  if (theme === 'system') apply();
});
apply();

export function setTheme(t: Theme) {
  theme = t;
  try {
    if (t === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    // Storage blocked: the choice lasts for this visit.
  }
  apply();
  listeners.forEach((l) => l());
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => theme,
  );
}
