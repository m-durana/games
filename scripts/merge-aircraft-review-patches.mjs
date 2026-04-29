#!/usr/bin/env node
// Merge reviewer-agent patches into aircraft-review-baseline.json.
//
// - Idempotent: a verdict already reflected in the baseline is skipped.
// - Only completed patches are merged; in-flight (`completed: false`) are left alone.
// - Merged patches move to tmp/aircraft-review-patches/processed/.
// - Refreshes the tally + verdict-log sections in docs/aircraft-photo-review-log.md.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, renameSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASELINE = join(ROOT, 'src', 'data', 'aircraft-review-baseline.json');
const PATCHES_DIR = join(ROOT, 'tmp', 'aircraft-review-patches');
const PROCESSED_DIR = join(PATCHES_DIR, 'processed');
const LOG = join(ROOT, 'docs', 'aircraft-photo-review-log.md');

function loadJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }
function saveJson(p, obj) { writeFileSync(p, JSON.stringify(obj, null, 2) + '\n'); }

function ensureFam(baseline, fam) {
  if (!baseline[fam]) baseline[fam] = { approved: [], rejected: [], verified: [] };
  return baseline[fam];
}

function applyPatch(baseline, patch) {
  const fam = patch.family;
  if (!baseline[fam]) {
    console.warn(`  skip: family ${fam} not in baseline`);
    return { verified: 0, rejected: 0, refiled: 0, unsure: 0 };
  }
  const src = baseline[fam];
  const sApp = new Set(src.approved || []);
  const sRej = new Set(src.rejected || []);
  const sVer = new Set(src.verified || []);
  let nVer = 0, nRej = 0, nRef = 0, nUns = 0;
  for (const v of patch.verdicts || []) {
    if (v.verdict === 'verified') {
      // Verifier may now act on non-approved URLs too — ensure it lands in approved.
      if (!sApp.has(v.url)) sApp.add(v.url);
      if (!sVer.has(v.url)) { sVer.add(v.url); nVer++; }
    } else if (v.verdict === 'rejected' || v.verdict === 'unsure') {
      if (sApp.has(v.url)) { sApp.delete(v.url); }
      sVer.delete(v.url);
      sRej.add(v.url);
      if (v.verdict === 'rejected') nRej++; else nUns++;
    } else if (v.verdict === 'refile') {
      const target = v.refile_to;
      if (!target) { console.warn(`  refile without refile_to: ${v.url}`); continue; }
      const dst = ensureFam(baseline, target);
      const dApp = new Set(dst.approved || []);
      const dVer = new Set(dst.verified || []);
      sApp.delete(v.url);
      sVer.delete(v.url);
      // Don't put into rejected — it's a good photo, just for a different family.
      dApp.add(v.url);
      dVer.add(v.url);
      dst.approved = [...dApp];
      dst.verified = [...dVer];
      nRef++;
    } else {
      console.warn(`  unknown verdict ${v.verdict} for ${v.url}`);
    }
  }
  src.approved = [...sApp];
  src.rejected = [...sRej];
  src.verified = [...sVer];
  return { verified: nVer, rejected: nRej, refiled: nRef, unsure: nUns };
}

