// The recordings, one per part of the video, paced to its narration.
// Usage (film set running on :5199): node capture/scenes.cjs [scene ...]   (default: all)
const { open } = require('./cdp.cjs');

/** Drops a file on the Add screen's drop zone: a photo of a notes page, or a PDF. */
const dropFile = (kind) => `(async () => {
  let file;
  if (${JSON.stringify(kind)} === 'image') {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 1600;
    const g = c.getContext('2d');
    g.fillStyle = '#fbf8ef'; g.fillRect(0, 0, 1200, 1600);
    g.fillStyle = '#1d2433'; g.font = 'bold 54px Georgia'; g.fillText('Immunity and vaccines', 90, 150);
    g.font = '34px Georgia';
    ['Vaccines expose the immune system to a harmless', 'antigen, so memory cells form without illness.', '', 'Antibodies bind to antigens on the pathogen.', 'Memory B cells respond faster on re-infection.', '', 'Herd immunity: when most people are immune,', 'the germ cannot spread to those who are not.'].forEach((l, i) => g.fillText(l, 90, 260 + i * 62));
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    file = new File([blob], 'biology-notes-page.jpg', { type: 'image/jpeg' });
  } else {
    const body = '%PDF-1.4\\n' + 'x'.repeat(1_800_000) + '\\n%%EOF';
    file = new File([body], 'Immunology lecture 6.pdf', { type: 'application/pdf' });
  }
  const dt = new DataTransfer();
  dt.items.add(file);
  const zone = document.querySelector('.drop');
  for (const type of ['dragover', 'drop']) zone.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
})()`;

const NOTES = `How vaccines work

A vaccine trains the immune system to recognise a pathogen without causing the disease. It contains an antigen: a molecule, often a protein on the germ's surface, that the immune system recognises.

After vaccination, memory B cells remember the antigen. On real exposure they quickly make the right antibodies, so the infection is fought off before it can make you ill.

Protection from some vaccines fades over time, so booster doses remind the immune system.

Herd immunity: when enough people are immune, a germ cannot spread easily. For measles, about 95% of people need to be immune for herd immunity to protect everyone.

mRNA vaccines: cells read the mRNA and briefly make a harmless spike protein, which trains the immune system.`;

