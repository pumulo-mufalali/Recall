import { describe, expect, it } from 'vitest';
import { claimedNumbers, judge, labels, normalise, numbers, quoted, toChecks, type CheckReply } from './verify';

const card = {
  prompt: 'What are the half kilo additional rates for UK Zone 1 and Zone 2?',
  answer: 'The half kilo additional rate is £4.28 for Zone 1 and £4.33 for Zone 2.',
  keyPoints: ['Zone 1 is £4.28', 'Zone 2 is £4.33'],
};

describe('numbers', () => {
  it('normalises currency, separators and trailing zeros', () => {
    expect(numbers('£4.53, 6,000 cm and 0.50kg or .5')).toEqual(['4.53', '6000', '0.5', '0.5']);
  });
});

describe('claimedNumbers', () => {
  it('skips numbers the question gives and names like "Zone 1"', () => {
    expect(claimedNumbers({ prompt: 'What is the cost for a 10 kg shipment from the USA to Zone 2?', answer: 'A 10 kg shipment to Zone 2 costs £147.97.', keyPoints: ['Weight is 10 kg', 'Cost is £147.97'] })).toEqual(['147.97']);
    expect(claimedNumbers({ prompt: 'What does Delivery Zone 2 cover?', answer: 'All other towns not listed in Zone 1.', keyPoints: ['All other towns'] })).toEqual([]);
  });
  it('still checks values attached to names', () => {
    expect(claimedNumbers({ prompt: 'Rates?', answer: 'Zone 2 costs £4.33.', keyPoints: [] })).toEqual(['4.33']);
  });
  it('does not mistake a value for a label', () => {
    expect([...labels('Lusaka 3.82 and Chapter 4')]).toEqual(['4']);
  });
});

describe('quoted', () => {
  it('finds quotes despite case, punctuation and spacing', () => {
    expect(quoted('Lusaka: £3.82  Z1: £4.28', 'HALF KILO THEREAFTER Lusaka: £3.82 Z1: £4.28 Z2: £4.53')).toBe(true);
    expect(quoted('Volume weight is length times width', 'Length x Width x Height')).toBe(false);
  });
  it('accepts a quote split with an ellipsis', () => {
    expect(quoted('All charges will be charged … current market rate', 'All charges will be charged in Zambian ZKW at the current market rate of exchange.')).toBe(true);
  });
  it('keeps decimal points', () => {
    expect(normalise('Z2: £4.53.')).toBe('z2 4.53');
  });
});

describe('judge', () => {
  const evidence = 'HALF KILO THEREAFTER Lusaka: £3.82 Z1: £4.28 Z2: £4.53';

  it('catches a misread number even when the checker says supported', () => {
    const reply: CheckReply = { verdict: 'supported', evidence, issue: '' };
    const check = judge(card, reply);
    expect(check.status).toBe('flagged');
    expect(check.notes.join(' ')).toContain('4.33');
  });
  it('says "not in the quoted passage" for files, "not in your material" for text', () => {
    const c = { prompt: 'q?', answer: 'It costs £9.99.', keyPoints: [] };
    expect(judge(c, { verdict: 'supported', evidence: 'It costs a lot', issue: '' }).notes[0]).toContain('not in the passage the checker quoted');
    expect(judge(c, { verdict: 'supported', evidence: 'It costs a lot', issue: '' }, 'It costs a lot.').notes[0]).toContain('not appear in your material');
  });
  it('passes a card whose numbers are all in the evidence', () => {
    const right = { ...card, answer: '£4.28 for Zone 1 and £4.53 for Zone 2.', keyPoints: ['Zone 1 is £4.28', 'Zone 2 is £4.53'] };
    expect(judge(right, { verdict: 'supported', evidence, issue: '' }).status).toBe('verified');
  });
  it('offers the correction for a wrong card', () => {
    const check = judge(card, { verdict: 'wrong', evidence, issue: 'Zone 2 is £4.53, not £4.33.', answer: '£4.28 for Zone 1 and £4.53 for Zone 2.', keyPoints: ['Zone 1 is £4.28', 'Zone 2 is £4.53'] });
    expect(check.status).toBe('flagged');
    expect(check.notes[0]).toBe('Zone 2 is £4.53, not £4.33.');
    expect(check.correction?.answer).toContain('4.53');
  });
  it('rejects evidence that is not in the learner\'s text', () => {
    const right = { prompt: 'q?', answer: 'Plants make sugar from light.', keyPoints: ['sugar from light'] };
    const check = judge(right, { verdict: 'supported', evidence: 'Plants make sugar from sunlight energy.', issue: '' }, 'Photosynthesis turns light into chemical energy.');
    expect(check.status).toBe('flagged');
    expect(check.notes).toContain('The quoted evidence is not in your material.');
  });
  it('a card with no verdict is unchecked, not verified', () => {
    expect(judge(card, undefined).status).toBe('unchecked');
  });
});

describe('toChecks', () => {
  it('keeps valid entries by card number', () => {
    const m = toChecks({ checks: [{ card: 2, verdict: 'Wrong', evidence: 'x', issue: 'y' }, { card: 9, verdict: 'supported' }, { card: '1', verdict: 'maybe' }] }, 3);
    expect([...m.keys()]).toEqual([1]);
    expect(m.get(1)?.verdict).toBe('wrong');
  });
});
