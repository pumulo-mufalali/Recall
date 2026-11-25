// Writes src/narration.json: each segment's text and the length of its WAV, for the edit.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const script = JSON.parse(fs.readFileSync(path.join(__dirname, 'script.json'), 'utf8'));
const out = {};
for (const s of script.segments) {
  const wav = path.join(__dirname, '..', 'public', 'narration', `${s.id}.wav`);
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString());
  out[s.id] = { seconds, text: s.text };
}
fs.writeFileSync(path.join(__dirname, '..', 'src', 'narration.json'), JSON.stringify(out, null, 2) + '\n');
console.log(Object.entries(out).map(([id, v]) => `${id} ${v.seconds.toFixed(2)} s`).join(', '));
