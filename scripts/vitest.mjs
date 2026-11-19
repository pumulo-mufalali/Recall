// Runs Vitest from the working directory with an upper-case drive letter. On Windows, a
// folder opened as "d:\..." (as editors sometimes do) makes Vitest load two copies of its
// runner, and every test file fails with "Cannot read properties of undefined (reading 'config')".
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const cwd = process.cwd().replace(/^[a-z]:/, (d) => d.toUpperCase());
const bin = join(cwd, 'node_modules', 'vitest', 'vitest.mjs');
const { status } = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { cwd, stdio: 'inherit' });
process.exit(status ?? 1);
