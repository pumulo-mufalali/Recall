// Checks the example-data flow on the film set (a brand-new account): the welcome offers it,
// one click fills every screen, Today notes it, and Settings removes it again.
// Usage (film set running on :5199): node capture/example-test.cjs
const { open } = require('./cdp.cjs');
const fs = require('fs');
const path = require('path');

(async () => {
  const s = await open('example');
  const shots = path.join(__dirname, '..', 'out', 'example');
  fs.mkdirSync(shots, { recursive: true });
  const shot = async (name) => {
    const r = await s.cmd('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(r.data, 'base64'));
  };
  const text = () => s.ev(`(document.querySelector('main') ?? document.body).innerText.replace(/\\s+/g, ' ').slice(0, 260)`);

  await s.go('?empty#/');
  await s.box('.onboard-alt');
  console.log('welcome:', await text());
  await shot('1-welcome');
  await s.click('.onboard-alt');
  await s.sleep(1200);
  console.log('today:', await text());
  await shot('2-today');
  for (const page of ['insights', 'engine', 'library', 'plan']) {
    await s.ev(`location.hash = '#/${page}'`);
    await s.sleep(1500);
    console.log(`${page}:`, await text());
    await shot(`3-${page}`);
  }
  await s.ev(`location.hash = '#/settings'`);
  await s.sleep(1500);
  await s.click('.btn', 'Remove');
  await s.sleep(500);
  await s.click('dialog .btn', 'Remove example data');
  await s.sleep(1600);
  console.log('settings after remove:', await s.ev(`[...document.querySelectorAll('.btn')].map((b) => b.textContent.trim()).filter((t) => /Load|Remove/.test(t)).join(', ')`));
  await s.ev(`location.hash = '#/'`);
  await s.sleep(1200);
  console.log('today after remove:', await text());
  await shot('4-after-remove');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
