/**
 * What the router needs to know, kept live: the connection, and whether Chrome's built-in
 * model is ready, downloadable, downloading or unavailable (with download progress).
 */
import { useCallback, useEffect, useState } from 'react';
import type { DeviceModel } from '../core/route';
import { deviceModel, downloadDeviceModel } from '../services/engine';

export interface LiveConditions {
  online: boolean;
  device: DeviceModel;
  /** 0..1 while downloading, else null. */
  progress: number | null;
  /** Starts the download; call from a click. */
  download: () => void;
}

export function useConditions(): LiveConditions {
  const [online, setOnline] = useState(navigator.onLine);
  const [device, setDevice] = useState<DeviceModel>('unavailable');
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    return () => {
      removeEventListener('online', on);
      removeEventListener('offline', off);
    };
  }, []);

  // Availability can change (a download finishing in another tab): check now and every 20 s.
  useEffect(() => {
    let alive = true;
    const check = () => deviceModel().then((d) => alive && setDevice(d));
    check();
    const timer = setInterval(check, 20_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const download = useCallback(() => {
    setDevice('downloading');
    setProgress(0);
    downloadDeviceModel((fraction) => setProgress(fraction))
      .then(() => deviceModel().then(setDevice))
      .catch((e) => {
        console.warn('[recall] model download failed', e);
        deviceModel().then(setDevice);
      })
      .finally(() => setProgress(null));
  }, []);

  return { online, device, progress, download };
}
