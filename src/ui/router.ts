/**
 * Screens as hash routes (#/library, #/deck/abc), so the browser's back button, reloads and
 * links work, offline too: the service worker always serves the same page.
 */
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'today' }
  | { name: 'library' }
  | { name: 'deck'; id: string }
  | { name: 'add' }
  | { name: 'review'; jobId: string }
  | { name: 'study'; deckId?: string; all?: boolean }
  | { name: 'plan' }
  | { name: 'insights' }
  | { name: 'engine' }
  | { name: 'settings' };

export function parse(hash: string): Route {
  const [, a, b, c] = hash.replace(/^#/, '').split('/');
  switch (a) {
    case 'library':
      return { name: 'library' };
    case 'deck':
      return b ? { name: 'deck', id: b } : { name: 'library' };
    case 'add':
      return { name: 'add' };
    case 'review':
      return b ? { name: 'review', jobId: b } : { name: 'today' };
    case 'study':
      return { name: 'study', ...(b ? { deckId: b } : {}), ...(c === 'all' ? { all: true } : {}) };
    case 'plan':
      return { name: 'plan' };
    case 'insights':
      return { name: 'insights' };
    case 'engine':
      return { name: 'engine' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'today' };
  }
}

export function href(r: Route): string {
  switch (r.name) {
    case 'today':
      return '#/';
    case 'deck':
      return `#/deck/${r.id}`;
    case 'review':
      return `#/review/${r.jobId}`;
    case 'study':
      return `#/study${r.deckId ? `/${r.deckId}${r.all ? '/all' : ''}` : ''}`;
    default:
      return `#/${r.name}`;
  }
}

export function go(r: Route, replace = false): void {
  const h = href(r);
  if (replace) history.replaceState(null, '', h);
  else location.hash = h;
  if (replace) dispatchEvent(new HashChangeEvent('hashchange'));
}

/**
 * Makes the address match the screen shown: an unknown or incomplete address (#/foo,
 * #/deck with no deck, an empty one) is replaced by the address of the screen it opens,
 * without adding a history entry.
 */
function canonical(r: Route): void {
  const h = href(r);
  if (location.hash !== h) history.replaceState(null, '', h);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    canonical(parse(location.hash));
    const on = () => {
      const r = parse(location.hash);
      canonical(r);
      setRoute(r);
      scrollTo({ top: 0 });
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}
