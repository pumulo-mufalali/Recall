/**
 * Example data, so a visitor (a judge, say) can explore everything Recall does without first
 * studying for weeks: three decks, about ten weeks of answers, the self-audit's history,
 * Trap Gauntlet runs and a planned session. Opt-in (a button on the first screen), stored in the
 * visitor's own account, and marked `example` so it can be removed on its own.
 *
 * Pure and deterministic for a given `now`: the same history every time. Each card's schedule is
 * its answers replayed through the real scheduler, so what is due is what Recall would decide.
 */
import { newSrs, review } from './schedule';
import { RIGHT } from './calibration';
import type { Attempt, Card, Confidence, Deck, Engine } from './types';
import type { Audit } from './audit';
import type { GauntletRun } from './gauntlet';
import type { Session } from './plan';

export interface ExampleData {
  decks: Deck[];
  cards: Card[];
  attempts: Attempt[];
  audits: Audit[];
  runs: GauntletRun[];
  sessions: Session[];
}

type QA = [prompt: string, answer: string, keyPoints: string[]];

const DECKS: { id: string; title: string; source: Deck['source']; ageDays: number; cards: QA[] }[] = [
  {
    id: 'example-vaccines',
    title: 'How vaccines work',
    source: 'text',
    ageDays: 68,
    cards: [
      ['What does a vaccine train the immune system to do?', 'To recognise a specific germ, using a harmless version or piece of it, so the body can fight the real thing quickly.', ['recognise a specific germ', 'using a harmless version or part of it', 'respond quickly to the real thing']],
      ['What is an antigen?', 'A molecule, often a protein on a germ’s surface, that the immune system recognises and responds to.', ['a molecule on a germ’s surface', 'recognised by the immune system', 'triggers an immune response']],
      ['What do memory B cells do after vaccination?', 'They remember the antigen, so on real exposure they quickly make large amounts of the right antibody.', ['remember the antigen', 'respond quickly on later exposure', 'make the right antibodies']],
      ['Why do some vaccines need booster doses?', 'Protection from some vaccines fades over time; a booster reminds the immune system and keeps protection high.', ['protection fades over time', 'a booster reminds the immune system', 'keeps protection high']],
      ['What is herd immunity?', 'When enough people are immune, a germ cannot spread easily, which protects people who cannot be vaccinated.', ['enough people are immune', 'the germ cannot spread easily', 'protects those who cannot be vaccinated']],
      ['How does an mRNA vaccine produce an immune response?', 'Cells read the mRNA and briefly make a harmless spike protein, which trains the immune system to recognise the virus.', ['cells read the mRNA', 'make a harmless spike protein', 'the immune system learns to recognise it']],
      ['What is the difference between active and passive immunity?', 'Active immunity is made by your own immune system and lasts; passive immunity is borrowed antibodies and fades in weeks.', ['active: your own immune system makes it', 'passive: antibodies are given', 'passive immunity fades quickly']],
      ['Why are live attenuated vaccines not given to everyone?', 'They contain a weakened live germ, which could cause illness in people with weak immune systems.', ['contain a weakened live germ', 'risky for weak immune systems']],
    ],
  },
  {
    id: 'example-membranes',
    title: 'Cell biology, chapter 3: membranes',
    source: 'image',
    ageDays: 38,
    cards: [
      ['What is the fluid mosaic model?', 'The membrane is a fluid phospholipid bilayer with proteins that move within it, like a mosaic.', ['phospholipid bilayer', 'fluid: components move', 'proteins embedded like a mosaic']],
      ['What is diffusion?', 'The net movement of particles from a higher to a lower concentration, without using energy.', ['high to low concentration', 'net movement of particles', 'no energy needed']],
      ['What is osmosis?', 'The diffusion of water across a partially permeable membrane, from a dilute to a more concentrated solution.', ['movement of water', 'across a partially permeable membrane', 'dilute to concentrated']],
      ['What is active transport?', 'Moving substances against their concentration gradient, using energy from ATP and carrier proteins.', ['against the concentration gradient', 'uses energy (ATP)', 'carrier proteins']],
      ['Why are phospholipids arranged in a bilayer?', 'Their hydrophilic heads face the water on both sides, while the hydrophobic tails face inwards.', ['hydrophilic heads face water', 'hydrophobic tails face inwards']],
      ['What does cholesterol do in the membrane?', 'It regulates fluidity, keeping the membrane stable across temperatures.', ['regulates fluidity', 'stability across temperatures']],
    ],
  },
  {
    id: 'example-revolution',
    title: 'The French Revolution',
    source: 'pdf',
    ageDays: 5,
    cards: [
      ['When did the storming of the Bastille happen?', 'On 14 July 1789.', ['14 July 1789']],
      ['What was the Estates-General?', 'An assembly of the three estates of France: clergy, nobility and commoners.', ['an assembly', 'three estates', 'clergy, nobility, commoners']],
      ['What was the Tennis Court Oath?', 'The Third Estate’s vow not to disband until France had a new constitution.', ['the Third Estate', 'vowed not to disband', 'until a new constitution']],
      ['What did the Declaration of the Rights of Man state?', 'That people are born and remain free and equal in rights.', ['born free', 'equal in rights']],
      ['What was the Reign of Terror?', 'A period of mass executions of supposed enemies of the revolution, led by the Committee of Public Safety.', ['mass executions', 'enemies of the revolution', 'Committee of Public Safety']],
      ['Who rose to power after the revolution?', 'Napoleon Bonaparte, who seized power in 1799.', ['Napoleon Bonaparte', 'seized power in 1799']],
    ],
  },
];

