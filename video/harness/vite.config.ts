// The "film set": the real Recall app with sign-in, the database and the AI models swapped for
// scripted stand-ins (./mocks), so every screen can be recorded with realistic data and timing.
// Run from video/: npx vite --config harness/vite.config.ts
import react from '../../node_modules/@vitejs/plugin-react/dist/index.js';
import { defineConfig, type Plugin } from '../../node_modules/vite/dist/node/index.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const slash = (p: string) => p.split(path.sep).join('/');
const here = slash(path.dirname(fileURLToPath(import.meta.url)));
const repo = slash(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));

const swap: Plugin = {
  name: 'film-mocks',
  enforce: 'pre',
  resolveId(source, importer) {
    // Inside src/services the modules import each other as ./store, ./firebase, ./engine.
    const inServices = !!importer && slash(importer).includes('/src/services/');
    for (const name of ['store', 'firebase', 'engine', 'tutor', 'gauntlet']) {
      const bare = source.replace(/\.ts$/, '');
      if (bare.endsWith(`services/${name}`) || (inServices && bare === `./${name}`)) return `${here}/mocks/${name}.ts`;
    }
    if (source === 'firebase/auth') return `${here}/mocks/auth.ts`;
    return null;
  },
};

export default defineConfig({
  root: repo,
  define: { __BUILD_DATE__: JSON.stringify('film') },
  plugins: [swap, react()],
  server: { port: 5199, strictPort: true, fs: { allow: [repo] } },
  cacheDir: `${here}/.vite`,
});
