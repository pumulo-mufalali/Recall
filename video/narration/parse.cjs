// SCRIPT.md → narration/script.json: each part's narration and highlights, checked.
// The voice, the subtitles, the recordings' timing and the circles all come from this.
// Usage: node narration/parse.cjs
const fs = require('fs');
const path = require('path');

const IDS = { hook: 'hook', 'make questions': 'add', 'fact-check': 'factcheck', study: 'study', 'self-audit': 'audit', 'talk it through': 'tutor', 'the trap gauntlet': 'gauntlet', 'read aloud': 'voice', 'the ai engine page': 'engine', close: 'close' };

const md = fs.readFileSync(path.join(__dirname, '..', 'SCRIPT.md'), 'utf8').replace(/\r\n/g, '\n');
const parts = md.split(/^## /m).slice(1);
const problems = [];
const segments = parts.map((block) => {
  const heading = block.split('\n')[0].replace(/^\d+\.\s*/, '').trim();
  const id = IDS[heading.toLowerCase()] ?? heading.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const narration = (block.match(/\*\*Narration\*\*[^\n]*\n+([\s\S]*?)\n\s*\n/) || [])[1]?.trim().replace(/\s+/g, ' ');
  if (!narration) problems.push(`${heading}: no narration found`);
  const list = (block.match(/\*\*Highlights:\*\*\s*\n+([\s\S]*?)(?:\n\s*\n|$)/) || [])[1] || '';
  const highlights = list.split('\n').filter((l) => l.trim().startsWith('-')).map((l) => {
    const m = l.match(/^\s*-\s*"([^"]+)"\s*→\s*(point at|circle)\s*→\s*(.+)$/);
    if (!m) { problems.push(`${heading}: can't read highlight: ${l.trim()}`); return null; }
    const [, phrase, how, target] = m;
    if (narration && !narration.toLowerCase().includes(phrase.toLowerCase())) problems.push(`${heading}: "${phrase}" is not in the narration`);
    return { phrase, how: how === 'circle' ? 'circle' : 'point', target: target.trim() };
  }).filter(Boolean);
  const labelLine = (block.match(/^\*\*Label:\*\*\s*(.+)$/m) || [])[1];
  let label = null;
  if (labelLine) {
    const [kind, title, detail] = labelLine.split('|').map((x) => x.trim());
    const kinds = { 'on device': 'device', cloud: 'cloud', hybrid: 'hybrid', 'under the hood': 'code' };
    if (!kinds[kind?.toLowerCase()] || !title) problems.push(`${heading}: can't read label: ${labelLine}`);
    else label = { kind: kinds[kind.toLowerCase()], title, detail: detail || '' };
  }
  return { id, heading, text: narration ?? '', label, highlights };
});

if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
const file = path.join(__dirname, 'script.json');
const old = JSON.parse(fs.readFileSync(file, 'utf8'));
fs.writeFileSync(file, JSON.stringify({ voice: old.voice, model: old.model, style: old.style, segments }, null, 2) + '\n');
const words = segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
console.log(segments.map((s) => `${s.id} (${s.text.split(/\s+/).length} words, ${s.highlights.length} highlights)`).join('\n'));
console.log(`${words} words`);
