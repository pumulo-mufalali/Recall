/**
 * Errors in words a learner understands: what happened, and what to do about it. The original
 * message is kept as `detail`, shown only on request, for reporting problems.
 */
import { isBusy } from './busy';

export interface Friendly {
  message: string;
  /** What to try; empty when there is nothing the learner can do. */
  hint: string;
  /** Whether trying again soon has a chance of working. */
  retry: boolean;
  detail: string;
}

/** An error whose message is already written for the learner. */
export class Plain extends Error {
  readonly hint: string;
  readonly retry: boolean;
  constructor(message: string, hint = '', retry = false) {
    super(message);
    this.hint = hint;
    this.retry = retry;
  }
}

export function friendly(e: unknown): Friendly {
  if (e instanceof Plain) return { message: e.message, hint: e.hint, retry: e.retry, detail: e.message };
  const detail = e instanceof Error ? e.message : String(e);
  const text = `${detail} ${(e as { code?: string })?.code ?? ''}`;
  const says = (re: RegExp) => re.test(text);
  const out = (message: string, hint: string, retry: boolean): Friendly => ({ message, hint, retry, detail });

  if (typeof navigator !== 'undefined' && navigator.onLine === false) return out('You are offline.', 'Connect to the internet and try again. Your studying still works offline.', true);
  if (says(/failed to fetch|network ?error|networkerror|load failed|err_internet|timed? ?out/i)) return out('The connection dropped.', 'Check your internet and try again.', true);
  if (says(/quota|per day|daily limit|exceeded your current/i)) return out('The free AI allowance for today is used up.', 'Try again tomorrow, or use the built-in AI on this device.', false);
  if (isBusy(e)) return out('The AI is very busy right now.', 'Wait a minute and try again. This usually passes quickly.', true);
  if (says(/app.?check|appCheck/i)) return out('Recall could not confirm it is the genuine app (App Check).', 'Reload the page. If it keeps happening, the app needs its App Check setup fixed.', true);
  if (says(/popup.closed|cancelled-popup|popup-blocked/i)) return out('Sign-in was cancelled.', 'Try again, and allow the pop-up window if your browser blocks it.', true);
  if (says(/safety|blocked|prohibited|recitation/i)) return out('The AI declined to work with this material.', 'Try different material, or rephrase it.', false);
  if (says(/too large|payload|request size|exceeds|maximum.*(size|tokens)|token limit/i)) return out('This is too large for the AI to read at once.', 'Try a shorter piece, fewer pages, or a smaller photo.', false);
  if (says(/unsupported|mime|invalid.*(image|file)|could not (read|process)|unable to process/i)) return out('The AI could not read this file.', 'Try a clear JPEG or PNG photo, or a PDF.', false);
  if (says(/no json|unexpected token|json\.parse|is not valid json|unterminated/i)) return out('The AI’s reply came back garbled.', 'Try again: it usually works the second time.', true);
  if (says(/not found|404|is not supported for|deprecated|no longer available/i)) return out('The AI model Recall uses is not available.', 'The app’s model settings need updating.', false);
  if (says(/permission|401|403|api key/i)) return out('Recall is not allowed to use the AI service right now.', 'The app’s Firebase setup needs checking.', false);
  return out('Something went wrong.', 'Try again. If it keeps happening, open Details and share it.', true);
}
