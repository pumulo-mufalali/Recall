/**
 * The Recall demo video: the app's real interface, full frame, recorded to the voice's cues. The
 * camera eases in on what the narrator names; a ring goes round the things that matter most.
 * Nothing else is drawn over the app but subtitles; the techniques used are named once, at the
 * end, above the web address. The music sits under the voice.
 */
import React from 'react';
import { AbsoluteFill, Audio, Easing, Freeze, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { CLIPS, END_SECONDS, FPS, PARTS, TOTAL_SECONDS, VIEW_H, VIEW_W, type Clip, type Shot } from './timeline';

const FIT = 1920 / VIEW_W;
const FONT = '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';
const MONO = '"Cascadia Code", Consolas, monospace';
/** Named at the end: what the video showed, in the terms the hackathon asks about. */
const TECHNIQUES = [
  'Firebase AI Logic hybrid inference',
  'prefer_on_device · only_on_device · only_in_cloud',
  'Structured output on both engines',
  'Streamed chat, handed between engines',
  'Self-audit: doubtful marks escalated',
  'Gemini text-to-speech',
];
/** Crossfade between recordings, in seconds. */
const BLEND = 0.35;
const RING = '#f97316';

const ease = Easing.bezier(0.45, 0, 0.2, 1);
const sec = (f: number) => f / FPS;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const fade = (t: number, from: number, to: number, d = 0.25) => Math.min(interpolate(t, [from, from + d], [0, 1], clamp), interpolate(t, [to - d, to], [1, 0], clamp));

export const Demo: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: FONT, background: '#f5f6f8' }}>
    {CLIPS.map((c, i) => {
      const next = CLIPS[i + 1];
      const from = i === 0 ? 0 : Math.round(c.start * FPS);
      const until = next ? next.start + BLEND : TOTAL_SECONDS;
      return (
        <Sequence key={c.name} from={from} durationInFrames={Math.round(until * FPS) - from} name={c.name}>
          <Scene clip={c} from={from} first={i === 0} />
        </Sequence>
      );
    })}
    {PARTS.map((p) => (
      <Sequence key={`a-${p.id}`} from={Math.round(p.start * FPS)} durationInFrames={Math.ceil((p.end - p.start) * FPS) + 3} name={`voice ${p.id}`}>
        <Audio src={staticFile(`narration/${p.id}.wav`)} />
      </Sequence>
    ))}
    <Subtitles />
    <EndText />
    <Music />
  </AbsoluteFill>
);

// ----- A recording, its camera and its rings -----

function cameraAt(shots: Shot[], t: number) {
  let i = 0;
  while (i + 1 < shots.length && shots[i + 1].at <= t) i++;
  const cur = shots[i];
  const prev = i > 0 ? shots[i - 1] : cur;
  const k = i > 0 ? ease(Math.min(1, Math.max(0, (t - cur.at) / 1.0))) : 1;
  const z = prev.z + (cur.z - prev.z) * k;
  const cx = prev.cx + (cur.cx - prev.cx) * k;
  const cy = prev.cy + (cur.cy - prev.cy) * k;
  return { z, tx: Math.min(0, Math.max(VIEW_W - VIEW_W * z, VIEW_W / 2 - cx * z)), ty: Math.min(0, Math.max(VIEW_H - VIEW_H * z, VIEW_H / 2 - cy * z)) };
}

const Scene: React.FC<{ clip: Clip; from: number; first: boolean }> = ({ clip, from, first }) => {
  const f = useCurrentFrame();
  const t = sec(from + f);
  const cam = cameraAt(clip.shots, t);
  const opacity = first ? 1 : interpolate(f, [0, BLEND * FPS], [0, 1], clamp);
  // The recording's own frame for this moment, held still before its first and after its last.
  const lead = Math.round(clip.start * FPS) - from;
  const last = Math.floor(clip.duration * FPS) - 2;
  const video = <OffthreadVideo src={staticFile(`clips/${clip.name}.mp4`)} muted style={{ width: VIEW_W, height: VIEW_H }} />;
  const local = f - lead;
  return (
    <AbsoluteFill style={{ opacity, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: VIEW_W, height: VIEW_H, transformOrigin: '0 0', transform: `scale(${FIT}) translate(${cam.tx}px, ${cam.ty}px) scale(${cam.z})` }}>
        {local < 0 ? <Freeze frame={0}>{video}</Freeze> : local > last ? <Freeze frame={last}>{video}</Freeze> : <Sequence from={lead} layout="none">{video}</Sequence>}
        {clip.rings.map((r, i) => <RingMark key={i} t={t} ring={r} zoom={cam.z} />)}
      </div>
    </AbsoluteFill>
  );
};

