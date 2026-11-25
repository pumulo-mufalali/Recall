// Stand-in for src/services/gauntlet.ts: canned traps "written on the device", and a referee that
// rules after 3 seconds and withdraws statement 5.
const statements = [
  { card: 0, text: 'An antigen is a molecule that the immune system recognises.', truth: true, why: 'The model answer: a molecule the immune system recognises and responds to.' },
  { card: 0, text: 'An antigen is the whole germ that makes you ill.', truth: false, why: 'It is a molecule, often a surface protein, not the whole germ.' },
  { card: 1, text: 'Booster doses remind the immune system so protection lasts longer.', truth: true, why: 'Memory fades; a booster refreshes it.' },
  { card: 1, text: 'Booster doses are only needed if the first dose failed completely.', truth: false, why: 'They top up protection that wanes over time.' },
  { card: 2, text: 'Herd immunity protects people who cannot be vaccinated.', truth: true, why: 'When most are immune, the germ cannot spread to them.' },
  { card: 2, text: 'Herd immunity means every single person must be vaccinated.', truth: false, why: 'Most, not all, is enough to stop spread.' },
  { card: 3, text: 'Memory B cells help the body respond faster on later exposure.', truth: true, why: 'They remember the antigen.' },
  { card: 3, text: 'Memory B cells destroy germs directly with toxins.', truth: false, why: 'They make antibodies quickly; they do not release toxins.' },
];
export async function gauntletRoute() {
  return { run: 'model', mode: 'only_on_device', chunks: 1, reason: 'Written on this device from your mistakes: instant, and they stay private.' };
}
export async function writeTraps() {
  await new Promise((r) => setTimeout(r, 1200));
  return { value: statements, engine: 'on-device', route: await gauntletRoute() };
}
export async function referee() {
  await new Promise((r) => setTimeout(r, (window as any).__refDelay ?? 3000));
  return {
    rulings: statements.map((_, i) => ({ statement: i, fair: i !== 5, reason: i === 5 ? 'The model answer does not say how many people must be vaccinated, so this cannot be judged.' : 'Matches the model answer.' })),
    route: { run: 'model', mode: 'only_in_cloud', chunks: 1, reason: 'A larger cloud model referees every statement.' },
  };
}
