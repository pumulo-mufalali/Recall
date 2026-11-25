// Study data for filming: three decks of real questions with their own model answers and key
// points, ten weeks of answers, and the self-audit's history (for the trust gauge).
import type { Attempt, Card, Deck } from '../../../src/core/types';
import type { Audit } from '../../../src/core/audit';

const day = 86_400_000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

export const decks: Deck[] = [
  { id: 'd1', title: 'How vaccines work', createdAt: iso(40 * day), source: 'text', cardCount: 8 },
  { id: 'd2', title: 'Cell biology, chapter 3: membranes', createdAt: iso(20 * day), source: 'image', cardCount: 6 },
  { id: 'd3', title: 'The French Revolution', createdAt: iso(5 * day), source: 'pdf', cardCount: 6 },
];

type QA = [prompt: string, answer: string, keyPoints: string[]];
const content: Record<string, QA[]> = {
  d1: [
    // A session opens on the most overdue review: card 1 (card 0 is new), then card 2.
    ['What does a vaccine train the immune system to do?', 'To recognise a specific germ, using a harmless version or piece of it, so the body can fight the real thing quickly.', ['recognise a specific germ', 'using a harmless version or part of it', 'respond quickly to the real thing']],
    ['What is an antigen?', 'A molecule, often a protein on a germ’s surface, that the immune system recognises and responds to.', ['a molecule on a germ’s surface', 'recognised by the immune system', 'triggers an immune response']],
    ['What do memory B cells do after vaccination?', 'They remember the antigen, so on real exposure they quickly make large amounts of the right antibody.', ['remember the antigen', 'respond quickly on later exposure', 'make the right antibodies']],
    ['Why do some vaccines need booster doses?', 'Protection from some vaccines fades over time; a booster reminds the immune system and keeps protection high.', ['protection fades over time', 'a booster reminds the immune system', 'keeps protection high']],
    ['What is herd immunity?', 'When enough people are immune, a germ cannot spread easily, which protects people who cannot be vaccinated.', ['enough people are immune', 'the germ cannot spread easily', 'protects those who cannot be vaccinated']],
    ['How does an mRNA vaccine produce an immune response?', 'Cells read the mRNA and briefly make a harmless spike protein, which trains the immune system to recognise the virus.', ['cells read the mRNA', 'make a harmless spike protein', 'the immune system learns to recognise it']],
    ['What is the difference between active and passive immunity?', 'Active immunity is made by your own immune system and lasts; passive immunity is borrowed antibodies and fades in weeks.', ['active: your own immune system makes it', 'passive: antibodies are given', 'passive immunity fades quickly']],
    ['Why are live attenuated vaccines not given to everyone?', 'They contain a weakened live germ, which could cause illness in people with weak immune systems.', ['contain a weakened live germ', 'risky for weak immune systems']],
  ],
  d2: [
    ['What is the fluid mosaic model?', 'The membrane is a fluid phospholipid bilayer with proteins that move within it, like a mosaic.', ['phospholipid bilayer', 'fluid: components move', 'proteins embedded like a mosaic']],
    ['What is diffusion?', 'The net movement of particles from a higher to a lower concentration, without using energy.', ['high to low concentration', 'net movement of particles', 'no energy needed']],
    ['What is osmosis?', 'The diffusion of water across a partially permeable membrane, from a dilute to a more concentrated solution.', ['movement of water', 'across a partially permeable membrane', 'dilute to concentrated']],
    ['What is active transport?', 'Moving substances against their concentration gradient, using energy from ATP and carrier proteins.', ['against the concentration gradient', 'uses energy (ATP)', 'carrier proteins']],
    ['Why are phospholipids arranged in a bilayer?', 'Their hydrophilic heads face the water on both sides, while the hydrophobic tails face inwards.', ['hydrophilic heads face water', 'hydrophobic tails face inwards']],
    ['What does cholesterol do in the membrane?', 'It regulates fluidity, keeping the membrane stable across temperatures.', ['regulates fluidity', 'stability across temperatures']],
  ],
  d3: [
    ['When did the storming of the Bastille happen?', 'On 14 July 1789.', ['14 July 1789']],
    ['What was the Estates-General?', 'An assembly of the three estates of France: clergy, nobility and commoners.', ['an assembly', 'three estates', 'clergy, nobility, commoners']],
    ['What was the Tennis Court Oath?', 'The Third Estate’s vow not to disband until France had a new constitution.', ['the Third Estate', 'vowed not to disband', 'until a new constitution']],
    ['What did the Declaration of the Rights of Man state?', 'That people are born and remain free and equal in rights.', ['born free', 'equal in rights']],
    ['What was the Reign of Terror?', 'A period of mass executions of supposed enemies of the revolution, led by the Committee of Public Safety.', ['mass executions', 'enemies of the revolution', 'Committee of Public Safety']],
    ['Who rose to power after the revolution?', 'Napoleon Bonaparte, who seized power in 1799.', ['Napoleon Bonaparte', 'seized power in 1799']],
  ],
};

export const cards: Card[] = [];
decks.forEach((d) => {
  content[d.id].forEach(([prompt, answer, keyPoints], i) => {
    const state = (i % 4) as 0 | 1 | 2 | 3;
    const dueSoon = d.id === 'd1' ? i < 5 : i % 3 === 1;
    cards.push({
      id: `${d.id}-c${i}`,
      deckId: d.id,
      prompt,
      answer,
      keyPoints,
      createdAt: d.createdAt,
      madeBy: i % 3 ? 'on-device' : 'cloud',
      srs: {
        // The vaccine deck's cards are due first, in order, so a session opens on "What is an antigen?".
        due: dueSoon ? iso(d.id === 'd1' ? day * (10 - i) : day * 0.3) : new Date(Date.now() + (((i * 5 + Number(d.id.slice(1)) * 3) % 13) + 1) * day).toISOString(),
        stability: 3, difficulty: 5, scheduledDays: 2, learningSteps: 0, reps: state ? 3 : 0, lapses: 0, state,
        lastReview: state ? iso(2 * day) : undefined,
      },
    });
  });
});

export const attempts: Attempt[] = [];
for (let d = 0; d < 70; d++) {
  if (d % 6 === 2) continue;
  const n = (d * 7) % 9;
  for (let k = 0; k < n; k++) {
    const c = cards[(d + k) % cards.length];
    const score = ((d + k) % 5) / 4;
    attempts.push({
      id: `a${d}-${k}`, cardId: c.id, deckId: c.deckId, at: iso(d * day + k * 60_000),
      answer: c.answer.split(',')[0],
      confidence: ((k % 4) + 1) as 1 | 2 | 3 | 4,
      grade: { score, covered: c.keyPoints.slice(0, Math.round(score * c.keyPoints.length)), missing: c.keyPoints.slice(Math.round(score * c.keyPoints.length)), feedback: 'Good start: one point is still missing.', engine: k % 3 ? 'on-device' : 'cloud' },
    });
  }
}

/** The self-audit's checks: mostly agreeing, a few escalations and disagreements. */
export const audits: Audit[] = Array.from({ length: 46 }, (_, i) => {
  const escalated = i % 7 === 3;
  const agree = !(i % 9 === 4 || i % 13 === 6);
  const nano = 0.4 + ((i * 37) % 60) / 100;
  return {
    id: `au${i}`,
    cardId: cards[i % cards.length].id,
    at: iso(i * 0.6 * day),
    nano,
    cloud: agree ? nano : Math.max(0, nano - 0.45),
    agree,
    doubt: escalated ? 0.62 : 0.15,
    kind: escalated ? 'escalated' : 'spot-check',
  };
});
