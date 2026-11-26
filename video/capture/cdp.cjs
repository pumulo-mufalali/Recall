// Recording the film set (harness/) in headless Edge: a visible cursor that glides and clicks,
// typing at a human pace, and a screencast turned into a constant-frame-rate clip. Every action
// is logged with its time and the on-screen box of its target, for the zooms in the edit.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const W = 1600, H = 900, SCALE = 1.5; // CSS viewport; frames are 2400 × 1350
const BASE = 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Page-side helpers, installed before the app loads. */
const INJECT = `(() => {
  // A cursor and click ripples, drawn above everything (headless has no pointer of its own).
  const css = document.createElement('style');
  css.textContent = \`
    #film-cursor { position: fixed; left: 0; top: 0; width: 26px; height: 26px; z-index: 2147483647; pointer-events: none;
      transform: translate(-200px, -200px); transition: none; filter: drop-shadow(0 2px 4px rgba(0,0,0,.35)); }
    .film-ripple { position: fixed; z-index: 2147483646; pointer-events: none; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
      background: rgba(59,107,224,.28); border: 2px solid rgba(59,107,224,.65); animation: film-ripple .55s ease-out forwards; }
    @keyframes film-ripple { from { transform: scale(.3); opacity: 1; } to { transform: scale(1.5); opacity: 0; } }
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
    addEventListener('mousemove', (e) => (c.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)'), true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.className = 'film-ripple';
      r.style.left = e.clientX + 'px';
      r.style.top = e.clientY + 'px';
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 600);
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
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => {
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

async function open(name) {
  const port = 9380 + Math.floor(Math.random() * 100);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-film-'));
  const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-color-profile=srgb', `--force-device-scale-factor=${SCALE}`, '--font-render-hinting=none', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, 'about:blank']);
  let ws;
  for (let i = 0; i < 80 && !ws; i++) { try { ws = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {} await sleep(250); }
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

  const api = {
    cmd, ev, sleep, events, log, box,
    async go(hash) {
      await cmd('Page.navigate', { url: `${BASE}/${hash}` });
      await sleep(2200);
      await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mouse.x, y: mouse.y });
    },
    async record() {
      handlers['Page.screencastFrame'] = (p) => {
        const file = path.join(dir, `${String(frames.length).padStart(6, '0')}.jpg`);
        fs.writeFileSync(file, Buffer.from(p.data, 'base64'));
        frames.push({ file, t: p.metadata.timestamp });
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
      const steps = Math.max(8, Math.round(ms / 16));
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        mouse = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
        await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mouse.x, y: mouse.y });
        await sleep(ms / steps);
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
      for (const ch of text) {
        await cmd('Input.insertText', { text: ch });
        await sleep(1000 / cps * (ch === ' ' ? 1.4 : 0.7 + Math.random() * 0.6));
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
      fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify({ name, width: W, height: H, scale: SCALE, duration, events: shifted }, null, 2));
      fs.rmSync(dir, { recursive: true, force: true });
      edge.kill();
      console.log(`${name}: ${duration.toFixed(1)} s, ${frames.length} frames, ${events.length} events -> ${mp4}`);
    },
  };
  return api;
}

module.exports = { open, W, H };
