/**
 * The Recall demo video. The app's footage plays in a browser frame while a camera glides in on
 * what the narrator describes; labels name each Firebase AI Logic technique as it appears;
 * subtitles follow the narration; the music dips under the voice.
 */
import React from 'react';
import { AbsoluteFill, Audio, Easing, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { END_CARD, FPS, GAP, LEAD_IN, PLACED, TOTAL_SECONDS, type Box, type Placed, type Shot, type Tag } from './timeline';

const VIEW_W = 1600;
const VIEW_H = 900;
const BAR = 34;
const WIN_X = (1920 - VIEW_W) / 2;
const WIN_Y = 118;
const FONT = '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';
const MONO = '"Cascadia Code", Consolas, monospace';

const COLORS = {
  device: { fg: '#0f766e', bg: '#ccfbf1', ring: '#14b8a6', label: 'ON DEVICE' },
  cloud: { fg: '#6d28d9', bg: '#ede9fe', ring: '#8b5cf6', label: 'CLOUD' },
  hybrid: { fg: '#1d4ed8', bg: '#dbeafe', ring: '#3b82f6', label: 'HYBRID' },
  code: { fg: '#b45309', bg: '#fef3c7', ring: '#f59e0b', label: 'UNDER THE HOOD' },
};

const ease = Easing.bezier(0.45, 0, 0.2, 1);
const sec = (f: number) => f / FPS;

export const Demo: React.FC = () => {
  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: '#0b1020' }}>
      <Backdrop />
      <Title />
      {PLACED.filter((s) => s.clip).map((s, i, all) => {
        const from = Math.round((s.start - (i === 0 ? 1.4 : 0)) * FPS);
        const next = all[i + 1];
        const until = next ? next.start : s.start + s.seconds + GAP;
        return (
          <Sequence key={s.id} from={from} durationInFrames={Math.round(until * FPS) - from} name={s.id}>
            <Scene seg={s} lead={i === 0 ? 1.4 : 0} />
          </Sequence>
        );
      })}
      <Chapters />
      {PLACED.map((s) => (
        <Sequence key={`a-${s.id}`} from={Math.round(s.start * FPS)} durationInFrames={Math.ceil(s.seconds * FPS) + 2} name={`voice ${s.id}`}>
          <Audio src={staticFile(`narration/${s.id}.wav`)} volume={1} />
          <Subtitles seg={s} />
        </Sequence>
      ))}
      <Closing />
      <Music />
    </AbsoluteFill>
  );
};

// ----- Backdrop and title -----

const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  const t = sec(f);
  const blob = (x: number, y: number, r: number, c: string, phase: number) => (
    <div style={{ position: 'absolute', left: x + Math.sin(t / 7 + phase) * 60, top: y + Math.cos(t / 9 + phase) * 40, width: r, height: r, borderRadius: '50%', background: c, filter: 'blur(110px)', opacity: 0.55 }} />
  );
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(120% 90% at 50% 0%, #17204a 0%, #0b1020 60%, #070a14 100%)', overflow: 'hidden' }}>
      {blob(-120, 620, 620, '#1d4ed8', 0)}
      {blob(1400, -160, 640, '#7c3aed', 2)}
      {blob(1500, 760, 520, '#0d9488', 4)}
      <AbsoluteFill style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
    </AbsoluteFill>
  );
};

const Title: React.FC = () => {
  const f = useCurrentFrame();
  const out = interpolate(f, [2.4 * FPS, 3.1 * FPS], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (out <= 0) return null;
  const rise = spring({ frame: f, fps: FPS, config: { damping: 18 } });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out }}>
      <div style={{ transform: `translateY(${(1 - rise) * 30}px)`, opacity: rise, textAlign: 'center', color: 'white' }}>
        <div style={{ fontSize: 150, fontWeight: 800, letterSpacing: -4 }}>Recall</div>
        <div style={{ fontSize: 36, color: '#b8c4e6', marginTop: 6 }}>Know what you know · hybrid AI with Firebase AI Logic</div>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 34 }}>
          <Pill kind="device" text="Gemini Nano, on device" />
          <Pill kind="cloud" text="Gemini, in the cloud" />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Pill: React.FC<{ kind: keyof typeof COLORS; text: string }> = ({ kind, text }) => (
  <span style={{ padding: '10px 20px', borderRadius: 999, fontSize: 26, fontWeight: 600, color: COLORS[kind].fg, background: COLORS[kind].bg }}>{text}</span>
);

// ----- A scene: the browser frame, the camera on the footage, and the labels -----

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

