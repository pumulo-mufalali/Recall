// Recording the film set (harness/) in headless Edge: a cursor that appears only when it moves,
// typing at a human pace, and a screencast turned into a constant-frame-rate clip. Scenes act on
// cue: src/plan.json says when each phrase is spoken, and s.cue() waits for it, so the recording
// plays at normal speed under the voice. Every action is logged with its time and the on-screen
// box of its target, for the camera and the circles in the edit.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const W = 1600, H = 900, SCALE = 1.5; // CSS viewport; frames are 2400 × 1350
const BASE = 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Page-side helpers, installed before the app loads. */
const INJECT = `(() => {
  // An ordinary arrow cursor, drawn above everything (headless has no pointer of its own).
  const css = document.createElement('style');
  css.textContent = \`
    #film-cursor { position: fixed; left: 0; top: 0; width: 26px; height: 26px; z-index: 2147483647; pointer-events: none;
      transform: translate(-200px, -200px); filter: drop-shadow(0 2px 4px rgba(0,0,0,.35)); opacity: 0; transition: opacity .35s; }
    #film-cursor.on { opacity: 1; }
    ::-webkit-scrollbar { display: none; }
    html { scrollbar-width: none; scroll-behavior: smooth; }
  \`;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26"><path d="M3 2 L3 21 L8.2 16.4 L11.6 24 L15 22.6 L11.7 15.2 L18.6 15.2 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const place = () => {
    document.head.appendChild(css);
    const c = document.createElement('div');
    c.id = 'film-cursor';
    c.innerHTML = svg;
    document.body.appendChild(c);
    // Shown while it moves or clicks, faded once it has rested: no cursor idling on screen.
    let idle;
    addEventListener('mousemove', (e) => {
      c.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)';
      if (window.__cursorHidden) return;
      c.classList.add('on');
      clearTimeout(idle);
      idle = setTimeout(() => c.classList.remove('on'), 2600);
    }, true);
  };
  if (document.body) place(); else addEventListener('DOMContentLoaded', place);

  // Chrome's on-device speech recognition, scripted: window.__say = 'what the learner says'.
  class FakeRecognition extends EventTarget {
    start() {
      const words = (window.__say || '').split(' ');
      let heard = '';
      words.forEach((w, i) => setTimeout(() => {
        heard += (heard ? ' ' : '') + w;
        const e = new Event('result');
        e.resultIndex = 0;
        e.results = [{ isFinal: i === words.length - 1, 0: { transcript: heard } }];
        this.dispatchEvent(e);
      }, 500 + i * 260));
    }
    stop() { setTimeout(() => this.dispatchEvent(new Event('end')), 80); }
    abort() { this.dispatchEvent(new Event('end')); }
  }
  FakeRecognition.available = async () => 'available';
  window.SpeechRecognition = FakeRecognition;
  // Light theme, whatever the system says (the app keeps its choice in localStorage).
  try { localStorage.setItem('recall.theme', 'light'); } catch {}
  // A microphone that is always allowed: a quiet tone, so the level meter moves.
  if (window.MediaDevices) MediaDevices.prototype.getUserMedia = async function () {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.15;
    const d = ctx.createMediaStreamDestination();
    o.connect(g).connect(d);
    o.start();
    return d.stream;
  };
  window.__film = {};
})();`;

const PLAN = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'plan.json'), 'utf8'));

