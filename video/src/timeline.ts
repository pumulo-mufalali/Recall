/**
 * The edit, worked out from two sources: src/plan.json (from the voice: when each part, line and
 * highlight's phrase is spoken) and public/clips/<clip>.json (from the recordings: where each one
 * sits in the video, and when and where the cursor pointed, a ring belongs, or a click landed).
 * The recordings were acted out on the voice's cues, so they play at normal speed; nothing here
 * is tuned by hand. Boxes are in the recordings' CSS pixels (1600 × 900).
 */
import plan from './plan.json';
import cHook from '../public/clips/hook.json';
import cAdd from '../public/clips/add.json';
import cStudy from '../public/clips/study.json';
import cGauntlet from '../public/clips/gauntlet.json';
import cVoice from '../public/clips/voice.json';
import cEngine from '../public/clips/engine.json';
import cClose from '../public/clips/close.json';

export const FPS = 30;
export const VIEW_W = 1600;
export const VIEW_H = 900;
export type Box = { x: number; y: number; w: number; h: number };
type Ev = { t: number; type: string; label?: string | null; box?: Box | null };
type Recording = { name: string; duration: number; videoStart?: number; events: Ev[] };

const RECORDINGS: Record<string, Recording> = { hook: cHook, add: cAdd, study: cStudy, gauntlet: cGauntlet, voice: cVoice, engine: cEngine, close: cClose };

export const TOTAL_SECONDS = plan.total;
export const TOTAL_FRAMES = Math.ceil(TOTAL_SECONDS * FPS);
export const END_SECONDS = plan.end;

export interface Part {
  id: string;
  start: number;
  end: number;
  lines: { text: string; at: number }[];
}
export const PARTS: Part[] = plan.parts.map((p) => ({ id: p.id, start: p.start, end: p.end, lines: p.lines }));

/** The camera: from `at`, frame a region (zoom 1 = the whole screen). */
export interface Shot { at: number; z: number; cx: number; cy: number }
/** A ring round something, from one moment to another. */
export interface Ring { from: number; to: number; box: Box }
export interface Clip { name: string; start: number; until: number; duration: number; shots: Shot[]; rings: Ring[] }

const WIDE = { z: 1, cx: VIEW_W / 2, cy: VIEW_H / 2 };
/** Frames a box with room around it, never closer than MAX_ZOOM. */
const MAX_ZOOM = 1.55;
function frame(b: Box) {
  const w = Math.max(b.w + 260, 620);
  const h = Math.max(b.h + 200, 350);
  const z = Math.max(1, Math.min(MAX_ZOOM, (VIEW_W * 0.92) / w, (VIEW_H * 0.86) / h));
  return { z, cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
}
/** The part of the screen a shot shows. */
function view(s: { z: number; cx: number; cy: number }) {
  const w = VIEW_W / s.z, h = VIEW_H / s.z;
  const x = Math.min(VIEW_W - w, Math.max(0, s.cx - w / 2)), y = Math.min(VIEW_H - h, Math.max(0, s.cy - h / 2));
  return { x, y, w, h };
}
const inside = (b: Box, v: Box) => b.x >= v.x && b.y >= v.y && b.x + b.w <= v.x + v.w && b.y + b.h <= v.y + v.h;

export const CLIPS: Clip[] = plan.clips.map((c) => {
  const rec = RECORDINGS[c.clip];
  const start = rec.videoStart ?? c.start;
  const at = (e: Ev) => start + e.t;
  const highlights = rec.events.filter((e) => (e.type === 'point' || e.type === 'circle') && e.box);

  // The camera eases in on each highlight as its phrase begins, and back out when a click
  // lands outside the view or the screen has been still on one thing for a while.
  const shots: Shot[] = [{ at: start, ...WIDE }];
  const cur = () => shots[shots.length - 1];
  for (const e of rec.events) {
    const t = at(e);
    if ((e.type === 'point' || e.type === 'circle') && e.box) {
      shots.push({ at: t - (e.type === 'point' ? 0.1 : 0.55), ...frame(e.box) });
    } else if ((e.type === 'click' || e.type === 'scroll') && cur().z > 1 && (e.type === 'scroll' || (e.box && !inside(e.box, view(cur()))))) {
      shots.push({ at: t - 0.8, ...WIDE });
    }
  }
  // Back to the whole screen 3.5 s after a highlight if nothing else comes.
  const withRests: Shot[] = [];
  shots.forEach((s, i) => {
    withRests.push(s);
    const next = shots[i + 1];
    if (s.z > 1 && (!next || next.at - s.at > 5)) withRests.push({ at: s.at + 3.5, ...WIDE });
  });

  const rings: Ring[] = highlights.filter((e) => e.type === 'circle').map((e) => {
    const t = at(e);
    const next = highlights.find((x) => at(x) > t + 0.3);
    const to = Math.min(t + 3, next ? at(next) - 0.15 : t + 3);
    return { from: t, to: Math.max(to, t + 1.6), box: e.box! };
  });
  return { name: c.clip, start, until: c.until, duration: rec.duration, shots: withRests.sort((a, b) => a.at - b.at), rings };
});
