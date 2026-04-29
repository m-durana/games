#!/usr/bin/env node
// Resolve the worker prompt template for a given work unit.
// Usage: node scripts/build-worker-prompt.mjs <family> [chunk]
// Prints the resolved prompt to stdout (consumed by the dispatcher's `claude -p` launch).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [, , family, chunkArg] = process.argv;
if (!family) {
  console.error('Usage: build-worker-prompt.mjs <family> [chunk]');
  process.exit(2);
}
const chunk = chunkArg && Number(chunkArg) > 0 ? Number(chunkArg) : 0;
const tag = chunk > 0 ? `${family}-c${chunk}` : family;
const inputFile = `${tag}.json`;
const patchFile = `${tag}.json`;
const inputPath = join(ROOT, 'tmp/pilot-inputs', inputFile);
const patchPath = join(ROOT, 'tmp/aircraft-review-patches', patchFile);

if (!existsSync(inputPath)) {
  console.error(`Missing input file: ${inputPath}. Run aircraft-review-plan.mjs --prewrite.`);
  process.exit(2);
}

const tpl = readFileSync(join(ROOT, 'prompts/aircraft-review-worker.md'), 'utf8');
const workerId = `${tag}-${process.pid}`;
const nowIso = new Date().toISOString();

const resolved = tpl
  .replaceAll('<INPUT_FILE>', inputFile)
  .replaceAll('<PATCH_FILE>', patchFile)
  .replaceAll('<WORKER_ID>', workerId)
  .replaceAll('<NOW_ISO>', nowIso);

const header = `Review aircraft photos for **${family}**${chunk > 0 ? ` (chunk ${chunk})` : ''}. Use sonnet vision; the input has the URL list and the spec.\n\n`;
process.stdout.write(header + resolved);
