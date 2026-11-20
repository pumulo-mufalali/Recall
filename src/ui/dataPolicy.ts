/**
 * Whether the built-in AI (a few GB) may be downloaded over mobile data. Off by default, kept on
 * this device. Browsers only report the connection type on some devices (Chrome on Android
 * does; laptops do not), so a download is held back only when the connection is known to be
 * mobile data, or the device asks to save data.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

const KEY = 'recall.mobileData';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'allow';
  } catch {
    return false;
  }
}

let allowMobile = read();

export function setAllowMobileData(allow: boolean) {
  allowMobile = allow;
  try {
    if (allow) localStorage.setItem(KEY, 'allow');
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the choice lasts for this visit.
  }
  listeners.forEach((l) => l());
}

export function useAllowMobileData(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => allowMobile,
  );
}

interface NetworkInformation extends EventTarget {
  type?: string;
  saveData?: boolean;
}
const connection = () => (navigator as Navigator & { connection?: NetworkInformation }).connection;

/** True when the device reports mobile data, or asks to save data. */
function onMobileData(): boolean {
  const c = connection();
  return c?.type === 'cellular' || c?.saveData === true;
}

/** Whether a download should be held back right now, kept live as the connection changes. */
export function useDownloadBlocked(): boolean {
  const allow = useAllowMobileData();
  const [mobile, setMobile] = useState(onMobileData);
  useEffect(() => {
    const c = connection();
    const on = () => setMobile(onMobileData());
    c?.addEventListener('change', on);
    return () => c?.removeEventListener('change', on);
  }, []);
  return mobile && !allow;
}

/** The same check, outside React (for the download confirmation). */
export function downloadBlocked(): boolean {
  return onMobileData() && !allowMobile;
}
