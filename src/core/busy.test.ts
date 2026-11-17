import { describe, expect, it } from 'vitest';
import { isBusy } from './busy';

describe('isBusy', () => {
  it('retries overload and rate limits', () => {
    expect(isBusy(new Error('[500 ] This model is currently experiencing high demand. Please try again later.'))).toBe(true);
    expect(isBusy(new Error('[429 Too Many Requests] Resource exhausted'))).toBe(true);
    expect(isBusy(new Error('[503 ] Service Unavailable'))).toBe(true);
  });
  it('does not retry what retrying cannot fix', () => {
    expect(isBusy(new Error('AppCheck: Fetch server returned an HTTP error status. HTTP status: 403.'))).toBe(false);
    expect(isBusy(new Error('[400 ] Invalid argument: response schema'))).toBe(false);
  });
});
