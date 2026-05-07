import atcData from '../data/atc.json';
import type { Difficulty } from './types';
import { airlineMeta, pooledAirlines } from './engine';

export type AtcMode =
  | 'callsign'
  | 'decode'
  | 'compose'
  | 'atcMix'
  | 'cleared'
  | 'intercept'
  | 'conflict'
  | 'sequence';
type AtcQuestionMode = Exclude<AtcMode, 'atcMix' | 'cleared' | 'intercept' | 'conflict' | 'sequence'>;
type AtcTier = Difficulty;

export interface AtcQuestion {
  mode: AtcQuestionMode;
  prompt: string;
  answer: string;
  options: string[];
  explanation: string;
  tier: AtcTier;
  airlineIata?: string;
  // Compose mode only: shuffled chip bank, including decoys.
  tokens?: string[];
  // Compose mode only: every accepted readback. Players must build one of these.
  answers?: string[];
}

export interface AtcRoundResult {
  question: AtcQuestion;
  picked: string;
  correct: boolean;
}

interface AtcDatum {
  tier: AtcTier;
  prompt: string;
  answer: string;
  explanation: string;
  distractors?: string[];
}

interface AtcComposeDatum {
  tier: AtcTier;
  prompt: string;
  answers: string[];
  tokens: string[];
  explanation: string;
}

interface AtcData {
  phraseology: AtcDatum[];
  readback: AtcDatum[];
  compose: AtcComposeDatum[];
}

const data = atcData as AtcData;
export const ATC_ROUND_LENGTH = 10;

type Rng = () => number;

// Curated "distinctive" callsigns: the radio callsign is NOT just the airline
// name. These are the only ones that make the quiz a real test rather than a
// freebie. Used at every difficulty.
// Well-known airlines whose radio callsign is genuinely distinctive (not just
// the airline name re-spoken). These survive the `callsignIsObvious` filter
// and are big enough names for an Easy round to be fair.
const DISTINCTIVE_EASY = new Set([
  'BA', 'EI', 'U2', 'FI', 'AZ', 'SN', 'DY', 'BY', 'PC', 'LS', 'AF',
]);
// Medium adds more obscure but still-distinctive callsigns.
const DISTINCTIVE_MEDIUM = new Set([
  ...DISTINCTIVE_EASY,
  'OH', 'TK', 'OK', 'SK', 'F9', 'NK', 'KE', 'JL', 'NH', 'QR', 'AR',
]);

// Callsigns that sound alike on frequency or get genuinely confused. Used to
// seed strong distractors when the answer's callsign appears here.
const CALLSIGN_CONFUSABLES: Record<string, string[]> = {
  SPEEDBIRD: ['SHAMROCK', 'SHUTTLE'],
  SHAMROCK: ['SPEEDBIRD'],
  DYNASTY: ['MANDARIN'],
  MANDARIN: ['DYNASTY'],
  AIRFRANS: ['ITARROW', 'IBERIA'],
  ITARROW: ['AIRFRANS', 'IBERIA'],
  SCANDINAVIAN: ['SHAMROCK', 'SPEEDBIRD'],
  SHUTTLE: ['SPEEDBIRD'],
};

function normalizeTokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((t) => t.length >= 3);
}

function callsignIsObvious(airlineName: string, callsign: string): boolean {
  const nameTokens = normalizeTokens(airlineName);
  const cs = callsign.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (cs.length < 3) return true;
  for (const t of nameTokens) {
    if (t.length < 4) continue; // short tokens like 'air', 'jet' aren't enough on their own
    // Callsign contains a name token: QATARI ⊃ 'qatar', AIRFRANS ⊃ 'air'... (token len ≥4 only).
    if (cs.includes(t)) return true;
    // Callsign is contained in a name token: 'iberia' ⊂ 'iberia'.
    if (t.includes(cs)) return true;
  }
  return false;
}

function defaultRng(): Rng {
  return Math.random;
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick<T>(arr: T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)];
}

function callsignPool(difficulty: Difficulty) {
  return pooledAirlines()
    .map((airline) => ({ airline, meta: airlineMeta(airline.iata) }))
    .filter((entry) => {
      if (!entry.meta.callsign) return false;
      // Universally drop callsigns that are essentially the airline name.
      if (callsignIsObvious(entry.airline.name, entry.meta.callsign)) return false;
      if (difficulty === 'easy') return DISTINCTIVE_EASY.has(entry.airline.iata);
      if (difficulty === 'medium') return DISTINCTIVE_MEDIUM.has(entry.airline.iata);
      // Hard: anything distinctive that's left.
      return true;
    });
}

