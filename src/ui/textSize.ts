/**
 * Text size, kept on this device: normal or large. Applied as data-text on <html>, which scales
 * the whole interface (sizes are in rem). index.html applies it before the app loads.
 */
import { useSyncExternalStore } from 'react';

export type TextSize = 'normal' | 'large';

const KEY = 'recall.text';
const listeners = new Set<() => void>();

function read(): TextSize {
  try {
    return localStorage.getItem(KEY) === 'large' ? 'large' : 'normal';
  } catch {
    return 'normal';
  }
}

let size = read();
const apply = () => {
  if (size === 'large') document.documentElement.dataset.text = 'large';
  else delete document.documentElement.dataset.text;
};
apply();

export function setTextSize(s: TextSize) {
  size = s;
  try {
    if (s === 'normal') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, s);
  } catch {
    // Storage blocked: the choice lasts for this visit.
  }
  apply();
  listeners.forEach((l) => l());
}

export function useTextSize(): TextSize {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => size,
  );
}
