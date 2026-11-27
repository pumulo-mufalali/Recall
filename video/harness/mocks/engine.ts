// Stand-in for src/services/engine.ts, for filming. Headless browsers have no Gemini Nano, so the
// model replies are scripted, with realistic delays; every route and reason still comes from the
// app's real router (core/route.ts), and conditions say what a Nano-capable Chrome would say.
import { route, type DeviceModel, type Route } from '../../../src/core/route';
import { localGrade } from '../../../src/core/localGrade';
import type { DraftCard } from '../../../src/core/prompts';
import type { CardCheck } from '../../../src/core/verify';
import type { Engine, Grade } from '../../../src/core/types';
import type { Doubt, Decision, Policy, Trust } from '../../../src/core/audit';

const film = () => (window as unknown as { __film: { mark?: 'keep' | 'escalate' | 'spot-check' } }).__film ?? {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Settings = { deviceMaxChars: number; deviceMaxImageBytes: number; cloudGrading: boolean };

export const TEXT_IO = {};
export interface Outcome<T> { value: T; engine: Engine; route: Route }
export interface Hybrid { trust: Trust; policy: Policy }
export interface Marked extends Outcome<Grade> { doubt?: Doubt; decision?: Decision; secondOpinion?: Promise<Grade | null> }
export type Material = { kind: 'text'; text: string } | { kind: 'file'; file: File };
export class Queued extends Error {
  readonly route: Route;
  constructor(r: Route) { super(r.reason); this.route = r; }
}

export async function deviceModel(): Promise<DeviceModel> { return 'available'; }
export async function downloadDeviceModel(): Promise<void> {}
export async function conditions() { return { online: navigator.onLine, device: 'available' as DeviceModel }; }

/** Marks with the key-point matcher's coverage, worded as Nano would; escalation on cue. */
export async function grade(question: string, keyPoints: string[], answer: string, settings: Settings, hybrid?: Hybrid): Promise<Marked> {
  const r = route({ kind: 'grade', chars: answer.length }, await conditions(), settings as never);
  await wait(1100);
  const lexical = localGrade(answer, keyPoints);
  const covered = lexical.covered.length ? lexical.covered : keyPoints.slice(0, 1);
  const missing = keyPoints.filter((k) => !covered.includes(k));
  const score = covered.length / keyPoints.length;
  const feedback = missing.length
    ? `Good start: you got ${covered.length === 1 ? 'the main idea' : 'most of it'}. You left out that it is ${missing[0]}.`
    : 'Spot on: every key point is there.';
  const nano: Grade = { score, covered, missing, feedback, engine: 'on-device' };
  const mode = film().mark ?? 'keep';
  if (mode === 'escalate' && hybrid?.policy !== 'private') {
    const d: Doubt = { value: 0.64, reasons: ['Nano’s mark sat close to the line between right and wrong', 'the word check disagreed'] };
    await wait(1600);
    const cloudScore = Math.min(1, score + 1 / keyPoints.length);
    const cloudCovered = keyPoints.slice(0, Math.round(cloudScore * keyPoints.length));
    const cloud: Grade = { score: cloudScore, covered: cloudCovered, missing: keyPoints.filter((k) => !cloudCovered.includes(k)), feedback: 'Nearly there: you have the core idea, and one detail is missing.', engine: 'cloud', check: { kind: 'escalated', nano: score, cloud: cloudScore, agree: false } };
    return { value: cloud, engine: 'cloud', route: { ...r, reason: `Escalated: ${d.reasons[0]}.` }, doubt: d, decision: { kind: 'escalate', reason: d.reasons[0] } };
  }
  if (mode === 'spot-check') {
    const second = wait(2600).then(() => ({ ...nano, engine: 'cloud' as Engine }));
    return { value: nano, engine: 'on-device', route: { ...r, reason: 'Spot-checked by the cloud (12% of confident marks at Nano’s current trust).' }, doubt: { value: 0.1, reasons: [] }, decision: { kind: 'spot-check', reason: '' }, secondOpinion: second };
  }
  return { value: nano, engine: 'on-device', route: { ...r, reason: 'Nano was sure, and the word check agrees.' }, doubt: { value: 0.1, reasons: [] }, decision: { kind: 'keep', reason: '' } };
}

/** The cards written from the vaccine notes; card 4's number is a misreading the fact-check catches. */
const VACCINE_CARDS: DraftCard[] = [
  { prompt: 'What is an antigen?', answer: 'A molecule, often a protein on a germ’s surface, that the immune system recognises.', keyPoints: ['a molecule, often a surface protein', 'recognised by the immune system'] },
  { prompt: 'What do memory B cells do?', answer: 'They remember an antigen and make the right antibodies quickly on later exposure.', keyPoints: ['remember the antigen', 'respond quickly later'] },
  { prompt: 'Why are booster doses needed?', answer: 'Protection fades over time; a booster reminds the immune system.', keyPoints: ['protection fades', 'reminds the immune system'] },
  { prompt: 'What share of people must be immune for measles herd immunity?', answer: 'About 59% of the population.', keyPoints: ['about 59%'] },
  { prompt: 'How does an mRNA vaccine work?', answer: 'Cells read the mRNA and briefly make a harmless spike protein that trains the immune system.', keyPoints: ['cells read the mRNA', 'make a harmless spike protein', 'trains the immune system'] },
];

export async function cardsFromText(text: string, settings: Settings): Promise<Outcome<DraftCard[]>> {
  const r = route({ kind: 'generate', source: 'text', chars: text.length }, await conditions(), settings as never);
  if (r.run !== 'model') throw new Queued(r);
  await wait(2600);
  return { value: VACCINE_CARDS, engine: r.mode.includes('device') ? 'on-device' : 'cloud', route: r };
}

export async function cardsFromFile(file: File, settings: Settings): Promise<Outcome<DraftCard[]>> {
  const isPdf = file.type === 'application/pdf';
  const r = route(isPdf ? { kind: 'generate', source: 'pdf', bytes: file.size } : { kind: 'generate', source: 'image', mime: file.type, bytes: file.size }, await conditions(), settings as never);
  if (r.run !== 'model') throw new Queued(r);
  await wait(2600);
  return { value: VACCINE_CARDS, engine: r.mode.includes('device') ? 'on-device' : 'cloud', route: r };
}

export async function verifyCards(drafts: DraftCard[], material: Material, settings: Settings): Promise<Outcome<CardCheck[]>> {
  const r = route(material.kind === 'text' ? { kind: 'verify', source: 'text', chars: material.text.length } : { kind: 'verify', source: 'pdf', bytes: material.file.size }, await conditions(), settings as never);
  await wait(2800);
  const checks: CardCheck[] = drafts.map((d) =>
    /59%/.test(d.answer)
      ? {
          status: 'flagged',
          notes: ['The answer says 59%, but the source says about 95%.', 'The number 59 does not appear in your material.'],
          evidence: '“For measles, about 95% of people need to be immune for herd immunity to protect everyone.”',
          correction: { answer: 'About 95% of the population.', keyPoints: ['about 95%'] },
        }
      : { status: 'verified', notes: [], evidence: '“' + d.answer.replace(/\.$/, '') + '.”' },
  );
  return { value: checks, engine: 'cloud', route: r };
}

export async function explain(question: string, _answer: string, _missing: string[], settings: Settings): Promise<Outcome<string>> {
  const r = route({ kind: 'explain' }, await conditions(), settings as never);
  if (r.run !== 'model') throw new Queued(r);
  await wait(1800);
  return { value: `${question.replace(/\?$/, '')}: think of a name tag on a germ. The immune system reads the tag, not the whole germ.`, engine: 'cloud', route: r };
}

// ----- Speech: no sound is needed on film, only the loading and speaking states -----

export const cachedSpeech = () => undefined;
export async function* speechStream(): AsyncGenerator<{ pcm: Uint8Array; rate: number }> {
  await wait(1000);
  const rate = 24_000;
  for (let i = 0; i < 110; i++) { // about 8 s of speaking, long enough to be seen
    yield { pcm: new Uint8Array(rate / 5), rate }; // 0.1 s of near-silence per chunk
    await wait(60);
  }
}
export async function transcribe(): Promise<string> { return ''; }
