// Makes the starter decks a new visitor can study: real public documents, turned into cards by
// Recall's own pipeline (Gemini through Firebase AI Logic writes the cards, a second, larger
// model fact-checks them), exactly as the Add screen does. Writes src/data/starter-decks.json.
//
// Needs the app's dev server (`npx vite --port 5188`, with its App Check debug token) and Edge.
// Usage: node scripts/starter-decks.cjs
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/** Public-domain documents from US government sources: three subjects, a few pages each. */
const SOURCES = [
  { title: 'Cells and DNA', publisher: 'MedlinePlus Genetics, U.S. National Library of Medicine', url: 'https://medlineplus.gov/download/genetics/understanding/basics.pdf' },
  { title: 'The Moon', publisher: 'NASA Night Sky Network, Jet Propulsion Laboratory', url: 'https://nightsky.jpl.nasa.gov/media/documents/attachments/Fun_Facts_About_the_Moon.pdf' },
  { title: 'The American Revolution', publisher: 'National Park Service, Independence National Historical Park', url: 'https://www.nps.gov/inde/learn/education/classrooms/upload/American-Revolution-Overview-v2.pdf' },
];
const APP = 'http://localhost:5188/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-starter-'));
  const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank']);
  let ws;
  for (let i = 0; i < 80 && !ws; i++) {
    try { const port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0]; ws = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (!ws) await sleep(250);
  }
  const sock = new WebSocket(ws); await new Promise((r) => (sock.onopen = r));
  let id = 0; const pend = {};
  sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result ?? d); delete pend[d.id]; } };
  const cmd = (method, params = {}) => new Promise((r) => { pend[++id] = r; sock.send(JSON.stringify({ id, method, params })); });
  await cmd('Page.navigate', { url: APP });
  await sleep(6000);

  const decks = [];
  for (const src of SOURCES) {
    const res = await fetch(src.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`${src.url}: ${res.status}`);
    const b64 = Buffer.from(await res.arrayBuffer()).toString('base64');
    console.log(`${src.title}: ${(b64.length * 0.75 / 1000).toFixed(0)} KB, making cards...`);
    const r = await cmd('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
      const { loadSettings } = await import('/src/services/firebase.ts');
      const { cardsFromFile } = await import('/src/services/engine.ts');
      const { reviewOf } = await import('/src/services/review.ts');
      const settings = await loadSettings();
      const bytes = Uint8Array.from(atob(${JSON.stringify(b64)}), (c) => c.charCodeAt(0));
      const file = new File([bytes], ${JSON.stringify(src.title + '.pdf')}, { type: 'application/pdf' });
      try {
        const made = await cardsFromFile(file, settings);
        const review = await reviewOf(${JSON.stringify(src.title)}, { kind: 'file', file }, made.value, made.engine, made.route, settings);
        return { ok: true, madeBy: review.madeBy, checkedBy: review.checkedBy, drafts: review.drafts.map((d) => ({ prompt: d.prompt, answer: d.answer, keyPoints: d.keyPoints, check: d.check })) };
      } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    })()` });
    const v = r.result?.value;
    if (!v?.ok) throw new Error(`${src.title}: ${v?.error ?? JSON.stringify(r).slice(0, 400)}`);
    // As a learner would on the review screen: keep verified cards, take a flagged card's
    // correction, and leave out a flagged card with no correction.
    const cards = [];
    let corrected = 0, dropped = 0;
    for (const d of v.drafts) {
      if (d.check.status !== 'flagged') cards.push({ prompt: d.prompt, answer: d.answer, keyPoints: d.keyPoints });
      else if (d.check.correction) { cards.push({ prompt: d.prompt, answer: d.check.correction.answer, keyPoints: d.check.correction.keyPoints }); corrected++; }
      else dropped++;
    }
    const verified = v.drafts.filter((d) => d.check.status === 'verified').length;
    console.log(`  ${v.drafts.length} cards by ${v.madeBy}, checked by ${v.checkedBy}: ${verified} verified, ${corrected} corrected, ${dropped} left out`);
    decks.push({ ...src, madeBy: v.madeBy, checkedBy: v.checkedBy, madeAt: new Date().toISOString().slice(0, 10), cards });
  }

  const out = path.join(__dirname, '..', 'src', 'data', 'starter-decks.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(decks, null, 2) + '\n');
  console.log(`wrote ${out}`);
  try { execFileSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
