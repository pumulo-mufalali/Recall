/**
 * The Recall demo video: the app's real interface, full frame, with a camera that glides in on
 * what the narrator describes. Nothing is drawn over the app except text: subtitles at the
 * bottom, and plain labels above them naming each technique as it appears. The music dips under
 * the voice.
 */
import React from 'react';
import { AbsoluteFill, Audio, Easing, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { END_CARD, FPS, GAP, PLACED, TOTAL_SECONDS, type Box, type Placed, type Shot, type Tag } from './timeline';

/** The recordings' CSS size; they fill the 1920 × 1080 frame exactly (2400 × 1350 device pixels). */
const VIEW_W = 1600;
const VIEW_H = 900;
const FIT = 1920 / VIEW_W;
const FONT = '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';
const MONO = '"Cascadia Code", Consolas, monospace';
/** Crossfade between scenes, in seconds. */
const BLEND = 0.3;

/** The label's small heading, coloured to match where the work runs. */
const KINDS = {
  device: { color: '#5eead4', label: 'On device' },
  cloud: { color: '#c4b5fd', label: 'Cloud' },
  hybrid: { color: '#93c5fd', label: 'Hybrid' },
  code: { color: '#fcd34d', label: 'Under the hood' },
};

const ease = Easing.bezier(0.45, 0, 0.2, 1);
const sec = (f: number) => f / FPS;
const fade = (t: number, from: number, to: number, d = 0.25) =>
  Math.min(interpolate(t, [from, from + d], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), interpolate(t, [to - d, to], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));

export const Demo: React.FC = () => {
  const scenes = PLACED.filter((s) => s.clip);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: '#f5f6f8' }}>
      {scenes.map((s, i) => {
        // The first scene opens the video; each later one fades in over the end of the one before.
        const lead = i === 0 ? s.start : BLEND;
        const from = Math.round((s.start - lead) * FPS);
        const next = scenes[i + 1];
        const until = next ? next.start : TOTAL_SECONDS;
        return (
          <Sequence key={s.id} from={from} durationInFrames={Math.round(until * FPS) - from} name={s.id}>
            <Scene seg={s} lead={lead} last={!next} />
          </Sequence>
        );
      })}
      {PLACED.map((s) => (
        <Sequence key={`a-${s.id}`} from={Math.round(s.start * FPS)} durationInFrames={Math.ceil(s.seconds * FPS) + 2} name={`voice ${s.id}`}>
          <Audio src={staticFile(`narration/${s.id}.wav`)} volume={1} />
          <Subtitles seg={s} />
        </Sequence>
      ))}
      <Sequence from={Math.round((TOTAL_SECONDS - END_CARD + 0.2) * FPS)} name="end">
        <EndText />
      </Sequence>
      <Music />
    </AbsoluteFill>
  );
};

// ----- A scene: the footage, the camera on it, and the labels -----

function cameraAt(shots: Shot[], t: number) {
  const target = (s: Shot) => {
    if (!s.box) return { z: 1, cx: VIEW_W / 2, cy: VIEW_H / 2 };
    const [x, y, w, h] = s.box as Box;
    const z = Math.max(1, Math.min(2.3, s.zoom ?? Math.min((VIEW_W * 0.94) / w, (VIEW_H * 0.86) / h)));
    return { z, cx: x + w / 2, cy: y + h / 2 };
  };
  let i = 0;
  while (i + 1 < shots.length && shots[i + 1].at <= t) i++;
  const cur = target(shots[i]);
  const prev = i > 0 ? target(shots[i - 1]) : cur;
  const k = i > 0 ? ease(Math.min(1, Math.max(0, (t - shots[i].at) / 1.1))) : 1;
  const z = prev.z + (cur.z - prev.z) * k;
  const cx = prev.cx + (cur.cx - prev.cx) * k;
  const cy = prev.cy + (cur.cy - prev.cy) * k;
  const tx = Math.min(0, Math.max(VIEW_W - VIEW_W * z, VIEW_W / 2 - cx * z));
  const ty = Math.min(0, Math.max(VIEW_H - VIEW_H * z, VIEW_H / 2 - cy * z));
  return { z, tx, ty };
}

const Scene: React.FC<{ seg: Placed; lead: number; last: boolean }> = ({ seg, lead, last }) => {
  const f = useCurrentFrame();
  const [a, b] = seg.range!;
  // The last scene stretches over the end too, so the app stays on screen to the final frame.
  const span = seg.seconds + (last ? END_CARD : GAP);
  const rate = (b - a) / span;
  const clipT = a + Math.max(0, sec(f) - lead) * rate;
  const cam = cameraAt(seg.shots ?? [{ at: a }], clipT);
  const fadeIn = lead === BLEND ? interpolate(f, [0, BLEND * FPS], [0, 1], { extrapolateRight: 'clamp' }) : 1;
  return (
    <AbsoluteFill style={{ opacity: fadeIn, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: VIEW_W, height: VIEW_H, transformOrigin: '0 0', transform: `scale(${FIT}) translate(${cam.tx}px, ${cam.ty}px) scale(${cam.z})` }}>
        <OffthreadVideo src={staticFile(`clips/${seg.clip}.mp4`)} trimBefore={Math.max(0, Math.round((a - lead * rate) * FPS))} playbackRate={rate} muted style={{ width: VIEW_W, height: VIEW_H }} />
      </div>
      <Labels tags={seg.tags} seg={seg} lead={lead} />
    </AbsoluteFill>
  );
};

