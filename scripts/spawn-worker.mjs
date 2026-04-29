#!/usr/bin/env node
// Spawn one verifier worker as a fully detached `claude -p` process.
// Usage: node scripts/spawn-worker.mjs <family> [chunk]
// The detached worker survives this script's exit AND the parent dispatcher session's exit.
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [, , family, chunkArg] = process.argv;
if (!family) {
  console.error('Usage: spawn-worker.mjs <family> [chunk]');
  process.exit(2);
}
const chunk = chunkArg && Number(chunkArg) > 0 ? Number(chunkArg) : 0;
const tag = chunk > 0 ? `${family}-c${chunk}` : family;

mkdirSync(join(ROOT, 'tmp/aircraft-review-logs'), { recursive: true });
const logPath = join(ROOT, 'tmp/aircraft-review-logs', `${tag}.log`);
const logFd = openSync(logPath, 'a');

const prompt = execSync(`node "${join(ROOT, 'scripts/build-worker-prompt.mjs')}" ${family} ${chunk}`, {
  encoding: 'utf8',
}).toString();

const env = { ...process.env };
for (const k of Object.keys(env)) {
  if (k.startsWith('CLAUDE') || k.startsWith('ANTHROPIC_')) delete env[k];
}

const child = spawn(
  'claude',
  ['-p', '--model', 'sonnet', '--dangerously-skip-permissions', prompt],
  {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env,
    windowsHide: true,
  }
);

child.unref();
console.log(`spawned ${tag} pid=${child.pid} log=${logPath}`);
