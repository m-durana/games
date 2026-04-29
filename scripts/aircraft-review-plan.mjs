#!/usr/bin/env node
// Plan the next batch of reviewer agents. Two roles:
//
// 1) Pre-write empty patches for every pending family so the status script can
//    distinguish "queued" from "never queued" from "stuck".  Run once at the
//    start of a campaign:   node scripts/aircraft-review-plan.mjs --prewrite
//
// 2) Print the next N families that need an agent (skipping completed and
//    in-progress ones), with copy-pasteable prompts.  Use to drive the
//    next batch:                node scripts/aircraft-review-plan.mjs --batch 5
//
// Default (no flags): print pending state in one line so you can pipe it.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASELINE = join(ROOT, 'src', 'data', 'aircraft-review-baseline.json');
const PHOTOS = join(ROOT, 'src', 'data', 'aircraft-photos.json');
const AIRCRAFT = join(ROOT, 'src', 'data', 'aircraft.json');
const PATCHES_DIR = join(ROOT, 'tmp', 'aircraft-review-patches');
const PILOT_INPUTS = join(ROOT, 'tmp', 'pilot-inputs');

const args = process.argv.slice(2);
const PREWRITE = args.includes('--prewrite');
const batchIdx = args.indexOf('--batch');
const BATCH_N = batchIdx >= 0 ? parseInt(args[batchIdx + 1], 10) : 0;
const CHUNK_SIZE = 50;

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const photos = JSON.parse(readFileSync(PHOTOS, 'utf8'));
const aircraft = Object.fromEntries(JSON.parse(readFileSync(AIRCRAFT, 'utf8')).map((a) => [a.id, a]));

if (!existsSync(PATCHES_DIR)) mkdirSync(PATCHES_DIR, { recursive: true });
if (!existsSync(PILOT_INPUTS)) mkdirSync(PILOT_INPUTS, { recursive: true });

function pendingFor(fam) {
  const e = baseline[fam] || { approved: [], rejected: [], verified: [] };
  const rej = new Set(e.rejected || []);
  const ver = new Set(e.verified || []);
  const pool = photos[fam] || [];
  return pool.filter((u) => !rej.has(u) && !ver.has(u));
}

function chunkFor(fam) {
  // Return list of {chunk, urls} for this family, splitting into CHUNK_SIZE.
  const all = pendingFor(fam);
  if (all.length === 0) return [];
  if (all.length <= CHUNK_SIZE) return [{ chunk: 0, urls: all }];
  const out = [];
  for (let i = 0; i < all.length; i += CHUNK_SIZE) {
    out.push({ chunk: Math.floor(i / CHUNK_SIZE), urls: all.slice(i, i + CHUNK_SIZE) });
  }
  return out;
}

function patchPathFor(fam, chunk) {
  return join(PATCHES_DIR, chunk === 0 ? `${fam}.json` : `${fam}-c${chunk}.json`);
}

function loadPatch(p) {
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function classify(p) {
  if (!p) return 'no-patch';
  if (p.completed) return 'done';
  const n = (p.verdicts || []).length;
  if (n > 0) return 'in-progress';
  return 'queued';
}

// Build full work list.
const work = [];
for (const fam of Object.keys(baseline)) {
  for (const { chunk, urls } of chunkFor(fam)) {
    const p = patchPathFor(fam, chunk);
    const existing = loadPatch(p);
    work.push({ fam, chunk, urls, patchPath: p, existing, state: classify(existing) });
  }
}

if (PREWRITE) {
  let made = 0;
  for (const w of work) {
    if (w.existing) continue;
    // Also write the input file so agents have a stable location to read URLs.
    const inputPath = join(PILOT_INPUTS, w.chunk === 0 ? `${w.fam}.json` : `${w.fam}-c${w.chunk}.json`);
    writeFileSync(inputPath, JSON.stringify({ family: w.fam, chunk: w.chunk, spec: aircraft[w.fam], urls: w.urls }, null, 2));
    writeFileSync(w.patchPath, JSON.stringify({
      family: w.fam,
      chunk: w.chunk,
      status: 'queued',
      started: null,
      completed: false,
      verdicts: [],
    }, null, 2));
    made++;
  }
  console.log(`pre-wrote ${made} new queue entries (out of ${work.length} total work units)`);
}

const todo = work.filter((w) => w.state === 'queued' || w.state === 'no-patch');
const inProgress = work.filter((w) => w.state === 'in-progress');
const done = work.filter((w) => w.state === 'done');

console.log();
console.log(`PROGRESS: ${done.length} done / ${inProgress.length} in-progress / ${todo.length} todo (of ${work.length} units)`);

if (BATCH_N > 0) {
  // Sort todo by family-pending ascending (small ones first — more wins per quota use).
  todo.sort((a, b) => a.urls.length - b.urls.length);
  const next = todo.slice(0, BATCH_N);
  console.log();
  console.log(`NEXT BATCH (${next.length}):`);
  for (const w of next) {
    const inputName = w.chunk === 0 ? `${w.fam}.json` : `${w.fam}-c${w.chunk}.json`;
    console.log(`  ${w.fam}${w.chunk ? ` chunk ${w.chunk}` : ''}  (${w.urls.length} urls)  input: tmp/pilot-inputs/${inputName}  output: ${w.patchPath.split(/[\\/]/).pop()}`);
  }
  console.log();
  console.log('Launch each as a Claude Code agent (model=sonnet, run_in_background=true) using the prompt template in docs/aircraft-photo-review.md "Agent contract".');
}
