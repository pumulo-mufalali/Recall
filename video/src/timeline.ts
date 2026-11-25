/**
 * The edit: for each narration segment, the stretch of footage under it (played faster or slower
 * so it fits the words exactly), where the camera looks and when, and the labels that name each
 * Firebase AI Logic technique as it is shown. Boxes are in the recordings' CSS pixels (1600 × 900).
 */
import narration from './narration.json';

export const FPS = 30;
export type Box = [x: number, y: number, w: number, h: number];

/** The camera: at clip time `at` (seconds), frame `box` (or the whole screen). */
export interface Shot { at: number; box?: Box; zoom?: number }
/** A label naming a technique, shown from a fraction of the segment to another. */
export interface Tag { from: number; to?: number; kind: 'device' | 'cloud' | 'hybrid' | 'code'; title: string; detail?: string }

export interface Segment {
  id: keyof typeof narration;
  chapter: string;
  clip?: string;
  /** The stretch of the clip to play, in seconds. */
  range?: [number, number];
  shots?: Shot[];
  tags: Tag[];
}

export const SEGMENTS: Segment[] = [
  {
    id: 'hook',
    chapter: 'Recall',
    clip: 'hook',
    range: [7, 33],
    shots: [
      { at: 7 },
      { at: 9.5, box: [436, 200, 976, 170] },
      { at: 17, box: [560, 230, 520, 140], zoom: 1.9 },
      { at: 25.5, box: [436, 380, 976, 230] },
      { at: 30.5 },
    ],
    tags: [
      { from: 0.08, to: 0.45, kind: 'hybrid', title: 'Study app for active recall', detail: 'Questions from your notes, marked in your own words' },
      { from: 0.55, kind: 'hybrid', title: 'Firebase AI Logic hybrid inference', detail: 'Gemini Nano on device  +  Gemini in the cloud' },
    ],
  },
  {
    id: 'add',
    chapter: '1 · Make questions',
    clip: 'add',
    range: [2.8, 38.6],
    shots: [
      { at: 2.8 },
      { at: 7.5, box: [436, 270, 760, 480] },
      { at: 10, box: [436, 610, 760, 140], zoom: 1.9 },
      { at: 14.8, box: [436, 60, 760, 560] },
      { at: 16.4, box: [436, 470, 760, 140], zoom: 1.9 },
      { at: 22.2, box: [436, 180, 760, 420] },
      { at: 23.7, box: [436, 470, 760, 140], zoom: 1.9 },
      { at: 29.5, box: [436, 180, 760, 600] },
      { at: 36.5, box: [436, 560, 760, 300] },
    ],
    tags: [
      { from: 0.22, to: 0.45, kind: 'device', title: 'prefer_on_device', detail: 'Notes and photos → Gemini Nano, built into Chrome' },
      { from: 0.45, to: 0.66, kind: 'cloud', title: 'only_in_cloud', detail: 'A PDF → Gemini in the cloud' },
      { from: 0.68, kind: 'code', title: 'Structured output, both engines', detail: 'responseConstraint on device · responseSchema in the cloud' },
    ],
  },
  {
    id: 'factcheck',
    chapter: '1 · Make questions',
    clip: 'add',
    range: [38.6, 62],
    shots: [
      { at: 38.6, box: [600, 60, 650, 420] },
      { at: 43.4, box: [436, 110, 760, 180], zoom: 1.8 },
      { at: 47.4, box: [436, 220, 760, 460] },
      { at: 52, box: [436, 380, 760, 220], zoom: 1.7 },
      { at: 59.6, box: [436, 220, 760, 460] },
    ],
    tags: [
      { from: 0.05, to: 0.55, kind: 'cloud', title: 'A second, larger cloud model', detail: 'Fact-checks every card against your material' },
      { from: 0.55, kind: 'code', title: 'Quoted evidence + numbers checked in code', detail: '59% vs 95% → flagged, with a fix' },
    ],
  },
  {
    id: 'study',
    chapter: '2 · Study',
    clip: 'study',
    range: [0, 33.5],
    shots: [
      { at: 0, box: [420, 80, 760, 560] },
      { at: 4, box: [420, 480, 760, 120], zoom: 1.8 },
      { at: 8.5, box: [420, 260, 760, 230], zoom: 1.75 },
      { at: 25.5, box: [420, 80, 760, 600] },
      { at: 29.2, box: [420, 270, 760, 330], zoom: 1.6 },
    ],
    tags: [
      { from: 0.1, to: 0.3, kind: 'hybrid', title: 'Confidence first', detail: 'Calibration: what you think you know vs what you know' },
      { from: 0.32, to: 0.62, kind: 'device', title: 'On-device speech recognition', detail: 'Type or speak in the same box · your voice stays local' },
      { from: 0.66, kind: 'device', title: 'only_on_device', detail: 'Gemini Nano marks it: instant, free, private, offline' },
    ],
  },
  {
    id: 'audit',
    chapter: '3 · Self-audit',
    clip: 'study',
    range: [33.5, 66.5],
    shots: [
      { at: 33.5, box: [420, 270, 760, 160], zoom: 1.9 },
      { at: 38.5, box: [420, 80, 760, 600] },
      { at: 52.3, box: [420, 260, 760, 400] },
      { at: 55.6, box: [420, 280, 760, 120], zoom: 1.9 },
      { at: 62.5, box: [420, 230, 760, 400] },
    ],
    tags: [
      { from: 0.12, to: 0.5, kind: 'hybrid', title: 'Every Nano mark is weighed for doubt', detail: 'Own confidence · word check · distance from the line' },
      { from: 0.5, to: 0.78, kind: 'cloud', title: 'Doubtful → escalated to the cloud', detail: 'Confident → a sample is spot-checked in the background' },
      { from: 0.78, kind: 'device', title: 'Trust is earned, and measured', detail: 'More agreement → less ever leaves your device' },
    ],
  },
  {
    id: 'tutor',
    chapter: '4 · Talk it through',
    clip: 'study',
    range: [66.5, 89],
    shots: [
      { at: 66.5, box: [420, 500, 760, 300] },
      { at: 70.5, box: [420, 420, 760, 380] },
      { at: 78.3, box: [420, 280, 760, 500] },
    ],
    tags: [
      { from: 0.1, to: 0.5, kind: 'device', title: 'startChat · sendMessageStream', detail: 'A chat session streaming on Gemini Nano' },
      { from: 0.5, kind: 'cloud', title: 'Handoff to the cloud', detail: 'Same history → only_in_cloud · badged by inferenceSource' },
    ],
  },
  {
    id: 'gauntlet',
    chapter: '5 · The Trap Gauntlet',
    clip: 'gauntlet',
    range: [2.5, 36.5],
    shots: [
      { at: 2.5, box: [420, 120, 760, 460] },
      { at: 4.6, box: [420, 180, 760, 120], zoom: 1.7 },
      { at: 7, box: [420, 60, 760, 420] },
      { at: 13.5, box: [420, 60, 760, 160], zoom: 1.8 },
      { at: 18, box: [420, 60, 760, 420] },
      { at: 31.5, box: [420, 60, 760, 160], zoom: 1.8 },
    ],
    tags: [
      { from: 0.1, to: 0.42, kind: 'device', title: 'Nano writes truths and traps', detail: 'Structured output, on device, from your own mistakes' },
      { from: 0.42, to: 0.78, kind: 'cloud', title: 'A cloud referee, in parallel', detail: 'Rules every statement · withdraws unfair ones live' },
      { from: 0.78, kind: 'hybrid', title: 'Honest confidence earns XP', detail: 'Sure and right +3 · sure and wrong −2' },
    ],
  },
  {
    id: 'voice',
    chapter: '6 · Read aloud',
    clip: 'voice',
    range: [3, 14.2],
    shots: [
      { at: 3, box: [420, 60, 760, 420] },
      { at: 4.4, box: [420, 70, 760, 200], zoom: 1.95 },
      { at: 10.5, box: [420, 60, 760, 420] },
    ],
    tags: [
      { from: 0.08, kind: 'cloud', title: 'Gemini text-to-speech', detail: 'Through Firebase AI Logic · generateContentStream · ~1 s to first sound' },
    ],
  },
  {
    id: 'engine',
    chapter: '7 · The router, live',
    clip: 'engine',
    // Played at ~1.55×, so the trust panel is on screen for "Private mode", the configuration
    // card for "Remote Config" and the cloud card ("Protected by Firebase App Check") for "App Check".
    range: [0.3, 27.5],
    shots: [
      { at: 0.3, box: [436, 30, 976, 380] },
      { at: 4.6, box: [457, 70, 935, 540] },
      { at: 14.6, box: [436, 24, 976, 424] },
      { at: 15.6, box: [436, 60, 976, 150], zoom: 1.75 },
      { at: 18, box: [955, 624, 437, 184], zoom: 1.9 },
      { at: 22.8, box: [767, 160, 315, 194], zoom: 2.1 },
    ],
    tags: [
      { from: 0.12, to: 0.46, kind: 'hybrid', title: 'Offline: the routes change live', detail: 'Device keeps marking, tutoring, the gauntlet · PDFs queue' },
      { from: 0.46, to: 0.66, kind: 'device', title: 'Private mode → only_on_device', detail: 'Never prefer_on_device, which could fall back to the cloud' },
      { from: 0.66, kind: 'code', title: 'Remote Config + App Check', detail: 'Models and limits from Remote Config · App Check on every cloud call' },
    ],
  },
  { id: 'close', chapter: 'Recall', tags: [] },
];

/** Seconds of title before the first words, the pause between segments, and the end card after the last. */
export const LEAD_IN = 1.6;
export const GAP = 0.45;
export const END_CARD = 5.5;

export interface Placed extends Segment { start: number; seconds: number; text: string }

export const PLACED: Placed[] = (() => {
  let t = LEAD_IN;
  return SEGMENTS.map((s) => {
    const n = narration[s.id];
    const placed = { ...s, start: t, seconds: n.seconds, text: n.text };
    t += n.seconds + GAP;
    return placed;
  });
})();

const last = PLACED[PLACED.length - 1];
export const TOTAL_SECONDS = last.start + last.seconds + END_CARD;
export const TOTAL_FRAMES = Math.ceil(TOTAL_SECONDS * FPS);
