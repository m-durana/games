import atcData from '../data/atc.json';
import type { Difficulty } from './types';
import { airlineMeta, airlines } from './engine';

export type AtcMode = 'callsign' | 'phraseology' | 'readback' | 'atcMix';
type AtcQuestionMode = Exclude<AtcMode, 'atcMix'>;
type AtcTier = Difficulty;

export interface AtcQuestion {
  mode: AtcQuestionMode;
  prompt: string;
  answer: string;
  options: string[];
  explanation: string;
  tier: AtcTier;
  airlineIata?: string;
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
}

interface AtcData {
  phraseology: AtcDatum[];
  readback: AtcDatum[];
}

const data = atcData as AtcData;
export const ATC_ROUND_LENGTH = 10;

type Rng = () => number;

const EASY_CALLSIGNS = new Set([
  'AA', 'AC', 'AF', 'AS', 'BA', 'B6', 'CX', 'DL', 'EK', 'EI', 'JL', 'KL',
  'LH', 'NH', 'QR', 'QF', 'SQ', 'TK', 'UA', 'WN',
]);

const MEDIUM_CALLSIGNS = new Set([
  ...EASY_CALLSIGNS,
  'A3', 'AY', 'AZ', 'ET', 'EY', 'FR', 'HA', 'IB', 'KE', 'LA', 'LX', 'OS',
  'SK', 'TP', 'U2', 'VY', 'WS',
]);

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

function tierAllowed(itemTier: AtcTier, difficulty: Difficulty): boolean {
  if (difficulty === 'easy') return itemTier === 'easy';
  if (difficulty === 'medium') return itemTier === 'easy' || itemTier === 'medium';
  return true;
}

function callsignPool(difficulty: Difficulty) {
  return airlines
    .map((airline) => ({ airline, meta: airlineMeta(airline.iata) }))
    .filter((entry) => {
      if (!entry.meta.callsign) return false;
      if (difficulty === 'easy') return EASY_CALLSIGNS.has(entry.airline.iata);
      if (difficulty === 'medium') return MEDIUM_CALLSIGNS.has(entry.airline.iata);
      return true;
    });
}

function buildCallsignQuestion(difficulty: Difficulty, rng: Rng): AtcQuestion {
  const pool = callsignPool(difficulty);
  const entry = pick(pool, rng);
  const answer = entry.airline.name;
  const sameCountry = pool.filter((x) => x.airline.iata !== entry.airline.iata && x.airline.country === entry.airline.country);
  const sameAlliance = pool.filter(
    (x) => x.airline.iata !== entry.airline.iata && x.airline.alliance && x.airline.alliance === entry.airline.alliance,
  );
  const ranked = difficulty === 'hard'
    ? [...shuffle(sameCountry, rng), ...shuffle(sameAlliance, rng), ...shuffle(pool, rng)]
    : [...shuffle(pool, rng)];
  const distractors: string[] = [];
  for (const candidate of ranked) {
    if (candidate.airline.iata === entry.airline.iata) continue;
    if (distractors.includes(candidate.airline.name)) continue;
    distractors.push(candidate.airline.name);
    if (distractors.length === 3) break;
  }
  return {
    mode: 'callsign',
    prompt: `Which airline uses the radio callsign "${entry.meta.callsign}"?`,
    answer,
    options: shuffle([answer, ...distractors], rng),
    explanation: `${entry.airline.name} uses ICAO ${entry.meta.icao ?? entry.airline.iata} and the radio callsign ${entry.meta.callsign}.`,
    tier: difficulty,
    airlineIata: entry.airline.iata,
  };
}

function distractorsForDatum(answer: string, source: AtcDatum[], rng: Rng): string[] {
  return shuffle(source.map((x) => x.answer).filter((x) => x !== answer), rng).slice(0, 3);
}

function buildDatumQuestion(mode: 'phraseology' | 'readback', difficulty: Difficulty, rng: Rng): AtcQuestion {
  const source = data[mode].filter((item) => tierAllowed(item.tier, difficulty));
  const item = pick(source, rng);
  const distractors = distractorsForDatum(item.answer, data[mode], rng);
  return {
    mode,
    prompt: item.prompt,
    answer: item.answer,
    options: shuffle([item.answer, ...distractors], rng),
    explanation: item.explanation,
    tier: item.tier,
  };
}

function buildSingleQuestion(mode: AtcQuestionMode, difficulty: Difficulty, rng: Rng): AtcQuestion {
  if (mode === 'callsign') return buildCallsignQuestion(difficulty, rng);
  return buildDatumQuestion(mode, difficulty, rng);
}

export function buildAtcRound(mode: AtcMode, difficulty: Difficulty, rng: Rng = defaultRng()): AtcQuestion[] {
  const modes: AtcQuestionMode[] = mode === 'atcMix'
    ? ['callsign', 'phraseology', 'readback']
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
    case 'phraseology': return 'ATC Phraseology';
    case 'readback': return 'Readback';
    case 'atcMix': return 'ATC Mix';
  }
}

export function atcModeDescription(mode: AtcMode | AtcQuestionMode): string {
  switch (mode) {
    case 'callsign': return 'Match radio callsigns to airlines.';
    case 'phraseology': return 'Decode common ATC phrases.';
    case 'readback': return 'Interpret short ATC instructions.';
    case 'atcMix': return 'Mixed callsigns, phrases, and readback questions.';
  }
}

export function atcPromptLabel(mode: AtcQuestionMode): string {
  switch (mode) {
    case 'callsign': return 'Radio callsign';
    case 'phraseology': return 'What does this mean?';
    case 'readback': return 'What is the correct interpretation?';
  }
}

export function atcBestKey(mode: AtcMode, difficulty: Difficulty): string {
  return `best:atc:${mode}:${difficulty}`;
}

export function loadAtcBest(mode: AtcMode, difficulty: Difficulty): number {
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
