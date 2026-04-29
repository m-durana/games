#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FAMILIES = ['a320ceo', 'b737-800', 'b787-9'];

function patchByUrl(p) {
  const m = new Map();
  for (const v of p.verdicts || []) m.set(v.url, v);
  for (const s of p.skipped || []) m.set(s.url, { url: s.url, verdict: 'skipped', http_code: s.http_code });
  return m;
}

function fmt(v) {
  if (!v) return '_(no verdict)_';
  if (v.verdict === 'skipped') return `⏭ skipped (http ${v.http_code})`;
  const conf = v.confidence !== undefined ? ` conf=${v.confidence}` : '';
  const fc = v.failed_criteria?.length ? ` C${v.failed_criteria.join(',')}` : '';
  const refile = v.refile_to ? ` → **${v.refile_to}**` : '';
  const reason = v.reason ? ` — ${v.reason}` : '';
  const icon = { verified: '✅', rejected: '❌', refile: '🔁', unsure: '❓', skipped: '⏭' }[v.verdict] || '?';
  return `${icon} **${v.verdict}**${refile}${conf}${fc}${reason}`;
}

let md = '# Aircraft photo review — pilot diff\n\n';
md += 'Side-by-side sonnet vs haiku verdicts on the same URL set per aircraft. Use your eye to judge each call.\n\n';

const totals = { agree: 0, disagree: 0, total: 0 };

for (const fam of FAMILIES) {
  const sonnet = JSON.parse(readFileSync(join(ROOT, 'tmp/aircraft-review-patches', `${fam}-pilot-sonnet.json`), 'utf8'));
  const haiku = JSON.parse(readFileSync(join(ROOT, 'tmp/aircraft-review-patches', `${fam}-pilot-haiku.json`), 'utf8'));
  const input = JSON.parse(readFileSync(join(ROOT, 'tmp/pilot-inputs', `${fam}-pilot-sonnet.json`), 'utf8'));
  const sMap = patchByUrl(sonnet);
  const hMap = patchByUrl(haiku);

  const sCounts = { verified: 0, rejected: 0, refile: 0, unsure: 0, skipped: 0 };
  const hCounts = { verified: 0, rejected: 0, refile: 0, unsure: 0, skipped: 0 };
  for (const v of sMap.values()) sCounts[v.verdict] = (sCounts[v.verdict] || 0) + 1;
  for (const v of hMap.values()) hCounts[v.verdict] = (hCounts[v.verdict] || 0) + 1;

  md += `## ${fam}\n\n`;
  md += `**sonnet:** ${sCounts.verified}v / ${sCounts.rejected}r / ${sCounts.refile}rf / ${sCounts.unsure}u / ${sCounts.skipped}sk\n`;
  md += `**haiku:** ${hCounts.verified}v / ${hCounts.rejected}r / ${hCounts.refile}rf / ${hCounts.unsure}u / ${hCounts.skipped}sk\n\n`;

  let i = 0;
  for (const url of input.urls) {
    i++;
    totals.total++;
    const s = sMap.get(url);
    const h = hMap.get(url);
    const sameVerdict = s?.verdict === h?.verdict && (s?.refile_to ?? null) === (h?.refile_to ?? null);
    if (sameVerdict) totals.agree++; else totals.disagree++;
    const flag = sameVerdict ? '🟢 agree' : '🔴 disagree';

    md += `### ${fam} #${i} — ${flag}\n\n`;
    md += `${url}\n\n`;
    md += `![](${url})\n\n`;
    md += `- **sonnet:** ${fmt(s)}\n`;
    md += `- **haiku:** ${fmt(h)}\n\n`;

    if (s?.notes || s?.reason) {
      const note = s.notes || s.reason;
      if (note && note !== s.reason) md += `  sonnet notes: ${note}\n`;
    }
    md += '---\n\n';
  }
}

md += `\n## Overall agreement\n\n`;
md += `- Total photos: ${totals.total}\n`;
md += `- Agreement: ${totals.agree} (${(totals.agree / totals.total * 100).toFixed(0)}%)\n`;
md += `- Disagreement: ${totals.disagree}\n`;

const out = join(ROOT, 'docs', 'aircraft-photo-review-pilot.md');
writeFileSync(out, md);
console.log(`wrote ${out}  (${totals.agree}/${totals.total} agreement)`);