async function open(name) {
  const clip = PLAN.clips.find((c) => c.clip === name);
  const parts = clip ? PLAN.parts.filter((p) => clip.parts.includes(p.id)) : [];
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-film-'));
  const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-color-profile=srgb', `--force-device-scale-factor=${SCALE}`, '--font-render-hinting=none', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${W},${H}`, 'about:blank']);
  // Port 0: Edge picks a free port and writes it into its own profile, so this can only ever
  // talk to the browser it started (never one left over from an earlier run).
  let ws;
  for (let i = 0; i < 80 && !ws; i++) {
    try {
      const port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0].trim();
      ws = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch {}
    if (!ws) await sleep(250);
  }
  if (!ws) throw new Error(`[${name}] Edge did not start`);
  const sock = new WebSocket(ws);
  await new Promise((r) => (sock.onopen = r));
  let id = 0;
  const pend = {};
  const handlers = {};
  sock.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend[d.id]) { pend[d.id](d.result ?? d); delete pend[d.id]; }
    if (d.method && handlers[d.method]) handlers[d.method](d.params);
    if (d.method === 'Runtime.exceptionThrown') console.warn(`[${name}] page error:`, d.params.exceptionDetails.exception?.description?.slice(0, 200));
  };
  const cmd = (method, params = {}) => new Promise((r) => { pend[++id] = r; sock.send(JSON.stringify({ id, method, params })); });
  await cmd('Runtime.enable');
  await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: false, screenWidth: W, screenHeight: H });
  await cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await cmd('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });
  await cmd('Browser.grantPermissions', { origin: BASE, permissions: ['audioCapture'] });

  const frames = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `recall-frames-${name}-`));
  let t0 = null;
  const events = [];
  let mouse = { x: W / 2, y: H / 2 };

  const ev = async (expression) => {
    const r = await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`[${name}] ${expression.slice(0, 80)}: ${r.exceptionDetails.exception?.description}`);
    return r.result?.value;
  };
  const now = () => (t0 === null ? 0 : (Date.now() - t0) / 1000);
  const log = (type, extra = {}) => events.push({ t: +now().toFixed(3), type, ...extra });

  /** The box of the first element matching a selector, optionally containing some text. */
  const box = async (selector, text, scroll = true) => {
    for (let i = 0; i < 60; i++) {
      const r = await ev(`(() => {
        const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => ${JSON.stringify(text ?? '')} === '' || e.textContent.includes(${JSON.stringify(text ?? '')}));
        const el = els.find((e) => e.getClientRects().length);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        // Clear of the edges (and of sticky bars): otherwise glide it towards the middle first.
        const safe = !${scroll} || (b.top >= 70 && b.bottom <= innerHeight - 120);
        if (!safe) el.scrollIntoView({ block: b.height > innerHeight - 200 ? 'start' : 'center', behavior: 'smooth' });
        return { x: b.x, y: b.y, w: b.width, h: b.height, safe };
      })()`);
      if (r && !r.safe) {
        await sleep(750);
        const again = await ev(`(() => {
          const el = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => ${JSON.stringify(text ?? '')} === '' || e.textContent.includes(${JSON.stringify(text ?? '')})).find((e) => e.getClientRects().length);
          const b = el.getBoundingClientRect();
          return { x: b.x, y: b.y, w: b.width, h: b.height };
        })()`);
        return again;
      }
      if (r) return { x: r.x, y: r.y, w: r.w, h: r.h };
      await sleep(100);
    }
    throw new Error(`[${name}] not found: ${selector} ${text ?? ''}`);
  };

  /** The smallest visible element matching a selector (and containing some text): the thing itself, not its container. */
  const find = async (selector, text) => {
    for (let i = 0; i < 60; i++) {
      const r = await ev(`(() => {
        const t = ${JSON.stringify(text ?? '')};
        const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => e.getClientRects().length && (t === '' || e.textContent.includes(t)));
        if (!els.length) return null;
        const b = els.map((e) => e.getBoundingClientRect()).sort((x, y) => x.width * x.height - y.width * y.height)[0];
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      })()`);
      if (r) {
        // Only once it has stopped moving (a scroll settling, a reply growing).
        await sleep(120);
        const again = await ev(`(() => {
          const t = ${JSON.stringify(text ?? '')};
          const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => e.getClientRects().length && (t === '' || e.textContent.includes(t)));
          const b = els.map((e) => e.getBoundingClientRect()).sort((x, y) => x.width * x.height - y.width * y.height)[0];
          return b && { x: b.x, y: b.y, w: b.width, h: b.height };
        })()`);
        if (again && Math.abs(again.x - r.x) + Math.abs(again.y - r.y) + Math.abs(again.w - r.w) + Math.abs(again.h - r.h) < 1) return again;
        continue;
      }
      await sleep(100);
    }
    throw new Error(`[${name}] not found: ${selector} ${text ?? ''}`);
  };

  /** Seconds into the video for this recording's clock (record() starts at the clip's start). */
  const videoNow = () => clip.start + now();
  const late = [];
  /** Waits until a moment in the video; notes it if the screen is already behind. */
  const at = async (t, what) => {
    const wait = t - videoNow();
    if (wait > 0) await sleep(wait * 1000);
    else if (wait < -0.25) late.push(`${what}: ${(-wait).toFixed(1)} s late`);
  };
  const highlight = (phrase) => {
    for (const p of parts) { const h = p.highlights.find((x) => x.phrase === phrase); if (h) return h; }
    throw new Error(`[${name}] no highlight "${phrase}" in parts ${clip.parts.join(', ')}: check SCRIPT.md`);
  };
  const part = (id) => parts.find((p) => p.id === id) ?? (() => { throw new Error(`[${name}] no part ${id}`); })();
  const done = new Set();

  const api = {
    cmd, ev, sleep, events, log, box, find, at, videoNow,
    /** When a highlight's phrase is spoken, in video seconds. */
    when: (phrase) => highlight(phrase).at,
    /** Keeps recording until this clip's place in the video is over. */
    async untilEnd() { await at(clip.until + 0.8, 'end'); },
    /** Waits for the moment a phrase is spoken (minus lead seconds, to arrive on it). */
    async cue(phrase, lead = 0) { await at(highlight(phrase).at - lead, `"${phrase}"`); },
    /** Waits for the moment any phrase of this recording's narration is spoken (minus lead seconds). */
    async on(phrase, lead = 0) {
      for (const p of parts) {
        const c = p.text.toLowerCase().indexOf(phrase.toLowerCase());
        if (c < 0) continue;
        const w = p.words.filter(([i]) => i <= c).pop();
        return at(w[1] - lead, `"${phrase}"`);
      }
      throw new Error(`[${name}] "${phrase}" is not in the narration of ${clip.parts.join(', ')}`);
    },
    /** Waits for a part's words to start or end (plus delta seconds). */
    async start(id, delta = 0) { await at(part(id).start + delta, `${id} start`); },
    async end(id, delta = 0) { await at(part(id).end + delta, `${id} end`); },
    /** On a phrase: the cursor glides to the thing and rests on it. */
    async point(phrase, selector, text) {
      await api.cue(phrase, 0.75);
      const b = await find(selector, text);
      await api.move({ x: b.x + Math.min(b.w / 2, 60), y: b.y + b.h / 2 }, 700);
      log('point', { label: phrase, box: b });
      done.add(phrase);
      return b;
    },
    /** On a phrase: a ring goes round the thing (drawn in the edit, from this box). With settle, the box is measured that many seconds later, for something still growing. */
    async circle(phrase, selector, text, settle = 0) {
      await api.cue(phrase, 0.1);
      // The ring starts when the thing is there: on the phrase, or as soon after as it appears.
      for (let i = 0; i < 80; i++) {
        const there = await ev(`[...document.querySelectorAll(${JSON.stringify(selector)})].some((e) => e.getClientRects().length && e.textContent.includes(${JSON.stringify(text ?? '')}))`);
        if (there) break;
        await sleep(80);
      }
      const t = now();
      if (settle) await sleep(settle * 1000);
      const b = await find(selector, text);
      events.push({ t: +t.toFixed(3), type: 'circle', label: phrase, box: b });
      done.add(phrase);
      return b;
    },
    async go(hash) {
      await cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
      await cmd('Page.navigate', { url: `${BASE}/${hash}` });
      await sleep(2200);
      await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mouse.x, y: mouse.y });
    },
    async record() {
      handlers['Page.screencastFrame'] = (p) => {
        // Kept in memory and written at the end: writing here would stall every command while the screen changes.
        const file = path.join(dir, `${String(frames.length).padStart(6, '0')}.jpg`);
        frames.push({ file, data: p.data, t: p.metadata.timestamp });
        cmd('Page.screencastFrameAck', { sessionId: p.sessionId });
      };
      await cmd('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * SCALE, maxHeight: H * SCALE, everyNthFrame: 1 });
      t0 = Date.now();
      // A frame to start on, even if nothing moves.
      await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mouse.x, y: mouse.y + 1 });
      await sleep(300);
    },
    /** Glides the cursor to a point (or the centre of an element) with ease-in-out. */
    async move(target, ms = 650) {
      const to = target.x !== undefined && target.w === undefined ? target : { x: target.x + target.w / 2, y: target.y + target.h / 2 };
      const from = { ...mouse };
      // Paced by the clock, so a move takes the time asked however slow each step is.
      const began = Date.now();
      for (;;) {
        const k = Math.min(1, (Date.now() - began) / ms);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        mouse = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
        await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mouse.x, y: mouse.y });
        if (k >= 1) break;
        await sleep(12);
      }
    },
    async click(selector, text, opts = {}) {
      const b = await box(selector, text);
      await api.move(b, opts.ms ?? 650);
      await sleep(opts.pause ?? 180);
      log('click', { label: opts.label ?? text ?? selector, box: b });
      if (process.env.DEBUG_CLICK) console.log('click', text ?? selector, Math.round(mouse.x), Math.round(mouse.y), '->', await ev(`(() => { const e = document.elementFromPoint(${mouse.x}, ${mouse.y}); return e ? e.tagName + '.' + e.className + ' ' + (e.textContent || '').slice(0, 30) + ' scrollY=' + scrollY : 'none'; })()`));
      await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: mouse.x, y: mouse.y, button: 'left', clickCount: 1 });
      await sleep(70);
      await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mouse.x, y: mouse.y, button: 'left', clickCount: 1 });
      return b;
    },
    /** Types into the focused element, a character at a time. */
    async type(text, cps = 22, label) {
      log('type', { label: label ?? text.slice(0, 40) });
      // Paced by the clock: each character is due at its moment, however slow each step is.
      const began = Date.now();
      let due = 0;
      for (const ch of text) {
        await cmd('Input.insertText', { text: ch });
        due += 1000 / cps * (ch === ' ' ? 1.4 : 0.7 + Math.random() * 0.6);
        const wait = began + due - Date.now();
        if (wait > 0) await sleep(wait);
      }
    },
    /** Pastes text at once (into the focused element). */
    async paste(text) {
      log('paste', { label: text.slice(0, 40) });
      await cmd('Input.insertText', { text });
    },
    async key(key, code = key, keyCode) {
      await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode });
      await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
    },
    /** Marks a moment for the edit, with the box of what to look at. */
    async mark(label, selector, text) {
      const b = selector ? await box(selector, text, false) : null;
      log('mark', { label, box: b });
      return b;
    },
    async scroll(dy, ms = 900) {
      log('scroll', { dy });
      await ev(`window.scrollBy({ top: ${dy}, behavior: 'smooth' })`);
      await sleep(ms);
    },
    async offline(on) {
      log(on ? 'offline' : 'online');
      await cmd('Network.enable');
      await cmd('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    },
    /** Stops recording and writes out/clips/<name>.mp4 and <name>.json. */
    async finish() {
      await sleep(400);
      const stoppedAt = Date.now() / 1000;
      await cmd('Page.stopScreencast');
      await sleep(300);
      const out = path.join(__dirname, '..', 'public', 'clips');
      fs.mkdirSync(out, { recursive: true });
      // Each frame lasts until the next one: constant 30 fps out of a variable-rate screencast.
      const start = frames[0].t;
      // Frames can arrive out of order: put them in time order, one per moment.
      frames.sort((a, b) => a.t - b.t);
      for (let i = frames.length - 1; i > 0; i--) if (frames[i].t - frames[i - 1].t < 0.001) frames.splice(i - 1, 1);
      for (const f of frames) fs.writeFileSync(f.file, Buffer.from(f.data, 'base64'));
      const list = frames.map((f, i) => {
        const next = frames[i + 1] ? frames[i + 1].t : Math.max(f.t + 0.1, stoppedAt);
        return `file '${f.file.replace(/\\/g, '/')}'\nduration ${(next - f.t).toFixed(4)}`;
      });
      list.push(`file '${frames[frames.length - 1].file.replace(/\\/g, '/')}'`);
      const listFile = path.join(dir, 'list.txt');
      fs.writeFileSync(listFile, list.join('\n'));
      const mp4 = path.join(out, `${name}.mp4`);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-movflags', '+faststart', mp4]);
      const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString());
      // Event times are wall-clock from record(); the clip starts at the first frame.
      const offset = (start * 1000 - t0) / 1000;
      const shifted = events.map((e) => ({ ...e, t: +(e.t - offset).toFixed(3) }));
      // Where the clip sits in the video: its first frame is at videoStart.
      const videoStart = clip ? +(clip.start + offset).toFixed(3) : 0;
      fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify({ name, width: W, height: H, scale: SCALE, duration, videoStart, events: shifted }, null, 2));
      const missed = parts.flatMap((p) => p.highlights.map((h) => h.phrase)).filter((p) => !done.has(p));
      if (missed.length) console.warn(`[${name}] highlights in SCRIPT.md not shown: ${missed.map((m) => `"${m}"`).join(', ')}`);
      if (late.length) console.warn(`[${name}] behind the voice: ${late.join('; ')}`);
      fs.rmSync(dir, { recursive: true, force: true });
      edge.kill();
      console.log(`${name}: ${duration.toFixed(1)} s, ${frames.length} frames, ${events.length} events -> ${mp4}`);
    },
  };
  return api;
}

module.exports = { open, W, H };
