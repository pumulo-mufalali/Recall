// The video's clock, from the voice: when each part starts, when each highlight's phrase is
// spoken, when each subtitle line begins, and when each recording must start so the screen acts
// on cue. Writes src/plan.json, which the recordings (capture/) and the edit (src/) both follow.
//
// Phrase times come from the voice's pauses: each pause is matched to the punctuation it falls
// at, and words between pauses are spread by their length.
// Usage: node narration/timing.cjs
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/** Seconds before the first words, and the breath between parts. */
const LEAD_IN = 1.2;
const GAP = 1.0;
/** Extra time after a part's words, where the screen needs it before the next part starts. */
const HOLD = { hook: 0.4, add: 0.6, factcheck: 1.2, study: 3.2, audit: 0.8, tutor: 1.2, gauntlet: 1.2, voice: 1.0, engine: 1.0 };
/** The end: the app stays on screen with its address. */
const END = 5;
/** Which recording plays under which parts, and how long it runs before its first part's words. */
const CLIPS = [
  { clip: 'hook', parts: ['hook'], pre: LEAD_IN },
  { clip: 'add', parts: ['add', 'factcheck'], pre: 1.2 },
  { clip: 'study', parts: ['study', 'audit', 'tutor'], pre: 1.2 },
  { clip: 'gauntlet', parts: ['gauntlet'], pre: 1.6 },
  { clip: 'voice', parts: ['voice'], pre: 1.0 },
  { clip: 'engine', parts: ['engine'], pre: 1.4 },
  { clip: 'close', parts: ['close'], pre: 1.4 },
];

const script = JSON.parse(fs.readFileSync(path.join(__dirname, 'script.json'), 'utf8'));
const wavOf = (id) => path.join(__dirname, '..', 'public', 'narration', `${id}.wav`);

/** Maps each character of the text to the moment it is spoken. */
function aligner(text, wav) {
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString());
  // ffmpeg reports silences on stderr.
  const log = spawnSync('ffmpeg', ['-hide_banner', '-i', wav, '-af', 'silencedetect=noise=-38dB:d=0.12', '-f', 'null', '-']).stderr.toString();
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  let pauses = starts.map((s, i) => [s, ends[i] ?? seconds]);
  const speechStart = pauses.length && pauses[0][0] < 0.05 ? pauses[0][1] : 0;
  const speechEnd = pauses.length && pauses[pauses.length - 1][1] > seconds - 0.05 ? pauses[pauses.length - 1][0] : seconds;
  pauses = pauses.filter(([s, e]) => s > speechStart + 0.05 && e < speechEnd - 0.05);

  // Places a pause can fall: after punctuation.
  const marks = [...text.matchAll(/[,.;:?!—](?=\s)/g)].map((m) => m.index + 1);
  const pauseTotal = pauses.reduce((n, [s, e]) => n + (e - s), 0);
  const speaking = speechEnd - speechStart - pauseTotal;
  const estimate = (c) => speechStart + (c / text.length) * (speechEnd - speechStart);
  // Match pauses to punctuation in order, each to the nearest unused mark after the last.
  const anchors = [];
  let from = 0;
  for (const [s, e] of pauses) {
    const mid = (s + e) / 2;
    let best = -1;
    for (let k = from; k < marks.length; k++) if (best < 0 || Math.abs(estimate(marks[k]) - mid) < Math.abs(estimate(marks[best]) - mid)) best = k;
    if (best >= 0 && Math.abs(estimate(marks[best]) - mid) < 2) { anchors.push({ c: marks[best], s, e }); from = best + 1; }
  }
  // Piecewise: speech runs [start, end] in time across [c0, c1] in characters.
  const runs = [];
  let c0 = 0, t0 = speechStart;
  for (const a of anchors) { runs.push({ c0, c1: a.c, t0, t1: a.s }); c0 = a.c; t0 = a.e; }
  runs.push({ c0, c1: text.length, t0, t1: speechEnd });
  const at = (c) => {
    const r = runs.find((x) => c >= x.c0 && c <= x.c1) ?? runs[runs.length - 1];
    return r.t0 + ((c - r.c0) / Math.max(1, r.c1 - r.c0)) * (r.t1 - r.t0);
  };
  return { seconds, speechStart, speechEnd, at, matched: anchors.length, pauses: pauses.length, speaking };
}

/** Subtitle lines: sentences, with long ones broken at a comma near the middle. */
function lines(text) {
  const out = [];
  let i = 0;
  for (const raw of text.match(/[^.?!:;]+[.?!:;]+\s*/g) ?? [text]) {
    const s = raw.trim();
    const start = text.indexOf(s, i);
    i = start + s.length;
    if (s.length <= 84) { out.push({ text: s, c: start }); continue; }
    const commas = [...s.matchAll(/[,—] /g)].map((m) => m.index);
    const mid = commas.sort((x, y) => Math.abs(x - s.length / 2) - Math.abs(y - s.length / 2))[0];
    if (mid) out.push({ text: s.slice(0, mid + 1), c: start }, { text: s.slice(mid + 2), c: start + mid + 2 });
    else out.push({ text: s, c: start });
  }
  return out;
}

let t = LEAD_IN;
const parts = script.segments.map((seg) => {
  const a = aligner(seg.text, wavOf(seg.id));
  const start = t;
  const cue = (phrase) => +(start + a.at(seg.text.toLowerCase().indexOf(phrase.toLowerCase()))).toFixed(2);
  const part = {
    id: seg.id,
    start: +start.toFixed(2),
    seconds: +a.seconds.toFixed(2),
    end: +(start + a.seconds).toFixed(2),
    text: seg.text,
    label: seg.label ?? null,
    highlights: seg.highlights.map((h) => ({ ...h, at: cue(h.phrase) })),
    lines: lines(seg.text).map((l) => ({ text: l.text, at: +(start + a.at(l.c)).toFixed(2) })),
    // When each word starts, for scenes that act on words other than the highlights.
    words: [...seg.text.matchAll(/\S+/g)].map((m) => [m.index, +(start + a.at(m.index)).toFixed(2)]),
  };
  console.log(`${seg.id.padEnd(9)} ${start.toFixed(1).padStart(6)} s  ${a.seconds.toFixed(1)} s spoken, ${a.matched}/${a.pauses} pauses placed`);
  t = start + a.seconds + GAP + (HOLD[seg.id] ?? 0);
  return part;
});
const last = parts[parts.length - 1];
const total = +(last.end + END).toFixed(2);
const byId = Object.fromEntries(parts.map((p) => [p.id, p]));
const clips = CLIPS.map((c) => ({ ...c, start: +(byId[c.parts[0]].start - c.pre).toFixed(2), until: 0 }));
clips.forEach((c, i) => { c.until = clips[i + 1] ? clips[i + 1].start : total; });

fs.writeFileSync(path.join(__dirname, '..', 'src', 'plan.json'), JSON.stringify({ total, end: END, parts, clips }, null, 2) + '\n');
console.log(`total ${total.toFixed(1)} s (${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')})`);
