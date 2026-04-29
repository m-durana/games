#!/usr/bin/env node
// Prepare 6 pilot work units: 3 aircraft x 2 models, first 10 URLs each.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FAMILIES = ['a320ceo', 'b737-800', 'b787-9'];
const MODELS = ['sonnet', 'haiku'];
const N = 10;

for (const fam of FAMILIES) {
  const src = JSON.parse(readFileSync(join(ROOT, 'tmp/pilot-inputs', `${fam}.json`), 'utf8'));
  const urls = src.urls.slice(0, N);
  for (const model of MODELS) {
    const tag = `${fam}-pilot-${model}`;
    writeFileSync(
      join(ROOT, 'tmp/pilot-inputs', `${tag}.json`),
      JSON.stringify({ ...src, family: fam, chunk: 0, urls, pilotModel: model }, null, 2)
    );
    writeFileSync(
      join(ROOT, 'tmp/aircraft-review-patches', `${tag}.json`),
      JSON.stringify({ family: fam, chunk: 0, pilotModel: model, status: 'queued', started: null, completed: false, verdicts: [] }, null, 2)
    );
    console.log(`prepared ${tag} (${urls.length} urls)`);
  }
}
