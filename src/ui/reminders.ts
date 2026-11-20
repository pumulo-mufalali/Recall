/**
 * Session reminders while Recall is open (any tab, even in the background): a system
 * notification at each session's reminder time. When Recall is closed, the learner's own
 * calendar does the reminding (see Plan: "Add to calendar"), so no server is needed.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Session } from '../core/plan';

export type Permission = 'unsupported' | NotificationPermission;

const supported = () => typeof Notification !== 'undefined';
const FIRED = 'recall.reminded';

/** Notification permission, and a way to ask for it. */
export function useNotifyPermission(): [Permission, () => Promise<void>] {
  const [state, setState] = useState<Permission>(() => (supported() ? Notification.permission : 'unsupported'));
  const ask = useCallback(async () => {
    if (!supported()) return;
    setState(await Notification.requestPermission());
  }, []);
  return [state, ask];
}

/** Shows a notification; clicking it opens `hash` in Recall. */
export async function notify(title: string, body: string, hash: string, tag: string): Promise<void> {
  if (!supported() || Notification.permission !== 'granted') return;
  const options: NotificationOptions = { body, tag, icon: '/favicon.svg', data: { url: `/${hash}` } };
  // Phones only show notifications through the service worker (see public/sw-notify.js for the click).
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (reg) return reg.showNotification(title, options);
  const n = new Notification(title, options);
  n.onclick = () => {
    focus();
    location.hash = hash;
    n.close();
  };
}

function fired(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FIRED) ?? '[]'));
  } catch {
    return new Set();
  }
}

function markFired(id: string) {
  try {
    const all = [...fired(), id].slice(-200);
    localStorage.setItem(FIRED, JSON.stringify(all));
  } catch {
    // Storage blocked: a reload may remind twice, which is harmless.
  }
}

/**
 * Schedules a notification for each upcoming session's reminder in the next day. Each fires once,
 * even across reloads; timers are rebuilt when sessions change and every half hour.
 */
export function useReminders(sessions: Session[], describe: (s: Session) => { title: string; body: string; hash: string }): void {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30 * 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!supported()) return;
    const done = fired();
    const now = Date.now();
    const timers = sessions
      .filter((s) => s.remind > 0 && !done.has(s.id))
      .map((s) => ({ s, when: Date.parse(s.at) - s.remind * 60_000 }))
      .filter(({ s, when }) => when < now + 86_400_000 && Date.parse(s.at) > now)
      .map(({ s, when }) =>
        setTimeout(() => {
          const d = describe(s);
          markFired(s.id);
          void notify(d.title, d.body, d.hash, `session-${s.id}`);
        }, Math.max(0, when - now)),
      );
    return () => timers.forEach(clearTimeout);
  }, [sessions, describe, tick]);
}