function buildCallsignQuestion(difficulty: Difficulty, rng: Rng): AtcQuestion {
  const pool = callsignPool(difficulty);
  const entry = pick(pool, rng);
  const answer = entry.meta.callsign as string;
  // Wide distractor pool: every distinctive callsign anywhere, not just the
  // tier pool. This breaks the "memorize the option set" shortcut on Easy.
  const widePool = callsignPool('hard');
  const sameCountry = widePool.filter(
    (x) => x.airline.iata !== entry.airline.iata && x.airline.country === entry.airline.country,
  );
  const sameAlliance = widePool.filter(
    (x) => x.airline.iata !== entry.airline.iata && x.airline.alliance && x.airline.alliance === entry.airline.alliance,
  );
  // Hand-authored confusables go first - these are the deliberate trap pairs.
  const confusableNames = CALLSIGN_CONFUSABLES[answer] ?? [];
  const confusables = widePool.filter((x) => confusableNames.includes(x.meta.callsign as string));
  const ranked = [
    ...shuffle(confusables, rng),
    ...shuffle(sameCountry, rng),
    ...shuffle(sameAlliance, rng),
    ...shuffle(widePool, rng),
  ];
  const distractors: string[] = [];
  for (const candidate of ranked) {
    const cs = candidate.meta.callsign as string;
    if (cs === answer) continue;
    if (distractors.includes(cs)) continue;
    distractors.push(cs);
    if (distractors.length === 3) break;
  }
  return {
    mode: 'callsign',
    prompt: entry.airline.name,
    answer,
    options: shuffle([answer, ...distractors], rng),
    explanation: `${entry.airline.name} uses ICAO ${entry.meta.icao ?? entry.airline.iata} and the radio callsign ${answer}.`,
    tier: difficulty,
    airlineIata: entry.airline.iata,
  };
}

function distractorsForDatum(item: AtcDatum, source: AtcDatum[], difficulty: Difficulty, rng: Rng): string[] {
  // Prefer hand-crafted distractors that share vocabulary with the answer - // those defeat the keyword-matching shortcut. Fall back to other items only
  // when none are provided.
  if (item.distractors && item.distractors.length >= 3) {
    return shuffle(item.distractors, rng).slice(0, 3);
  }
  // Tier-matched distractors: all four options share the same difficulty tier,
  // so easier items can't sneak in as obvious wrong answers.
  const sameTier = source.filter((x) => x.tier === difficulty && x.answer !== item.answer);
  const out = shuffle(sameTier.map((x) => x.answer), rng).slice(0, 3);
  if (out.length < 3) {
    const extras = shuffle(source.map((x) => x.answer).filter((x) => x !== item.answer && !out.includes(x)), rng).slice(0, 3 - out.length);
    out.push(...extras);
  }
  return out;
}

const TIER_ORDER: AtcTier[] = ['easy', 'medium', 'hard'];

function tierFallbackSource<T extends { tier: AtcTier }>(items: T[], difficulty: Difficulty): T[] {
  // Strictly the requested tier first; if too small for a full round, expand
  // to adjacent tiers (harder before easier) so the round still has 10 unique
  // prompts but stays as challenging as possible.
  const strict = items.filter((item) => item.tier === difficulty);
  if (strict.length >= ATC_ROUND_LENGTH) return strict;
  const idx = TIER_ORDER.indexOf(difficulty);
  const out = [...strict];
  const expansionOrder: AtcTier[] = [
    ...TIER_ORDER.slice(idx + 1),
    ...TIER_ORDER.slice(0, idx).reverse(),
  ];
  for (const t of expansionOrder) {
    if (out.length >= ATC_ROUND_LENGTH) break;
    for (const item of items) {
      if (item.tier === t && !out.includes(item)) out.push(item);
    }
  }
  return out;
}

function decodeSource(): AtcDatum[] {
  // Merged pool: phraseology + readback are now one mode ("Decode ATC").
  return [...data.phraseology, ...data.readback];
}

function buildDecodeQuestion(difficulty: Difficulty, rng: Rng): AtcQuestion {
  const all = decodeSource();
  const source = tierFallbackSource(all, difficulty);
  const item = pick(source, rng);
  const distractors = distractorsForDatum(item, all, difficulty, rng);
  return {
    mode: 'decode',
    prompt: item.prompt,
    answer: item.answer,
    options: shuffle([item.answer, ...distractors], rng),
    explanation: item.explanation,
    tier: item.tier,
  };
}