const DAY = 86_400_000;

/** A small seeded random generator (mulberry32), so the history is the same every time. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What a learner might write, from the key points they remembered. */
function answerText(points: string[]): string {
  if (!points.length) return 'I am not sure.';
  const s = points.join(', and ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

export function exampleData(now: Date): ExampleData {
  const rand = seeded(20261126);
  const at = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString();

  const decks: Deck[] = DECKS.map((d) => ({ id: d.id, title: d.title, createdAt: at(d.ageDays * DAY), source: d.source, cardCount: d.cards.length }));
  const cards: Card[] = DECKS.flatMap((d) =>
    d.cards.map(([prompt, answer, keyPoints], i) => ({
      id: `${d.id}-${i}`,
      deckId: d.id,
      prompt,
      answer,
      keyPoints,
      createdAt: at(d.ageDays * DAY),
      madeBy: (i % 3 ? 'on-device' : 'cloud') as Engine,
      srs: newSrs(new Date(now.getTime() - d.ageDays * DAY)),
    })),
  );

  // How well each card is known: some easy, some stubborn. The newest deck is half unstudied.
  const skill = new Map(cards.map((c, i) => [c.id, 0.2 + ((i * 37) % 50) / 100]));
  const studied = (c: Card) => !(c.deckId === 'example-revolution' && Number(c.id.split('-').pop()) >= 3);

  const attempts: Attempt[] = [];
  const engines: Engine[] = ['on-device', 'on-device', 'on-device', 'cloud', 'on-device', 'cloud', 'local', 'on-device'];
  // Studied most days over ten weeks (none today, so the visitor's own session starts fresh).
  for (let daysAgo = 68; daysAgo >= 1; daysAgo--) {
    if (daysAgo > 7 && (daysAgo % 6 === 2 || daysAgo % 11 === 5)) continue;
    const pool = cards.filter((c) => studied(c) && Date.parse(c.createdAt) <= now.getTime() - daysAgo * DAY);
    if (!pool.length) continue;
    const count = 2 + Math.floor(rand() * 6);
    for (let k = 0; k < count; k++) {
      const card = pool[Math.floor(rand() * pool.length)];
      // How sure the learner feels grows with practice; whether they are right follows it, but
      // "Certain" is a little overconfident, which is what Insights is there to show.
      const progress = (68 - daysAgo) / 68;
      const feel = skill.get(card.id)! * 0.7 + progress * 0.3 + (rand() - 0.5) * 0.55;
      const confidence: Confidence = feel > 0.62 ? 4 : feel > 0.44 ? 3 : feel > 0.27 ? 2 : 1;
      const chance = [0, 0.15, 0.42, 0.64, 0.72][confidence] + progress * 0.08;
      const right = rand() < chance;
      const n = card.keyPoints.length;
      const got = right ? n : Math.min(n - 1, Math.floor(rand() * n));
      const covered = card.keyPoints.slice(0, got);
      const score = covered.length / n;
      const missing = card.keyPoints.filter((p) => !covered.includes(p));
      const engine = engines[(daysAgo + k) % engines.length];
      const when = new Date(now.getTime() - daysAgo * DAY + (9 + k * 0.2 + rand() * 9) * 3_600_000 - 12 * 3_600_000);
      attempts.push({
        id: `example-a${daysAgo}-${k}`,
        cardId: card.id,
        deckId: card.deckId,
        at: when.toISOString(),
        answer: answerText(covered),
        confidence,
        grade: {
          score,
          covered,
          missing,
          feedback: missing.length ? (covered.length ? `Good start. You left out: ${missing[0]}.` : `Not yet: it is about ${card.keyPoints[0]}.`) : 'Spot on: every key point is there.',
          engine,
          ...(engine === 'cloud' && k % 3 === 0 ? { check: { kind: 'escalated' as const, nano: Math.max(0, score - 0.34), cloud: score, agree: false } } : {}),
        },
        mode: k % 7 === 3 ? 'oral' : 'typed',
      });
      skill.set(card.id, Math.min(0.9, skill.get(card.id)! + (score >= RIGHT ? 0.012 : 0.02)));
    }
  }
  attempts.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  // Each card's schedule: its answers replayed through the real scheduler.
  for (const a of attempts) {
    const card = cards.find((c) => c.id === a.cardId)!;
    card.srs = review(card.srs, a.grade.score, a.confidence, new Date(a.at));
  }

  // The self-audit: the cloud checked a sample of Nano's marks, and mostly agreed.
  const audits: Audit[] = Array.from({ length: 46 }, (_, i) => {
    const escalated = i % 7 === 3;
    const agree = !(i % 9 === 4 || i % 13 === 6);
    const nano = 0.4 + ((i * 37) % 60) / 100;
    return {
      id: `example-audit-${i}`,
      cardId: cards[i % cards.length].id,
      at: at((i * 0.6 + 0.3) * DAY),
      nano,
      cloud: agree ? nano : Math.max(0, nano - 0.45),
      agree,
      doubt: escalated ? 0.62 : 0.15,
      kind: escalated ? 'escalated' : 'spot-check',
    };
  });

  // A few Trap Gauntlets this week; none today, so today's game (and its XP) is still there to play.
  const runs: GauntletRun[] = [
    [6, 9, 4, 6, 0],
    [5, 12, 5, 7, 1],
    [3, 6, 3, 6, 0],
    [2, 15, 6, 7, 1],
  ].map(([daysAgo, points, right, answered, withdrawn]) => ({
    id: `example-run-${daysAgo}`,
    at: at(daysAgo * DAY - 2 * 3_600_000),
    points,
    right,
    answered,
    withdrawn,
    counted: true,
  }));

  // A session planned for later today (or tomorrow evening, if it is already late).
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 3);
  if (start.getHours() < 8 || start.getDate() !== now.getDate()) {
    start.setTime(now.getTime() + DAY);
    start.setHours(18, 0, 0, 0);
  }
  const sessions: Session[] = [{ id: 'example-session', at: start.toISOString(), minutes: 25, deckId: 'example-vaccines', remind: 10, createdAt: now.toISOString() }];

  return { decks, cards, attempts, audits, runs, sessions };
}
