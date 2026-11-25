// Renders preview stills from one bundle: node stills.mjs 6 23 49 ...   (seconds)
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'node:path';

const times = process.argv.slice(2).map(Number);
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const composition = await selectComposition({ serveUrl, id: 'Demo' });
for (const t of times) {
  await renderStill({ composition, serveUrl, frame: Math.round(t * 30), output: path.resolve(`out/stills/t${t}.png`) });
  console.log('still', t);
}