function refreshLog(baseline, processedPatches) {
  const entries = Object.entries(baseline);
  // Tally table.
  const rows = entries
    .map(([fam, e]) => {
      const approved = (e.approved || []).length;
      const verified = (e.verified || []).length;
      const rejected = (e.rejected || []).length;
      const pending = approved - verified;
      return { fam, approved, verified, rejected, pending };
    })
    .sort((a, b) => b.pending - a.pending);
  const totals = rows.reduce((acc, r) => ({
    approved: acc.approved + r.approved,
    verified: acc.verified + r.verified,
    rejected: acc.rejected + r.rejected,
    pending: acc.pending + r.pending,
  }), { approved: 0, verified: 0, rejected: 0, pending: 0 });

  const tally = [
    '| family | pending | verified | rejected | approved |',
    '|---|---:|---:|---:|---:|',
    ...rows.map(r => `| \`${r.fam}\` | ${r.pending} | ${r.verified} | ${r.rejected} | ${r.approved} |`),
    `| **total** | **${totals.pending}** | **${totals.verified}** | **${totals.rejected}** | **${totals.approved}** |`,
    '',
    `_Last refreshed: ${new Date().toISOString()}_`,
  ].join('\n');

  // Verdict log entries (append-only): we read the existing log and add new sections for processedPatches.
  const log = readFileSync(LOG, 'utf8');
  const newSections = processedPatches.map(p => {
    const head = `### \`${p.family}\`${p.chunk ? ` chunk ${p.chunk}` : ''} — merged ${new Date().toISOString()}`;
    const total = p.verdicts.length;
    const counts = { verified: 0, rejected: 0, refile: 0, unsure: 0 };
    for (const v of p.verdicts) counts[v.verdict] = (counts[v.verdict] || 0) + 1;
    const borderline = p.verdicts.filter(v => v.borderline);
    const unsure = p.verdicts.filter(v => v.verdict === 'unsure');
    const refile = p.verdicts.filter(v => v.verdict === 'refile');
    const lines = [
      head,
      '',
      `${total} verdicts: ${counts.verified} verified, ${counts.rejected} rejected, ${counts.refile} refiled, ${counts.unsure} unsure.`,
      '',
    ];
    if (refile.length) {
      lines.push(`**Refiled (${refile.length}):**`);
      lines.push('');
      for (const v of refile) {
        lines.push(`- → \`${v.refile_to}\` (conf ${v.confidence.toFixed(2)}): ${v.reason}`);
        lines.push(`  - ${v.url}`);
      }
      lines.push('');
    }
    if (unsure.length) {
      lines.push(`**Unsure (${unsure.length}) — moved to rejected, please human-check:**`);
      lines.push('');
      for (const v of unsure) {
        lines.push(`- (conf ${v.confidence.toFixed(2)}): ${v.reason}`);
        lines.push(`  - ${v.url}`);
      }
      lines.push('');
    }
    if (borderline.length) {
      lines.push(`**Borderline (${borderline.length}, confidence < 0.7):**`);
      lines.push('');
      for (const v of borderline) {
        lines.push(`- \`${v.verdict}\` (conf ${v.confidence.toFixed(2)}): ${v.reason}`);
        lines.push(`  - ${v.url}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }).join('\n');

  let updated = log.replace(
    /<!-- TALLY:START -->[\s\S]*?<!-- TALLY:END -->/,
    `<!-- TALLY:START -->\n${tally}\n<!-- TALLY:END -->`
  );
  if (newSections) {
    updated = updated.replace(
      /<!-- VERDICTS:START -->[\s\S]*?<!-- VERDICTS:END -->/,
      (m) => {
        // Strip the placeholder if present, then prepend the new sections at the top
        // so the most recent merge appears first.
        const inner = m.replace('<!-- VERDICTS:START -->', '').replace('<!-- VERDICTS:END -->', '');
        const cleaned = inner.includes('_(empty') ? '' : inner;
        return `<!-- VERDICTS:START -->\n\n${newSections}\n${cleaned.trimStart()}\n<!-- VERDICTS:END -->`;
      }
    );
  }
  writeFileSync(LOG, updated);
}

function main() {
  if (!existsSync(PATCHES_DIR)) {
    console.log('no patches dir, nothing to do');
    return;
  }
  if (!existsSync(PROCESSED_DIR)) mkdirSync(PROCESSED_DIR, { recursive: true });

  const baseline = loadJson(BASELINE);
  const files = readdirSync(PATCHES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => join(PATCHES_DIR, f))
    .filter(p => statSync(p).isFile());

  const processed = [];
  for (const file of files) {
    let patch;
    try { patch = loadJson(file); }
    catch (e) { console.warn(`  skip ${file}: parse error ${e.message}`); continue; }
    if (!patch.completed) {
      console.log(`  in-flight: ${file} — leaving for next run`);
      continue;
    }
    const r = applyPatch(baseline, patch);
    console.log(`  merged ${file}: +${r.verified} verified, ${r.rejected} rejected, ${r.refiled} refiled, ${r.unsure} unsure`);
    processed.push(patch);
    const dest = join(PROCESSED_DIR, file.split(/[\\/]/).pop());
    renameSync(file, dest);
  }

  if (processed.length === 0) {
    console.log('nothing to merge');
    refreshLog(baseline, []);
    return;
  }
  saveJson(BASELINE, baseline);
  refreshLog(baseline, processed);
  console.log(`done: ${processed.length} patch(es) applied`);
}

main();
