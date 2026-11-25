import { describe, expect, it } from 'vitest';
import { recentHistory, tutorSystem, type TutorTurn } from './tutor';
import { route } from './route';

const card = { prompt: 'What is an antigen?', answer: 'A molecule the immune system recognises.', keyPoints: ['molecule', 'recognised by the immune system'] };

describe('tutorSystem', () => {
  it('grounds the tutor in the card and what was missed', () => {
    const s = tutorSystem(card, 'a germ', ['recognised by the immune system'], true);
    expect(s).toContain('Model answer: A molecule the immune system recognises.');
    expect(s).toContain('What the student answered: a germ');
    expect(s).toContain('What the student missed: recognised by the immune system');
    expect(s).toContain('at most 70 words');
  });
  it('allows longer replies in the cloud, and handles an empty answer', () => {
    const s = tutorSystem(card, '   ', [], false);
    expect(s).toContain('at most 150 words');
    expect(s).toContain('What the student answered: (nothing)');
    expect(s).not.toContain('What the student missed');
  });
});

describe('recentHistory', () => {
  const t = (role: TutorTurn['role'], text: string): TutorTurn => ({ role, text });
  it('keeps the latest turns and starts with the learner', () => {
    const turns = [t('user', 'a'), t('model', 'b'), t('user', 'c'), t('model', 'd'), t('user', 'e'), t('model', 'f')];
    expect(recentHistory(turns, 3).map((x) => x.text)).toEqual(['e', 'f']);
    expect(recentHistory(turns, 4).map((x) => x.text)).toEqual(['c', 'd', 'e', 'f']);
  });
  it('drops empty replies', () => {
    expect(recentHistory([t('user', 'a'), t('model', ' '), t('user', 'b')]).map((x) => x.text)).toEqual(['a', 'b']);
  });
});

describe('tutor routing', () => {
  it('runs on the device when Nano is ready, falling back to the cloud only when online', () => {
    expect(route({ kind: 'tutor' }, { online: true, device: 'available' })).toMatchObject({ run: 'model', mode: 'prefer_on_device' });
    expect(route({ kind: 'tutor' }, { online: false, device: 'available' })).toMatchObject({ run: 'model', mode: 'only_on_device' });
  });
  it('uses the cloud without Nano, and needs one or the other', () => {
    expect(route({ kind: 'tutor' }, { online: true, device: 'unavailable' })).toMatchObject({ run: 'model', mode: 'only_in_cloud' });
    expect(route({ kind: 'tutor' }, { online: false, device: 'downloadable' }).run).toBe('local');
  });
});