function buildComposeQuestion(difficulty: Difficulty, rng: Rng): AtcQuestion {
  const source = tierFallbackSource(data.compose, difficulty);
  const item = pick(source, rng);
  // The bank is hand-authored per item (includes decoys). Just shuffle for display.
  const tokens = shuffle(item.tokens, rng);
  return {
    mode: 'compose',
    prompt: item.prompt,
    answer: item.answers[0],
    answers: item.answers,
    options: [],
    explanation: item.explanation,
    tier: item.tier,
    tokens,
  };
}

function buildSingleQuestion(mode: AtcQuestionMode, difficulty: Difficulty, rng: Rng): AtcQuestion {
  if (mode === 'callsign') return buildCallsignQuestion(difficulty, rng);
  if (mode === 'compose') return buildComposeQuestion(difficulty, rng);
  return buildDecodeQuestion(difficulty, rng);
}

export function buildAtcRound(mode: AtcMode, difficulty: Difficulty, rng: Rng = defaultRng()): AtcQuestion[] {
  // 'radar', 'cleared', and 'intercept' have their own builders in
  // atc-radar.ts / cleared-direct.ts / intercepts.ts and never reach this
  // function - App.svelte dispatches to their dedicated round components.
  if (mode === 'conflict' || mode === 'sequence' || mode === 'cleared' || mode === 'intercept') return [];
  const modes: AtcQuestionMode[] = mode === 'atcMix'
    ? ['callsign', 'decode', 'compose']
    : [mode];
  const out: AtcQuestion[] = [];
  const seen = new Set<string>();
  let safety = 0;
  while (out.length < ATC_ROUND_LENGTH && safety < 500) {
    safety++;
    const questionMode = mode === 'atcMix' ? modes[out.length % modes.length] : pick(modes, rng);
    const q = buildSingleQuestion(questionMode, difficulty, rng);
    const key = `${q.mode}:${q.prompt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return mode === 'atcMix' ? shuffle(out, rng) : out;
}

export function atcModeTitle(mode: AtcMode | AtcQuestionMode): string {
  switch (mode) {
    case 'callsign': return 'Callsign Quiz';
    case 'decode': return 'Decode ATC';
    case 'compose': return 'Readback Builder';
    case 'atcMix': return 'ATC Mix';
    case 'cleared': return 'Cleared Direct';
    case 'intercept': return 'Radar Intercepts';
    case 'conflict': return 'Conflict Spot';
    case 'sequence': return 'Sequencing';
  }
}

export function atcModeDescription(mode: AtcMode | AtcQuestionMode): string {
  switch (mode) {
    case 'callsign': return 'Pick the radio callsign each airline uses on frequency.';
    case 'decode': return 'Pick the correct interpretation of an ATC phrase or instruction.';
    case 'compose': return 'Tap chips in order to build the correct readback. Some are decoys.';
    case 'atcMix': return 'Mixed callsign, decode, and readback-builder questions.';
    case 'cleared': return 'ATC clears you direct to a fix on the map. Pick the heading.';
    case 'intercept': return 'Judgment calls on ILS approaches: high, fast, crosswind, tailwind.';
    case 'conflict': return 'Read the scope. Tap the two aircraft on a collision course.';
    case 'sequence': return 'Tap inbounds in landing order. Read the scope.';
  }
}

export function atcPromptLabel(mode: AtcQuestionMode): string {
  switch (mode) {
    case 'callsign': return 'Airline';
    case 'decode': return 'What does this mean?';
    case 'compose': return 'Build the pilot\'s readback';
  }
}

export function atcBestKey(mode: AtcMode, difficulty: Difficulty): string {
  return `best:atc:${mode}:${difficulty}`;
}

export function loadAtcBest(mode: AtcMode, difficulty: Difficulty): number {
  // Legacy migration: pre-split combined 'radar' mode score → 'conflict'.
  if (mode === 'conflict' && typeof localStorage !== 'undefined') {
    const newKey = atcBestKey(mode, difficulty);
    if (localStorage.getItem(newKey) === null) {
      const legacy = localStorage.getItem(`best:atc:radar:${difficulty}`);
      if (legacy !== null) localStorage.setItem(newKey, legacy);
    }
  }
  return Number(localStorage.getItem(atcBestKey(mode, difficulty)) ?? 0);
}

export function saveAtcBest(mode: AtcMode, difficulty: Difficulty, score: number): boolean {
  const prev = loadAtcBest(mode, difficulty);
  if (score > prev) {
    localStorage.setItem(atcBestKey(mode, difficulty), String(score));
    return true;
  }
  return false;
}
