/**
 * The last-resort marker: no model at all (offline, on a device without a built-in model).
 * Checks each key point against the answer by the overlap of meaningful words, with light
 * stemming, so "photosynthesis converts light" matches "converting light in photosynthesis".
 * Coarser than a model, so its feedback says so; the learner can keep studying anyway.
 */
import type { Grade } from './types';

const STOP = new Set(
  'a an the and or but of to in on at by for with from into as is are was were be been being it its this that these those which who whom what when where why how than then so such not no can could will would should may might must do does did has have had their there they them he she his her we our you your i'.split(' '),
);

/** Lowercase content words, crudely stemmed. */
export function terms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w)).map(stem);
}

function stem(w: string): string {
  for (const suffix of ['ations', 'ation', 'ings', 'ing', 'ies', 'ied', 'ers', 'er', 'es', 'ed', 'ly', 's']) {
    if (w.length - suffix.length < 4 || !w.endsWith(suffix)) continue;
    // A plain "s" is a plural only after a letter that is not s or u: "nucleus", "glass" keep it.
    if (suffix === 's' && /[su]s$/.test(w)) return w;
    return w.slice(0, -suffix.length);
  }
  return w;
}

/** A key point counts as covered when at least this share of its terms appear. */
const COVER = 0.6;

export function localGrade(answer: string, keyPoints: string[]): Grade {
  const said = new Set(terms(answer));
  const covered: string[] = [];
  const missing: string[] = [];
  for (const point of keyPoints) {
    const t = [...new Set(terms(point))];
    const hit = t.length ? t.filter((w) => said.has(w)).length / t.length : 0;
    (hit >= COVER ? covered : missing).push(point);
  }
  const score = keyPoints.length ? covered.length / keyPoints.length : 0;
  return {
    score,
    covered,
    missing,
    feedback: missing.length
      ? `Marked offline by matching words, so check it yourself. Not found: ${missing.join('; ')}.`
      : 'Marked offline by matching words: every key point seems to be there.',
    engine: 'local',
  };
}