/** A ring drawn round something: it closes in as it appears, then fades. */
const RingMark: React.FC<{ t: number; ring: Clip['rings'][number]; zoom: number }> = ({ t, ring, zoom }) => {
  if (t < ring.from || t > ring.to) return null;
  const grow = interpolate(t, [ring.from, ring.from + 0.35], [1, 0], { ...clamp, easing: ease });
  const o = fade(t, ring.from, ring.to, 0.3);
  const pad = 9 + grow * 14;
  const { x, y, w, h } = ring.box;
  return (
    <div style={{ position: 'absolute', left: x - pad, top: y - pad, width: w + pad * 2, height: h + pad * 2, borderRadius: 14, border: `${4 / zoom}px solid ${RING}`, boxShadow: `0 0 0 ${3 / zoom}px rgba(249,115,22,.18)`, opacity: o, pointerEvents: 'none' }} />
  );
};

// ----- Subtitles and the end -----

const Subtitles: React.FC = () => {
  const t = sec(useCurrentFrame());
  const p = PARTS.find((x) => t >= x.start - 0.05 && t < x.end + 0.3);
  if (!p) return null;
  const line = [...p.lines].reverse().find((l) => t >= l.at - 0.08) ?? p.lines[0];
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 48, display: 'flex', justifyContent: 'center' }}>
      <span style={{ maxWidth: 1400, textAlign: 'center', fontSize: 36, lineHeight: 1.35, fontWeight: 600, color: 'white', background: 'rgba(0,0,0,.74)', padding: '8px 20px', borderRadius: 6 }}>{line.text}</span>
    </div>
  );
};

const EndText: React.FC = () => {
  const t = sec(useCurrentFrame());
  const from = TOTAL_SECONDS - END_SECONDS + 0.4;
  if (t < from) return null;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 48, opacity: interpolate(t, [from, from + 0.4], [0, 1], clamp) }}>
      <div style={{ background: 'rgba(15,20,32,.92)', color: 'white', padding: '26px 40px 24px', borderRadius: 4, textAlign: 'center', maxWidth: 1500 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px 12px', marginBottom: 22 }}>
          {TECHNIQUES.map((x) => (
            <span key={x} style={{ fontSize: 24, padding: '6px 14px', borderRadius: 4, background: 'rgba(255,255,255,.1)', color: '#e2e8f0', fontFamily: /[a-z]_[a-z]/.test(x) ? MONO : FONT }}>{x}</span>
          ))}
        </div>
        <div style={{ fontSize: 44, fontWeight: 700 }}>recall-three-rust.vercel.app</div>
        <div style={{ fontSize: 24, color: '#cbd5e1', marginTop: 4 }}>Recall · built for #BuildHybridAI 2026 with Firebase AI Logic · Gemini Nano + Gemini</div>
      </div>
    </AbsoluteFill>
  );
};

// ----- Music: up between lines, well under the voice -----

const UNDER_VOICE = 0.1;
const BETWEEN = 0.3;

const Music: React.FC = () => {
  const volume = (frame: number) => {
    const t = sec(frame);
    let v = BETWEEN;
    for (const p of PARTS) {
      if (t < p.start - 0.45 || t > p.end + 0.6) continue;
      const into = interpolate(t, [p.start - 0.45, p.start - 0.05], [BETWEEN, UNDER_VOICE], clamp);
      const out = interpolate(t, [p.end, p.end + 0.6], [UNDER_VOICE, BETWEEN], clamp);
      v = Math.min(v, t < p.end ? Math.max(into, UNDER_VOICE) : out);
    }
    return v * interpolate(t, [0, 0.8], [0, 1], clamp) * interpolate(t, [TOTAL_SECONDS - 3, TOTAL_SECONDS], [1, 0], clamp);
  };
  return <Audio src={staticFile('music.wav')} volume={volume} />;
};
