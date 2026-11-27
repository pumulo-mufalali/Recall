// The recordings, one per part of the video, acted out on the narration's cues (src/plan.json).
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

/** Scrolls so an element's top sits `gap` px below the top of the screen, smoothly. */
const scrollTo = (s, selector, text = '', gap = 40) => s.ev(`(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.includes(${JSON.stringify(text)}));
  window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - ${gap}, behavior: 'smooth' });
})()`);

// Each scene follows its narration (SCRIPT.md): s.on() waits for a phrase, s.point() and
// s.circle() act on the highlights' phrases. A scene that falls behind the voice says so.
const scenes = {
  /** Today: answers saved on the device, the cards ready, each coming back on time. */
  async hook() {
    const s = await open('hook');
    await s.go('#/');
    await s.record();
    await s.circle('saved only on your device', '.tile', 'Marked privately');
    await s.circle('turns your notes into questions', '.hero-card');
    await s.point('brings each card back', '.hero-copy *', 'to review');
    await s.untilEnd();
    await s.finish();
  },

  /** Add: notes, a photo, a PDF; then the questions are written and fact-checked. */
  async add() {
    const s = await open('add');
    await s.go('#/add');
    // The notes are in before the recording starts: the story begins with the material.
    await s.click('input', '', { label: 'title', ms: 50, pause: 20 });
    await s.paste('How vaccines work');
    await s.click('textarea.notes', '', { label: 'notes', ms: 50, pause: 20 });
    await s.paste(NOTES);
    await s.ev('document.activeElement.blur(); scrollTo(0, 0)');
    s.events.splice(0);
    await s.record();
    await s.point('notes, a photo of a page, or a PDF', '.seg');
    await s.on('photos into questions', 0.6);
    await s.click('.seg button', 'Photo', { ms: 450 });
    await s.sleep(350);
    await s.ev(dropFile('image'));
    await s.on('PDFs go to', 0.6);
    await s.click('.seg button', 'PDF', { ms: 450 });
    await s.sleep(350);
    await s.ev(dropFile('pdf'));
    await s.on('Firebase AI Logic picks', 0.4);
    await s.click('.seg button', 'Notes', { ms: 450 });
    await s.point('picks the right one for each job', 'button.btn.primary', 'Make questions');
    await s.sleep(300);
    await s.click('button.btn.primary', 'Make questions', { ms: 120, pause: 60 });
    await s.mark('writing', '.working');
    await s.circle('a bigger AI in the cloud', '.stepper li', 'Fact-checking');
    // The review: the flagged card, brought into view, then its fix.
    await s.on('This one says', 1.6);
    await s.box('.draft-flagged');
    await s.circle('says fifty-nine percent', '.draft-flagged *', '59%');
    await s.point('with the fix ready', '.draft-flagged button', 'Use the correction');
    await s.end('factcheck', 0.3);
    await s.click('.draft-flagged button', 'Use the correction', { ms: 120, pause: 60 });
    await s.mark('resolved', '.draft-fixed');
    await s.untilEnd();
    await s.finish();
  },

  /** Study: answer typed then spoken, how sure, Nano's mark; then a double-checked mark; then the tutor. */
  async study() {
    const s = await open('study');
    await s.go('#/study');
    await s.box('textarea.answer-box');
    await s.record();
    await s.on('Answer from memory', 0.9);
    await s.click('textarea.answer-box', '', { label: 'answer', ms: 500 });
    await s.type('A molecule on the surface of a germ, ', 26);
    await s.circle('saved only on your device', '.privacy-note');
    await s.ev(`window.__say = 'that the immune system recognises'`);
    await s.point('Type, or just speak', '.mic-btn');
    await s.on('just speak');
    await s.click('.mic-btn', '', { label: 'mic', ms: 120, pause: 60 });
    await s.circle('your voice is written down right there', '.voice-note');
    await s.on('Then say how sure', 0.7);
    await s.click('.mic-btn', '', { label: 'stop', ms: 120, pause: 60 });
    await s.circle('say how sure you are', '.confidence');
    await s.click('.conf', 'Fairly sure', { label: 'confidence', ms: 350 });
    await s.click('button.btn.primary', 'Check my answer', { ms: 350 });
    await s.circle('marks it on the spot', '.verdict', '', 0.3);

    // The self-audit: a doubtful mark goes to the cloud before it is shown.
    await s.end('study', 0.6);
    await s.click('button.btn.primary', 'Next card', { ms: 500 });
    await s.sleep(700);
    await s.ev(`(window.__film ??= {}).mark = 'escalate'`);
    await s.click('textarea.answer-box', '', { label: 'answer-2', ms: 500 });
    await s.type('They remember the germ for next time.', 30);
    await s.click('.conf', 'Unsure', { label: 'confidence-2', ms: 450 });
    await s.click('button.btn.primary', 'Check my answer', { ms: 450 });
    await s.box('.answer-area');
    await s.circle('goes to the bigger cloud AI', '.audit-note.escalated');

    // The tutor: on the device, then handed to the cloud. The page settles first, with room
    // below the button for the conversation.
    await s.end('audit', 0.3);
    await scrollTo(s, 'button.btn', 'Talk it through', 230);
    await s.point('Talk it through', 'button.btn', 'Talk it through');
    await s.click('button.btn', 'Talk it through', { ms: 60, pause: 40 });
    await s.click('.tutor-chips button', '', { ms: 350, pause: 80 });
    await s.circle('a tutor on your device', '.tutor-msg.theirs', '', 1.6);
    await s.point('Ask a bigger model', 'button', 'Ask a bigger model');
    await s.sleep(250);
    await s.click('button', 'Ask a bigger model', { ms: 100, pause: 50 });
    await s.circle('moves to the cloud', '.tutor-msg.theirs .badge-cloud', '', 0.6);
    await s.untilEnd();
    await s.finish();
  },

  /** The Trap Gauntlet: Nano writes on the device, the referee throws one out, being sure counts. */
  async gauntlet() {
    const s = await open('gauntlet');
    await s.go('#/gauntlet');
    await s.record();
    await s.on('turns your mistakes', 0.4);
    // The referee rules just before it is mentioned.
    await s.ev(`window.__refDelay = ${Math.round((s.when('throws out any unfair ones') - s.videoNow() - 2.6) * 1000)}`);
    await s.click('button.btn.primary', 'Start the gauntlet', { ms: 500 });
    await s.circle('Nano writes true-or-false traps', '.badge-on-device');
    await s.on('while a cloud referee', 0.6);
    await s.click('.trap-true', '', { label: 'answer-0', ms: 500 });
    await s.circle('throws out any unfair ones', '.ref-chip');
    await s.on('Confidence counts', 0.4);
    await s.click('.trap-false', '', { label: 'answer-1', ms: 500 });
    await s.point('being sure earns more', '.trap-sure');
    await s.click('.trap-sure', '', { label: 'sure', ms: 100, pause: 50 });
    await s.on("costs more when you're wrong", 0.2);
    await s.click('.trap-true', '', { label: 'answer-2', ms: 500 });
    await s.end('gauntlet', 0.6);
    await s.click('.trap-false', '', { label: 'answer-3', ms: 500 });
    await s.untilEnd();
    await s.finish();
  },

  /** A question read aloud: loading, then speaking. */
  async voice() {
    const s = await open('voice');
    await s.go('#/study');
    await s.box('.read-aloud');
    await s.record();
    await s.on('read aloud', 0.9);
    await s.click('.read-aloud', '', { label: 'speaker', ms: 600 });
    await s.circle('read aloud', '.read-aloud');
    await s.untilEnd();
    await s.finish();
  },

  /** The AI engine page: where each job runs, offline, and Private mode. */
  async engine() {
    const s = await open('engine');
    await s.go('#/engine');
    await s.record();
    await s.start('engine', 0.2);
    await scrollTo(s, '.card', 'Right now', 70);
    await s.point('shows where each job runs', '.routes');
    await s.cue('Go offline', 0.2);
    await s.offline(true);
    await s.circle('Go offline', '.routes', '', 0.4);
    await s.on('And in Private mode', 1.6);
    await s.offline(false);
    await scrollTo(s, '.card', 'Privacy mode', 220);
    await s.sleep(1000);
    await s.circle('Private mode', '.card', 'Privacy mode');
    await s.untilEnd();
    await s.finish();
  },

  /** Insights: claimed against actual, then the "Certain, but wrong" list; the video ends here. */
  async close() {
    const s = await open('close');
    await s.go('#/insights');
    await s.record();
    await s.sleep(300);
    await scrollTo(s, '.card', 'Claimed vs actual', 40);
    await s.circle('how sure you felt with how you actually did', '.calib-col:last-child');
    await s.on('so you study', 0.9);
    await scrollTo(s, '.card', 'Certain, but wrong', 40);
    await s.circle('what you only thought you knew', '.card', 'Certain, but wrong', 0.9);
    await s.untilEnd();
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
