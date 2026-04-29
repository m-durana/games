#!/usr/bin/env node
// Print review progress without modifying any state.
//
// Classifies every family into one of:
//   complete     — all photos verdicted (nothing pending)
//   done-patch   — pending=0 and a completed patch exists ready to merge
//   in-progress  — patch exists with some verdicts, completed:false
//   stuck        — patch exists but verdicts:[] (likely rate-limited at start)
//   queued       — pre-written empty patch with status:"queued" (agent not yet launched)
//   pending      — work to do, no patch yet
//
// Run: node scripts/aircraft-review-status.mjs
//      node scripts/aircraft-review-status.mjs --verbose   (per-family detail)

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASELINE = join(ROOT, 'src', 'data', 'aircraft-review-baseline.json');
const PHOTOS = join(ROOT, 'src', 'data', 'aircraft-photos.json');
const PATCHES_DIR = join(ROOT, 'tmp', 'aircraft-review-patches');

const VERBOSE = process.argv.includes('--verbose');
const STUCK_THRESHOLD_MIN = 10;

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const photos = JSON.parse(readFileSync(PHOTOS, 'utf8'));

function pendingFor(fam) {
  const e = baseline[fam] || { approved: [], rejected: [], verified: [] };
  const rej = new Set(e.rejected || []);
  const ver = new Set(e.verified || []);
  const pool = photos[fam] || [];
  return pool.filter((u) => !rej.has(u) && !ver.has(u)).length;
}

const patchByFam = new Map();
if (existsSync(PATCHES_DIR)) {
  for (const f of readdirSync(PATCHES_DIR)) {
    if (!f.endsWith('.json')) continue;
    const p = join(PATCHES_DIR, f);
    if (!statSync(p).isFile()) continue;
    let patch;
    try { patch = JSON.parse(readFileSync(p, 'utf8')); } catch { continue; }
    const ageMin = (Date.now() - statSync(p).mtimeMs) / 60_000;
    patchByFam.set(patch.family, { patch, file: f, ageMin });
  }
}

function classify(fam, pending) {
  const slot = patchByFam.get(fam);
  if (!slot) return pending === 0 ? 'complete' : 'pending';
  const { patch, ageMin } = slot;
  if (patch.completed) return 'done-patch';
  const n = (patch.verdicts || []).length;
  if (n > 0) return 'in-progress';
  if (patch.status === 'queued') return 'queued';
  if (ageMin > STUCK_THRESHOLD_MIN) return 'stuck';
  return 'queued';
}

const rows = [];
for (const fam of Object.keys(baseline)) {
  const pending = pendingFor(fam);
  const slot = patchByFam.get(fam);
  const verdictCount = slot ? (slot.patch.verdicts || []).length : 0;
  const state = classify(fam, pending);
  rows.push({ fam, pending, verdictCount, state, ageMin: slot?.ageMin });
}

const STATE_ORDER = ['stuck', 'queued', 'in-progress', 'done-patch', 'pending', 'complete'];
rows.sort((a, b) => {
  const so = STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state);
  return so !== 0 ? so : b.pending - a.pending;
});

const totals = rows.reduce((acc, r) => {
  acc.byState[r.state] = (acc.byState[r.state] || 0) + 1;
  acc.pending += r.pending;
  acc.verdicted += r.verdictCount;
  return acc;
}, { byState: {}, pending: 0, verdicted: 0 });

console.log(`STATE                  count`);
console.log(`---------------------  -----`);
for (const s of STATE_ORDER) {
  console.log(`${s.padEnd(22)} ${String(totals.byState[s] || 0).padStart(5)}`);
}
console.log(`---------------------  -----`);
console.log(`Total pending photos:  ${totals.pending}`);
console.log(`Total verdicts in flight: ${totals.verdicted}`);
console.log();

const stuck = rows.filter((r) => r.state === 'stuck');
const queued = rows.filter((r) => r.state === 'queued');
const inProgress = rows.filter((r) => r.state === 'in-progress');
const donePatch = rows.filter((r) => r.state === 'done-patch');

if (stuck.length) {
  console.log('STUCK (likely rate-limited; relaunch these):');
  for (const r of stuck) console.log(`  ${r.fam.padEnd(14)} pending=${r.pending} (patch ${r.ageMin.toFixed(0)}m old, 0 verdicts)`);
  console.log();
}
if (queued.length) {
  console.log('QUEUED (waiting for an agent):');
  for (const r of queued) console.log(`  ${r.fam.padEnd(14)} pending=${r.pending}`);
  console.log();
}
if (inProgress.length) {
  console.log('IN-PROGRESS:');
  for (const r of inProgress) console.log(`  ${r.fam.padEnd(14)} ${r.verdictCount}/${r.pending + r.verdictCount} verdicts (${r.ageMin.toFixed(0)}m old)`);
  console.log();
}
if (donePatch.length) {
  console.log(`DONE BUT UNMERGED (${donePatch.length}) — run \`node scripts/merge-aircraft-review-patches.mjs\``);
  if (VERBOSE) for (const r of donePatch) console.log(`  ${r.fam}`);
  console.log();
}
// Last 5 watcher ticks (campaign health at a glance).
const LOG = join(ROOT, 'tmp', 'aircraft-review-watcher.log');
if (existsSync(LOG)) {
  const lines = readFileSync(LOG, 'utf8').trim().split('\n').filter((l) => l.includes('tick:')).slice(-5);
  if (lines.length) {
    console.log('LAST 5 WATCHER TICKS:');
    for (const l of lines) console.log('  ' + l);
    console.log();
  }
}

if (VERBOSE) {
  console.log('FULL TABLE:');
  console.log('family         pending  verdicts  state         age');
  console.log('-------------  -------  --------  ------------  ----');
  for (const r of rows) {
    const age = r.ageMin !== undefined ? `${r.ageMin.toFixed(0)}m` : '-';
    console.log(`${r.fam.padEnd(14)} ${String(r.pending).padStart(7)}  ${String(r.verdictCount).padStart(8)}  ${r.state.padEnd(12)}  ${age}`);
  }
}
