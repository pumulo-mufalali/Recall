// Narration: each segment of script.json spoken by Gemini TTS through Firebase AI Logic (the same
// model and voice as the app), via the app's dev server and its debug App Check token.
// Needs the dev server: `npx vite --port 5188` in the repo root. Usage: node narration/tts.cjs [id ...]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const script = JSON.parse(fs.readFileSync(path.join(__dirname, 'script.json'), 'utf8'));
const outDir = path.join(__dirname, '..', 'public', 'narration');
fs.mkdirSync(outDir, { recursive: true });
const only = process.argv.slice(2);
const todo = script.segments.filter((s) => (only.length ? only.includes(s.id) : !fs.existsSync(path.join(outDir, `${s.id}.wav`))));
const port = 9372;
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(require('os').tmpdir(), 'recall-tts-edge')}`, 'about:blank']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let ws;
  for (let i = 0; i < 80 && !ws; i++) { try { ws = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {} await sleep(250); }
  const sock = new WebSocket(ws); await new Promise((r) => (sock.onopen = r));
  let id = 0; const pend = {};
  sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result); delete pend[d.id]; } };
  const cmd = (method, params = {}) => new Promise((r) => { pend[++id] = r; sock.send(JSON.stringify({ id, method, params })); });
  await cmd('Page.navigate', { url: 'http://localhost:5188/' }); await sleep(7000);

  for (const seg of todo) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = await cmd('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
        const { ai } = await import('/src/services/firebase.ts');
        const src = await (await fetch('/src/services/firebase.ts')).text();
        const at = src.indexOf('/node_modules/.vite/deps/firebase_ai.js');
        const { getGenerativeModel, ResponseModality } = await import(src.slice(at, src.indexOf(String.fromCharCode(34), at)));
        const model = getGenerativeModel(ai, { model: ${JSON.stringify(process.env.MODEL || script.model)}, generationConfig: { responseModalities: [ResponseModality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: ${JSON.stringify(script.voice)} } }, languageCode: 'en-US' } } });
        try {
          const res = await model.generateContent([{ type: 'text', text: ${JSON.stringify(seg.text)}, speechMetadata: { style: ${JSON.stringify(script.style)} } }]);
          const a = res.response.inlineDataParts().find((p) => p.inlineData.mimeType.startsWith('audio/')).inlineData;
          return { ok: true, mime: a.mimeType, data: a.data };
        } catch (e) { return { ok: false, error: String(e && e.message || e).replace(/^.*?:streamGenerateContent\\S*|^.*?:generateContent\\S*/, '').slice(0, 700) }; }
      })()` });
      const v = r.result?.value;
      if (v?.ok) {
        let bytes = Buffer.from(v.data, 'base64');
        if (!/wav/i.test(v.mime)) {
          // Raw PCM: wrap it in a WAV header.
          const rate = Number((v.mime.match(/rate=(\d+)/) || [])[1] || 24000);
          const h = Buffer.alloc(44);
          h.write('RIFF', 0); h.writeUInt32LE(36 + bytes.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
          h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
          h.write('data', 36); h.writeUInt32LE(bytes.length, 40);
          bytes = Buffer.concat([h, bytes]);
        }
        fs.writeFileSync(path.join(outDir, `${seg.id}.wav`), bytes);
        console.log(`${seg.id}: ${v.mime}, ${(bytes.length / 1024).toFixed(0)} KB`);
        break;
      }
      const wait = Number(((v?.error || '').match(/retry in ([\d.]+)s/) || [])[1] || 20);
      console.log(`${seg.id}: ${(v?.error || JSON.stringify(r)).slice(0, 700)} ... waiting ${Math.ceil(wait) + 2} s`);
      if (process.env.TRIES && attempt + 1 >= +process.env.TRIES) break;
      await sleep((Math.ceil(wait) + 2) * 1000);
    }
    await sleep(21_000); // 3 requests a minute on the free tier
  }
  edge.kill(); process.exit(0);
})();
