import { describe, expect, it } from 'vitest';
import { isBusy, modelOrder } from './busy';

describe('isBusy', () => {
  it('retries overload and rate limits', () => {
    expect(isBusy(new Error('[500 ] This model is currently experiencing high demand. Please try again later.'))).toBe(true);
    expect(isBusy(new Error('[429 Too Many Requests] Resource exhausted'))).toBe(true);
    expect(isBusy(new Error('[503 ] Service Unavailable'))).toBe(true);
  });
  it('treats a request that ran out of time as busy, so another model can answer', () => {
    expect(isBusy(new DOMException('Timeout has expired.', 'AbortError'))).toBe(true);
    expect(isBusy(new Error('The operation timed out.'))).toBe(true);
  });
  it('tries models that were busy a moment ago last', () => {
    const resting = new Map([['big', 2000], ['old', 500]]);
    expect(modelOrder(['big', 'small', 'old'], resting, 1000)).toEqual(['small', 'old', 'big']);
    expect(modelOrder(['big', 'small'], new Map(), 1000)).toEqual(['big', 'small']);
  });
  it('does not retry what retrying cannot fix', () => {
    expect(isBusy(new Error('AppCheck: Fetch server returned an HTTP error status. HTTP status: 403.'))).toBe(false);
    expect(isBusy(new Error('[400 ] Invalid argument: response schema'))).toBe(false);
  });
});