/** Plain text on a dark band, top left, apart from the subtitles: clearly the video speaking, not the app. */
const Labels: React.FC<{ tags: Tag[]; seg: Placed; lead: number }> = ({ tags, seg, lead }) => {
  const f = useCurrentFrame();
  const span = seg.seconds + GAP;
  const t = sec(f) - lead;
  const shown = tags.filter((x) => t >= x.from * span && t < (x.to ?? 1.02) * span);
  return (
    <div style={{ position: 'absolute', left: 56, top: 48, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
      {shown.map((x) => {
        const k = KINDS[x.kind];
        const code = /_|\(|·/.test(x.title) && x.kind !== 'hybrid';
        return (
          <div key={x.title} style={{ opacity: fade(t, x.from * span, (x.to ?? 1.02) * span), background: 'rgba(15,20,32,.86)', padding: '12px 20px 14px', borderRadius: 4, maxWidth: 820 }}>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: k.color }}>{k.label}</div>
            <div style={{ fontSize: 34, fontWeight: 700, color: '#fff', fontFamily: code ? MONO : FONT, lineHeight: 1.2, marginTop: 2 }}>{x.title}</div>
            {x.detail && <div style={{ fontSize: 23, color: '#cbd5e1', marginTop: 4, lineHeight: 1.35 }}>{x.detail}</div>}
          </div>
        );
      })}
    </div>
  );
};

// ----- Subtitles -----

function captionChunks(text: string): string[] {
  const sentences = text.match(/[^.?!:]+[.?!:]+/g) ?? [text];
  const out: string[] = [];
  for (const raw of sentences) {
    const s = raw.trim();
    if (s.length <= 84) { out.push(s); continue; }
    // Long sentences break at a comma near the middle.
    const commas = [...s.matchAll(/, /g)].map((m) => m.index!);
    const mid = commas.sort((x, y) => Math.abs(x - s.length / 2) - Math.abs(y - s.length / 2))[0];
    if (mid) out.push(s.slice(0, mid + 1), s.slice(mid + 2));
    else out.push(s);
  }
  return out;
}

const Subtitles: React.FC<{ seg: Placed }> = ({ seg }) => {
  const f = useCurrentFrame();
  const chunks = captionChunks(seg.text);
  // Each chunk gets a share of the segment by its length; ends[i] is where chunk i stops (0..1).
  const weights = chunks.map((c) => c.length + 8);
  const total = weights.reduce((n, w) => n + w, 0);
  const ends = weights.map((_, i) => weights.slice(0, i + 1).reduce((n, w) => n + w, 0) / total);
  const t = sec(f) / seg.seconds;
  const i = ends.findIndex((end) => t < end);
  const text = chunks[i < 0 ? chunks.length - 1 : i];
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 48, display: 'flex', justifyContent: 'center' }}>
      <span style={{ maxWidth: 1400, textAlign: 'center', fontSize: 36, lineHeight: 1.35, fontWeight: 600, color: 'white', background: 'rgba(0,0,0,.74)', padding: '8px 20px', borderRadius: 6 }}>{text}</span>
    </div>
  );
};

// ----- The end: the app stays on screen, with where to find it -----

const EndText: React.FC = () => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 48, opacity: o }}>
      <div style={{ background: 'rgba(15,20,32,.9)', color: 'white', padding: '18px 32px 20px', borderRadius: 4, textAlign: 'center' }}>
        <div style={{ fontSize: 44, fontWeight: 700 }}>recall-three-rust.vercel.app</div>
        <div style={{ fontSize: 24, color: '#cbd5e1', marginTop: 4 }}>Recall · built for #BuildHybridAI 2026 with Firebase AI Logic · Gemini Nano + Gemini</div>
      </div>
    </AbsoluteFill>
  );
};

// ----- Music: up between lines, well under the voice -----

const UNDER_VOICE = 0.1;
const BETWEEN = 0.32;

const Music: React.FC = () => {
  const volume = (frame: number) => {
    const t = sec(frame);
    // Distance into or out of the nearest narration, for smooth dips.
    let v = BETWEEN;
    for (const s of PLACED) {
      const into = interpolate(t, [s.start - 0.45, s.start - 0.05], [BETWEEN, UNDER_VOICE], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const out = interpolate(t, [s.start + s.seconds, s.start + s.seconds + 0.6], [UNDER_VOICE, BETWEEN], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      if (t >= s.start - 0.45 && t <= s.start + s.seconds + 0.6) v = Math.min(v, Math.max(into, t < s.start + s.seconds ? UNDER_VOICE : out));
    }
    const fadeIn = interpolate(t, [0, 0.8], [0, 1], { extrapolateRight: 'clamp' });
    const fadeOut = interpolate(t, [TOTAL_SECONDS - 3, TOTAL_SECONDS], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return v * fadeIn * fadeOut;
  };
  return <Audio src={staticFile('music.wav')} volume={volume} />;
};

