// Renders music tracks (tracks.js) in headless Edge, then masters them with ffmpeg.
// Usage: node music/render.cjs <seconds> [track ...]   (default: every track, 32 s)
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const seconds = Number(process.argv[2] || 32);
const outDir = path.join(__dirname, '..', 'out', 'music');
fs.mkdirSync(outDir, { recursive: true });
const profile = path.join(require('os').tmpdir(), 'recall-music-edge');
const port = 9371;
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless', '--disable-gpu', '--allow-file-access-from-files', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let ws;
  for (let i = 0; i < 80 && !ws; i++) { try { ws = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {} await sleep(250); }
  const sock = new WebSocket(ws); await new Promise((r) => (sock.onopen = r));
  let id = 0; const pend = {};
  sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result); delete pend[d.id]; } if (d.method === 'Runtime.exceptionThrown') console.error('page error:', d.params.exceptionDetails.exception?.description); };
  const cmd = (method, params = {}) => new Promise((r) => { pend[++id] = r; sock.send(JSON.stringify({ id, method, params })); });
  await cmd('Runtime.enable');
  await cmd('Page.navigate', { url: 'file:///' + path.join(__dirname, 'page.html').replace(/\\/g, '/') }); await sleep(3000);
  console.log('page:', JSON.stringify((await cmd('Runtime.evaluate', { expression: 'typeof Tone + " " + typeof renderTrack + " " + location.href', returnByValue: true })).result));
  const names = process.argv.slice(3).length ? process.argv.slice(3) : (await cmd('Runtime.evaluate', { expression: 'TRACK_NAMES', returnByValue: true })).result.value;
  for (const name of names) {
    const t0 = Date.now();
    // Long renders are megabytes of base64: keep it in the page and fetch it in slices.
    const r = await cmd('Runtime.evaluate', { expression: `renderTrack(${JSON.stringify(name)}, ${seconds}).then((b) => (window.__wav = b).length)`, awaitPromise: true, returnByValue: true });
    const size = r.result?.value;
    if (!size) { console.error(name, 'failed', JSON.stringify(r).slice(0, 500)); continue; }
    let b64 = '';
    for (let at = 0; at < size; at += 4_000_000) {
      b64 += (await cmd('Runtime.evaluate', { expression: `window.__wav.slice(${at}, ${at + 4_000_000})`, returnByValue: true })).result.value;
    }
    const raw = path.join(outDir, `${name}-raw.wav`);
    fs.writeFileSync(raw, Buffer.from(b64, 'base64'));
    // Master: gentle EQ tidy, loudness to -16 LUFS (streaming level), true peak under -1.5 dB.
    const mp3 = path.join(outDir, `${name}.mp3`);
    const wav = path.join(outDir, `${name}.wav`);
    const filters = 'highpass=f=28,loudnorm=I=-16:TP=-1.5:LRA=9';
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', filters, '-ar', '44100', wav]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-b:a', '192k', mp3]);
    fs.unlinkSync(raw);
    console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s to render -> ${mp3}`);
  }
  edge.kill(); process.exit(0);
})();
