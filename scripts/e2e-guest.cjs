// End-to-end check of what a judge does, against the real Firebase project and real Gemini (the
// app's dev server on :5188, with its App Check debug token): try it without signing in, answer
// starter cards, read one aloud, talk a miss through with the tutor (then a bigger model), play
// the Trap Gauntlet, open Insights; then end the guest session. Logs each step and page errors,
// and saves screenshots. Usage: node scripts/e2e-guest.cjs [screenshot dir]
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP = 'http://localhost:5188/';
const STARTER = require('../src/data/starter-decks.json');
const shots = process.argv[2] || path.join(os.tmpdir(), 'recall-e2e');
fs.mkdirSync(shots, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-e2e-'));
  const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1400,900', '--autoplay-policy=no-user-gesture-required', 'about:blank']);
  let ws;
  for (let i = 0; i < 80 && !ws; i++) {
    try { const port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0]; ws = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (!ws) await sleep(250);
  }
  const sock = new WebSocket(ws); await new Promise((r) => (sock.onopen = r));
  let id = 0; const pend = {};
  sock.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend[d.id]) { pend[d.id](d.result ?? d); delete pend[d.id]; }
    if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning')) {
      const text = d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300);
      if (!/DevTools|download the React|App Check debug token|Lit is in dev mode/i.test(text)) { problems.push(`console ${d.params.type}: ${text}`); log(`  [console ${d.params.type}]`, text); }
    }
    if (d.method === 'Runtime.exceptionThrown') { const t = d.params.exceptionDetails.exception?.description?.slice(0, 300); problems.push(`page error: ${t}`); log('  [page error]', t); }
  };
  const cmd = (method, params = {}) => new Promise((r) => { pend[++id] = r; sock.send(JSON.stringify({ id, method, params })); });
  const ev = async (expression) => (await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
  const waitFor = async (js, ms = 30000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(js)) return true; await sleep(300); } return false; };
  const click = (sel, text = '') => ev(`(() => { const t = ${JSON.stringify(text)}; const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getClientRects().length && e.textContent.includes(t) && !e.disabled); if (b) b.click(); return !!b; })()`);
  const textOf = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.innerText.replace(/\\s+/g, ' ').trim() : null; })()`);
  const shot = async (n) => fs.writeFileSync(path.join(shots, `${n}.png`), Buffer.from((await cmd('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  const type = async (sel, text) => { await ev(`document.querySelector(${JSON.stringify(sel)}).focus()`); await cmd('Input.insertText', { text }); };
  const step = async (name, fn) => { log(`== ${name}`); const t0 = Date.now(); try { await fn(); } catch (e) { problems.push(`${name}: ${e.message}`); log(`  FAILED: ${e.message}`); } log(`   (${((Date.now() - t0) / 1000).toFixed(1)} s)`); };
  const must = (ok, what) => { if (!ok) throw new Error(what); };
  const answerFor = (prompt) => { for (const d of STARTER) for (const c of d.cards) if (prompt.includes(c.prompt.slice(0, 40))) return c; return null; };

  await cmd('Runtime.enable');
  await cmd('Page.enable');
  await cmd('Page.navigate', { url: APP });

  await step('Try it without signing in', async () => {
    must(await waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Try it without signing in'))`), 'no guest button');
    await click('button', 'Try it without signing in');
    must(await waitFor(`!!document.querySelector('.example-note')`, 40000), 'Today did not show the starter decks');
    log('  today:', (await textOf('.hero-card')) ?? '(no hero card)');
    await shot('01-today');
  });

  const marks = [];
  await step('Study 10 cards', async () => {
    await ev(`location.hash = '#/study'`);
    must(await waitFor(`!!document.querySelector('textarea.answer-box')`, 30000), 'study screen did not open');
    // A judge's mix: right and sure, right and unsure, wrong and certain (a confident miss), vague.
    const plan = ['right:4', 'wrong:4', 'right:3', 'vague:2', 'right:4', 'wrong:4', 'right:2', 'right:4', 'vague:3', 'wrong:1'];
    const levels = { 1: 'No idea', 2: 'Unsure', 3: 'Fairly sure', 4: 'Certain' };
    for (const [i, p] of plan.entries()) {
      const [kind, conf] = p.split(':');
      const prompt = await textOf('.qcard h2, .qcard .q, .qcard');
      const card = answerFor(prompt ?? '');
      const answer = kind === 'right' ? (card?.answer ?? 'I am not sure.') : kind === 'wrong' ? 'I think it is because of the weather and the season.' : 'Something to do with that, I think.';
      await type('textarea.answer-box', answer);
      must(await click('.conf', levels[conf]), `no confidence button ${levels[conf]}`);
      must(await click('button.btn.primary', 'Check my answer'), 'no Check button');
      const t0 = Date.now();
      const ok = await waitFor(`!!document.querySelector('.verdict')`, 90000);
      must(ok, `card ${i + 1}: no mark after 90 s`);
      const verdict = await textOf('.verdict');
      const badge = await textOf('.verdict .badge');
      const note = await textOf('.audit-note');
      marks.push({ i: i + 1, kind, conf: levels[conf], secs: ((Date.now() - t0) / 1000).toFixed(1), verdict: (verdict ?? '').slice(0, 90), badge, note });
      log(`  card ${i + 1} [${kind}, ${levels[conf]}] ${((Date.now() - t0) / 1000).toFixed(1)} s · ${badge} · ${(verdict ?? '').slice(0, 80)}${note ? ' · NOTE: ' + note.slice(0, 60) : ''}`);
      if (i === 1) await shot('02-a-miss');
      if (i === 1) {
        // The tutor, on this confident miss.
        await step('Talk it through (tutor)', async () => {
          must(await click('button.btn', 'Talk it through'), 'no Talk it through button');
          must(await waitFor(`!!document.querySelector('.tutor-chips button')`, 10000), 'tutor did not open');
          await click('.tutor-chips button');
          const t1 = Date.now();
          must(await waitFor(`(() => { const m = [...document.querySelectorAll('.tutor-msg.theirs')].filter((e) => !e.classList.contains('writing')); return m.length >= 1 && m[m.length - 1].innerText.length > 40; })()`, 90000), 'no tutor reply in 90 s');
          await sleep(2500);
          log(`  tutor reply (${((Date.now() - t1) / 1000).toFixed(1)} s): ${(await ev(`[...document.querySelectorAll('.tutor-msg.theirs')].pop().innerText.replace(/\\s+/g, ' ').slice(0, 140)`))}`);
          const before = await ev(`document.querySelectorAll('.tutor-msg.theirs').length`);
          must(await click('button', 'Ask a bigger model'), 'no Ask a bigger model button');
          const t2 = Date.now();
          must(await waitFor(`(() => { const m = [...document.querySelectorAll('.tutor-msg.theirs')]; const last = m[m.length - 1]; return m.length > ${before} && !last.classList.contains('writing') && last.innerText.length > 40; })()`, 120000), 'no bigger-model reply in 120 s');
          await sleep(2500);
          const err = await textOf('.tutor .error-note, .tutor .error');
          if (err) throw new Error('tutor error: ' + err);
          log(`  bigger model (${((Date.now() - t2) / 1000).toFixed(1)} s): ${(await ev(`[...document.querySelectorAll('.tutor-msg.theirs')].pop().innerText.replace(/\\s+/g, ' ').slice(0, 140)`))}`);
          await shot('03-tutor');
        });
      }
      if (i === 0) {
        await step('Read the next question aloud', async () => {
          // The speaker on the card: loading, then speaking (or the device's own voice).
          must(await click('button.btn.primary', 'Next card'), 'no Next card');
          must(await waitFor(`!!document.querySelector('textarea.answer-box') && !document.querySelector('.verdict')`, 10000), 'next card did not open');
          must(await click('.read-aloud'), 'no speaker');
          const states = new Set();
          const end = Date.now() + 20000;
          while (Date.now() < end) { states.add(await ev(`document.querySelector('.read-aloud')?.className.replace('icon-btn read-aloud', '').trim() || 'idle'`)); await sleep(200); }
          log('  speaker states seen:', [...states].join(' → '));
        });
        continue; // already on the next card
      }
      if (!(await click('button.btn.primary', 'Next card'))) { log('  no next card: the session is over'); break; }
      await waitFor(`!!document.querySelector('textarea.answer-box') || !!document.querySelector('.done, .session-done, .summary')`, 15000);
      if (!(await ev(`!!document.querySelector('textarea.answer-box')`))) { log('  session ended after', i + 1, 'cards'); break; }
    }
    await shot('04-after-study');
  });

  await step('Trap Gauntlet', async () => {
    await ev(`location.hash = '#/gauntlet'`);
    await sleep(2500);
    log('  intro:', ((await textOf('main')) ?? '').slice(0, 200));
    if (!(await click('button.btn.primary', 'Start the gauntlet'))) { await shot('05-gauntlet-intro'); throw new Error('no Start button (see 05-gauntlet-intro)'); }
    const t0 = Date.now();
    must(await waitFor(`!!document.querySelector('.trap-true')`, 120000), 'statements not written in 120 s');
    log(`  written in ${((Date.now() - t0) / 1000).toFixed(1)} s; badge: ${await textOf('.badge')}`);
    let n = 0;
    while (n < 12 && (await ev(`!!document.querySelector('.trap-true')`))) {
      n++;
      await click(n % 2 ? '.trap-true' : '.trap-false');
      await sleep(1800);
    }
    const t1 = Date.now();
    await waitFor(`!/checking/i.test(document.querySelector('.ref-chip')?.innerText ?? '')`, 60000);
    log(`  answered ${n}; referee after ${((Date.now() - t1) / 1000).toFixed(1)} s more: ${await textOf('.ref-chip')}`);
    log('  end:', ((await textOf('main')) ?? '').slice(0, 260));
    await shot('05-gauntlet');
  });

  await step('Insights', async () => {
    await ev(`location.hash = '#/insights'`);
    await sleep(3000);
    log('  ', ((await textOf('.verdict-card')) ?? (await textOf('main')) ?? '').slice(0, 300));
    await shot('06-insights');
  });

  await step('Today afterwards', async () => {
    await ev(`location.hash = '#/'`);
    await sleep(2500);
    log('  ', ((await textOf('.tiles')) ?? '').slice(0, 200), '|', ((await textOf('.level-card, .game-card')) ?? '').slice(0, 120));
    await shot('07-today-after');
  });

  await step('End the guest session', async () => {
    await ev(`location.hash = '#/settings'`);
    await sleep(2000);
    await click('.account button', 'Sign out');
    await sleep(600);
    await click('dialog button', 'Delete and sign out');
    must(await waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Continue with Google'))`, 30000), 'did not return to sign-in');
  });

  log(`\n${problems.length ? problems.length + ' problem(s):\n- ' + problems.join('\n- ') : 'no problems'}`);
  log(`screenshots: ${shots}`);
  try { execFileSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
