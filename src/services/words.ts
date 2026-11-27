/**
 * The learner's own words: what they typed or said for each answer, and the feedback written
 * about it. These are kept only in this browser, never in the account, so a wrong answer is never
 * stored anywhere else. The account keeps the rest of each answer (score, confidence, the key
 * points covered and missed), so progress, insights and the schedule still follow the learner
 * to other devices; there, old answers show without their words.
 */
export interface Words {
  answer: string;
  feedback: string;
}

/** Enough for months of study; the oldest go first. */
const MAX = 2000;
const key = (uid: string) => `recall.words.${uid}`;

export function allWords(uid: string): Record<string, Words> {
  try {
    return JSON.parse(localStorage.getItem(key(uid)) ?? '{}') as Record<string, Words>;
  } catch {
    return {};
  }
}

/** Saves the words of answers, by attempt id. Storage blocked or full: the words are not kept. */
export function keepWords(uid: string, add: Record<string, Words>): void {
  try {
    const all = { ...allWords(uid), ...add };
    const ids = Object.keys(all);
    for (const id of ids.slice(0, Math.max(0, ids.length - MAX))) delete all[id];
    localStorage.setItem(key(uid), JSON.stringify(all));
  } catch {
    // Private window or full storage: this session still shows them; they are just not kept.
  }
}

export function forgetWords(uid: string): void {
  try {
    localStorage.removeItem(key(uid));
  } catch {
    // Nothing was stored.
  }
}