const scenes = {
  /** Today: the app at a glance, within the first seconds. */
  async hook() {
    const s = await open('hook');
    await s.go('#/');
    await s.record();
    await s.mark('today', '.page-head');
    await s.sleep(1500);
    await s.move({ x: 420, y: 330 }, 1200);
    await s.mark('due', '.hero-copy');
    await s.sleep(2500);
    await s.move(await s.box('a.btn.primary', 'Start session'), 1400);
    await s.mark('start', 'a.btn.primary', 'Start session');
    await s.sleep(3000);
    await s.move(await s.box('.game-card'), 1300);
    await s.mark('game', '.game-card');
    await s.sleep(2400);
    await s.move(await s.box('.sidebar-foot, .status, aside', 'On-device AI'), 1200);
    await s.mark('ondevice', 'aside', 'On-device AI');
    await s.sleep(2500);
    await s.finish();
  },

  /** Add material: notes, a photo, a PDF, and where each runs; then writing and the fact-check. */
  async add() {
    const s = await open('add');
    await s.go('#/add');
    await s.record();
    await s.sleep(600);
    await s.click('input', '', { label: 'title' });
    await s.type('How vaccines work', 26);
    await s.click('textarea.notes', '', { label: 'notes' });
    await s.paste(NOTES);
    await s.sleep(400);
    await s.mark('plan-notes', '.plan');
    await s.sleep(2600);
    await s.click('.seg button', 'Photo');
    await s.sleep(500);
    await s.ev(dropFile('image'));
    await s.sleep(300);
    await s.mark('plan-photo', '.plan');
    await s.sleep(2600);
    await s.click('.seg button', 'PDF');
    await s.sleep(500);
    await s.ev(dropFile('pdf'));
    await s.sleep(300);
    await s.mark('plan-pdf', '.plan');
    await s.sleep(3000);
    await s.click('.seg button', 'Notes');
    await s.sleep(700);
    await s.mark('plan-back', '.plan');
    await s.sleep(1800);
    await s.click('button.btn.primary', 'Make questions');
    await s.sleep(200);
    await s.mark('writing', '.working');
    await s.sleep(2500);
    await s.mark('checking', '.working');
    await s.sleep(3300);
    // The review: the tally, then the flagged card and its fix.
    await s.mark('review', '.review-summary');
    await s.sleep(3200);
    await s.mark('flagged', '.draft-flagged');
    await s.move(await s.box('.draft-flagged .flag'), 900);
    await s.sleep(5200);
    await s.click('.draft-flagged button', 'Use the correction');
    await s.sleep(600);
    await s.mark('resolved', '.draft-fixed');
    await s.sleep(2800);
    await s.finish();
  },

  /** Study: typing and speaking into one box, then confidence, Nano's mark; then an escalation and the tutor. */
  async study() {
    const s = await open('study');
    await s.go('#/study');
    await s.record();
    await s.mark('question', '.qcard');
    await s.sleep(1800);
    await s.click('textarea.answer-box', '', { label: 'answer' });
    await s.type('A molecule on the surface of a germ, ', 20);
    await s.ev(`window.__say = 'that the immune system recognises'`);
    await s.click('.mic-btn', '', { label: 'mic' });
    await s.mark('listening', '.answer-wrap');
    await s.sleep(3300);
    await s.click('.mic-btn', '', { label: 'stop' });
    await s.sleep(900);
    await s.click('.conf', 'Fairly sure', { label: 'confidence' });
    await s.sleep(900);
    await s.click('button.btn.primary', 'Check my answer');
    await s.mark('marking', '.answer-area');
    await s.sleep(1500);
    await s.mark('verdict', '.verdict');
    await s.move(await s.box('.verdict .badge'), 800);
    await s.sleep(3800);

    // The self-audit: a doubtful mark goes to the cloud before it is shown.
    await s.click('button.btn.primary', 'Next card');
    await s.sleep(1200);
    await s.ev(`window.__film.mark = 'escalate'`);
    await s.click('textarea.answer-box', '', { label: 'answer-2' });
    await s.type('They remember the germ for next time.', 24);
    await s.sleep(300);
    await s.click('.conf', 'Unsure', { label: 'confidence-2' });
    await s.click('button.btn.primary', 'Check my answer');
    await s.mark('marking-2', '.answer-area');
    await s.sleep(3000);
    await s.mark('escalated', '.audit-note');
    await s.move(await s.box('.audit-note'), 900);
    await s.sleep(5500);

    // The tutor: streaming on Nano, then handed to the cloud.
    await s.click('button.btn', 'Talk it through');
    await s.sleep(900);
    await s.mark('tutor', '.tutor');
    await s.click('.tutor-chips button');
    await s.sleep(3600);
    await s.click('button', 'Ask a bigger model');
    await s.sleep(700);
    await s.mark('deeper', '.tutor');
    await s.sleep(5200);
    await s.finish();
  },

  /** The Trap Gauntlet: Nano writes, you play, the referee withdraws one live. */
  async gauntlet() {
    const s = await open('gauntlet');
    await s.go('#/gauntlet');
    await s.ev(`window.__refDelay = 5200`);
    await s.record();
    await s.mark('intro', 'h1', 'Trap Gauntlet');
    await s.sleep(1500);
    await s.click('button.btn.primary', 'Start the gauntlet');
    await s.sleep(150);
    await s.mark('writing', 'h2', 'writing');
    await s.sleep(1500);
    await s.mark('play', '.trap-buttons');
    const answers = [true, false, true, false];
    for (const [i, a] of answers.entries()) {
      await s.sleep(i ? 1500 : 1900);
      await s.click(a ? '.trap-true' : '.trap-false', '', { label: `answer-${i}`, ms: 550 });
      await s.sleep(1000);
    }
    await s.mark('referee', '.ref-chip');
    await s.sleep(3200);
    await s.finish();
  },

  /** The question read aloud: loading, then speaking. */
  async voice() {
    const s = await open('voice');
    await s.go('#/study');
    await s.record();
    await s.sleep(800);
    await s.click('.read-aloud', '', { label: 'speaker' });
    await s.mark('loading', '.qcard-head');
    await s.sleep(1300);
    await s.mark('speaking', '.qcard-head');
    await s.sleep(5000);
    await s.finish();
  },

  /** The AI engine page: the router live, going offline, privacy, Remote Config, App Check, trust. */
  async engine() {
    const s = await open('engine');
    await s.go('#/engine');
    await s.record();
    // Scrolls so an element's top sits `gap` px below the top of the screen, and waits for it to settle.
    const scrollTo = async (selector, gap = 24) => {
      await s.ev(`window.scrollTo({ top: document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().top + scrollY - ${gap}, behavior: 'smooth' })`);
      await s.sleep(1600);
    };
    await s.mark('cards', '.engine-cards');
    await s.mark('appcheck', '.engine-card', 'App Check');
    await s.sleep(1800);
    await scrollTo('.routes', 70);
    await s.mark('routes', '.routes');
    await s.sleep(1800);
    await s.offline(true);
    await s.sleep(500);
    await s.mark('offline', '.routes');
    await s.sleep(5200);
    await s.offline(false);
    await s.sleep(300);
    await scrollTo('.trust');
    await s.mark('trust', '.trust');
    await s.mark('policy', '.policy-now');
    await s.sleep(3000);
    await scrollTo('.config', 300);
    await s.mark('config', '.config');
    await s.sleep(2400);
    await scrollTo('.engine-cards', 160);
    await s.mark('appcheck-2', '.engine-card', 'App Check');
    await s.sleep(3000);
    await s.finish();
  },

  /** Insights, for the close. */
  async close() {
    const s = await open('close');
    await s.go('#/insights');
    await s.record();
    await s.mark('insights', '.page-head');
    await s.sleep(3500);
    await s.mark('claimed', 'h3', 'Claimed vs actual');
    await s.scroll(380, 1600);
    await s.sleep(5000);
    await s.mark('wrong', 'h3', 'Certain, but wrong');
    await s.scroll(420, 1600);
    await s.sleep(9000);
    await s.finish();
  },
};

(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(scenes);
  for (const n of names) {
    try {
      await scenes[n]();
    } catch (e) {
      console.error(`${n} failed:`, e.message);
      process.exitCode = 1;
    }
  }
  process.exit();
})();