const Scene: React.FC<{ seg: Placed; lead: number }> = ({ seg, lead }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const [a, b] = seg.range!;
  const span = seg.seconds + GAP;
  const rate = (b - a) / span;
  const local = Math.max(0, sec(f) - lead);
  const clipT = a + local * rate;
  const cam = cameraAt(seg.shots ?? [{ at: a }], clipT);
  const enter = seg.id === 'hook' ? spring({ frame: f - 0.4 * FPS, fps: FPS, config: { damping: 20 } }) : 1;
  const fadeIn = interpolate(f, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = seg.id === 'engine' ? interpolate(f, [durationInFrames - 12, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' }) : 1;

  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>
      <div
        style={{
          position: 'absolute', left: WIN_X, top: WIN_Y, width: VIEW_W, height: VIEW_H + BAR, borderRadius: 18, overflow: 'hidden',
          background: '#f5f6f8', boxShadow: '0 40px 120px -30px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.08)',
          transform: `translateY(${(1 - enter) * 80}px) scale(${0.96 + 0.04 * enter})`, opacity: enter,
        }}
      >
        <div style={{ height: BAR, background: '#e7e9ee', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', borderBottom: '1px solid #d7dbe3' }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />)}
          <span style={{ marginLeft: 18, flex: 1, maxWidth: 520, height: 22, borderRadius: 11, background: '#fff', color: '#5b6472', fontSize: 14, display: 'flex', alignItems: 'center', padding: '0 12px', fontFamily: FONT }}>
            🔒 recall-three-rust.vercel.app
          </span>
        </div>
        <div style={{ position: 'relative', width: VIEW_W, height: VIEW_H, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: VIEW_W, height: VIEW_H, transformOrigin: '0 0', transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.z})` }}>
            <OffthreadVideo src={staticFile(`clips/${seg.clip}.mp4`)} trimBefore={Math.round(a * FPS)} playbackRate={rate} muted style={{ width: VIEW_W, height: VIEW_H }} />
          </div>
        </div>
      </div>
      <Tags tags={seg.tags} seg={seg} lead={lead} />
    </AbsoluteFill>
  );
};

const Tags: React.FC<{ tags: Tag[]; seg: Placed; lead: number }> = ({ tags, seg, lead }) => {
  const f = useCurrentFrame();
  const span = seg.seconds + GAP;
  const p = (sec(f) - lead) / span;
  const shown = tags.filter((t) => p >= t.from && p < (t.to ?? 1.01));
  return (
    <div style={{ position: 'absolute', right: WIN_X + 26, top: WIN_Y + BAR + 22, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
      {shown.map((t) => {
        const start = Math.round((t.from * span + lead) * FPS);
        const s = spring({ frame: f - start, fps: FPS, config: { damping: 16, stiffness: 140 } });
        const c = COLORS[t.kind];
        return (
          <div key={t.title} style={{ transform: `translateX(${(1 - s) * 60}px)`, opacity: Math.min(1, s * 2.5), maxWidth: 560, background: '#ffffff', backdropFilter: 'blur(10px)', borderRadius: 16, padding: '14px 20px 16px', boxShadow: '0 18px 50px -18px rgba(15,23,42,.55)', borderLeft: `6px solid ${c.ring}` }}>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 1.6, color: c.fg }}>{c.label}</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: '#0f172a', fontFamily: /_|\(|·/.test(t.title) && t.kind !== 'hybrid' ? MONO : FONT, marginTop: 2, lineHeight: 1.2 }}>{t.title}</div>
            {t.detail && <div style={{ fontSize: 21, color: '#475569', marginTop: 4, lineHeight: 1.35 }}>{t.detail}</div>}
          </div>
        );
      })}
    </div>
  );
};

// ----- Chapters along the top -----

const Chapters: React.FC = () => {
  const f = useCurrentFrame();
  const t = sec(f);
  const end = TOTAL_SECONDS - END_CARD;
  if (t < 2.6 || t > end) return null;
  const now = [...PLACED].reverse().find((s) => s.start - 0.2 <= t) ?? PLACED[0];
  const appear = interpolate(t, [2.6, 3.2], [0, 1], { extrapolateRight: 'clamp' });
  const progress = Math.min(1, (t - LEAD_IN) / (end - LEAD_IN));
  return (
    <div style={{ position: 'absolute', left: WIN_X, top: 36, width: VIEW_W, opacity: appear * (now.id === 'close' ? 0 : 1), display: 'flex', alignItems: 'center', gap: 22, color: 'white' }}>
      <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }}>Recall</span>
      <span style={{ fontSize: 26, color: '#b8c4e6', fontWeight: 600 }}>{now.chapter === 'Recall' ? 'Hybrid AI study app' : now.chapter}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,.12)', overflow: 'hidden', marginLeft: 12 }}>
        <div style={{ width: `${progress * 100}%`, height: '100%', background: 'linear-gradient(90deg, #14b8a6, #3b82f6, #8b5cf6)' }} />
      </div>
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
  const onDiagram = seg.id === 'close';
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: onDiagram ? 46 : 66, display: 'flex', justifyContent: 'center' }}>
      <span style={{ maxWidth: 1320, textAlign: 'center', fontSize: 34, lineHeight: 1.35, fontWeight: 600, color: 'white', background: 'rgba(8,12,28,.78)', padding: '10px 22px', borderRadius: 12, boxShadow: '0 10px 30px -10px rgba(0,0,0,.6)' }}>{text}</span>
    </div>
  );
};

// ----- The close: the hybrid split as a diagram, then the end card -----

const Closing: React.FC = () => {
  const close = PLACED.find((s) => s.id === 'close')!;
  const from = Math.round((close.start - 0.2) * FPS);
  const cardAt = Math.round((close.start + close.seconds + 0.2) * FPS);
  return (
    <>
      <Sequence from={from} durationInFrames={cardAt - from + 12} name="diagram">
        <Diagram />
      </Sequence>
      <Sequence from={cardAt} name="end card">
        <EndCard />
      </Sequence>
    </>
  );
};

const Diagram: React.FC = () => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fade = Math.min(interpolate(f, [0, 10], [0, 1], { extrapolateRight: 'clamp' }), interpolate(f, [durationInFrames - 12, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' }));
  const col = (kind: 'device' | 'cloud', title: string, sub: string, items: string[], delay: number) => {
    const s = spring({ frame: f - delay, fps: FPS, config: { damping: 18 } });
    const c = COLORS[kind];
    return (
      <div style={{ width: 640, background: 'rgba(255,255,255,.97)', borderRadius: 24, padding: '30px 34px', transform: `translateY(${(1 - s) * 40}px)`, opacity: s, borderTop: `8px solid ${c.ring}` }}>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 2, color: c.fg }}>{c.label}</div>
        <div style={{ fontSize: 42, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{title}</div>
        <div style={{ fontSize: 23, color: '#64748b', marginBottom: 16 }}>{sub}</div>
        {items.map((it, i) => {
          const si = spring({ frame: f - delay - 8 - i * 5, fps: FPS, config: { damping: 20 } });
          return (
            <div key={it} style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 25, color: '#1e293b', padding: '7px 0', opacity: si, transform: `translateX(${(1 - si) * 20}px)` }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: c.ring, flex: 'none' }} />
              {it}
            </div>
          );
        })}
      </div>
    );
  };
  const mid = spring({ frame: f - 30, fps: FPS, config: { damping: 16 } });
  return (
    <AbsoluteFill style={{ opacity: fade, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: 30, alignItems: 'center', marginTop: -60 }}>
        {col('device', 'Gemini Nano', 'small · private · instant · offline', ['Marking every answer', 'Questions from notes and photos', 'The tutor, streamed', 'Writing the Trap Gauntlet', 'Hearing spoken answers'], 4)}
        <div style={{ width: 300, textAlign: 'center', color: 'white', opacity: mid, transform: `scale(${0.85 + 0.15 * mid})` }}>
          <div style={{ fontSize: 22, letterSpacing: 2, color: '#93c5fd', fontWeight: 800 }}>THE ROUTER</div>
          <div style={{ fontSize: 31, fontWeight: 700, lineHeight: 1.3, marginTop: 8 }}>Firebase AI Logic hybrid inference</div>
          <div style={{ fontSize: 22, color: '#b8c4e6', marginTop: 12, lineHeight: 1.4 }}>+ a self-audit that measures how far Nano can be trusted</div>
          <div style={{ fontSize: 56, marginTop: 6 }}>⇄</div>
        </div>
        {col('cloud', 'Gemini', 'large · multimodal · rare, heavy work', ['PDFs and long chapters', 'Fact-checking every card', 'Escalations and spot-checks', 'Refereeing the gauntlet', 'Natural text-to-speech'], 14)}
      </div>
    </AbsoluteFill>
  );
};

const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const s = spring({ frame: f, fps: FPS, config: { damping: 18 } });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', color: 'white', textAlign: 'center' }}>
      <div style={{ opacity: s, transform: `translateY(${(1 - s) * 24}px)` }}>
        <div style={{ fontSize: 132, fontWeight: 800, letterSpacing: -4 }}>Recall</div>
        <div style={{ fontSize: 36, color: '#b8c4e6', marginTop: 4 }}>The device does the small, private, instant work. The cloud does the rare, heavy work.</div>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 34, flexWrap: 'wrap' }}>
          {['prefer_on_device', 'only_on_device', 'only_in_cloud', 'structured output', 'chat streaming', 'Gemini TTS', 'Remote Config', 'App Check'].map((t) => (
            <span key={t} style={{ fontFamily: MONO, fontSize: 22, padding: '8px 16px', borderRadius: 10, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.16)', color: '#dbe4ff' }}>{t}</span>
          ))}
        </div>
        <div style={{ marginTop: 46, fontSize: 34, fontWeight: 700 }}>recall-three-rust.vercel.app</div>
        <div style={{ marginTop: 8, fontSize: 24, color: '#94a3b8' }}>Built for #BuildHybridAI 2026 · Firebase AI Logic · Gemini Nano + Gemini</div>
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
