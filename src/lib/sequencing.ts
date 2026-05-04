// Sequencing: approach controller orders 3-4 inbounds onto the same runway.
// The player taps blips on the scope in landing order; no strip arithmetic is
// shown. Ground-truth ETA is computed internally to score the answer; nothing
// about distance/speed/ETA is exposed in the UI until the post-answer recap.
// See docs/tier1-radar-modes.md.

import type { Aircraft, Scenario } from 'radarscope';
import { airportsByType, geoToScope, type RealAirport, type RealRunway } from 'radarscope/data';
import type { Difficulty } from './types';
import { airlines, airlineMeta } from './engine';
import { airportRunwaysToScope } from './scope-runways';

export const SEQUENCE_ROUND_LENGTH = 10;
const DEG2RAD = Math.PI / 180;

export interface SequenceQuestion {
  mode: 'sequence';
  prompt: string;
  /** Inline reminder shown to easy/medium players. */
  instruments?: string;
  /** Aircraft IDs sorted by ETA, leader first - the correct landing order. */
  correctOrder: string[];
  /** Plain-English correct answer (used in recap). */
  answer: string;
  explanation: string;
  scenario: SequenceScenario;
  /** Easy mode: live-outline the correct blip the moment the player picks. */
  showAnswerHint: boolean;
  /** Default speed-vector minutes shown on the scope. Player can still toggle. */
  defaultVectorMin: number;
}

export interface SequenceScenario extends Scenario {
  airportName: string;
  airportIata: string;
  airportIcao: string;
}

export interface SequenceRoundResult {
  question: SequenceQuestion;
  /** Picked landing order, formatted "AFR123 → DLH456 → BAW789". */
  picked: string;
  correct: boolean;
}

type Rng = () => number;
const defaultRng = (): Rng => Math.random;
function pick<T>(arr: T[], rng: Rng): T { return arr[Math.floor(rng() * arr.length)]; }

let cachedAirportPool: RealAirport[] | null = null;
function airportPool(): RealAirport[] {
  if (cachedAirportPool) return cachedAirportPool;
  const all = airportsByType('large_airport');
  cachedAirportPool = all.filter((ap) =>
    ap.runways.some(
      (rw) =>
        rw.lengthFt >= 7000 &&
        /^(asp|con|bit|pem|paved|portland|cement)/i.test(rw.surface ?? ''),
    ),
  );
  return cachedAirportPool;
}

function longestPavedRunway(ap: RealAirport): RealRunway {
  const paved = ap.runways.filter((rw) => /^(asp|con|bit|pem|paved|portland|cement)/i.test(rw.surface ?? ''));
  return paved.reduce((best, rw) => (rw.lengthFt > best.lengthFt ? rw : best), paved[0]);
}

let cachedCallsignPool: { word: string }[] | null = null;
function callsignPool() {
  if (cachedCallsignPool) return cachedCallsignPool;
  const out: { word: string }[] = [];
  for (const a of airlines) {
    const m = airlineMeta(a.iata);
    if (!m.callsign) continue;
    out.push({ word: m.callsign });
  }
  cachedCallsignPool = out;
  return out;
}

function genCallsign(rng: Rng): string {
  const spec = pick(callsignPool(), rng);
  const num = 100 + Math.floor(rng() * 900);
  return `${spec.word}${num}`;
}

function fmtEta(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

interface BuildOpts { difficulty: Difficulty; rng: Rng; }

export function buildSequenceQuestion({ difficulty, rng }: BuildOpts): SequenceQuestion {
  const airport = pick(airportPool(), rng);
  const runway = longestPavedRunway(airport);
  const finalCourse = runway.he.headingDegT;
  const threshold = geoToScope({ lat: airport.lat, lon: airport.lon }, { lat: runway.he.lat, lon: runway.he.lon });
  const rangeNm = 40;

  const count = difficulty === 'hard' ? 4 : 3;
  // Difficulty is purely a scenario knob: ETA spacing + speed spread.
  const etaGapSec = difficulty === 'easy' ? 45 + rng() * 30
    : difficulty === 'medium' ? 25 + rng() * 18
    : 18 + rng() * 12;
  // Speed range tightens on Hard so the scope-read isn't dominated by wild
  // closure-rate arithmetic. Difficulty comes from count + ETA gap.
  const speedRange = difficulty === 'easy' ? { min: 200, span: 30 }
    : difficulty === 'medium' ? { min: 190, span: 60 }
    : { min: 180, span: 80 };

  const baseEta = 180 + Math.floor(rng() * 80);
  const targetEtas = Array.from({ length: count }, (_, i) => baseEta + i * etaGapSec);

  // Place each aircraft at its target ETA, on different bearings around the
  // FAF so the scope reads as a real arrival push (not a parade on final).
  // Spread bearings ±60° from the reciprocal final course (i.e. the side
  // aircraft are arriving from), so they all converge toward the FAF.
  const aircraftList: Aircraft[] = [];
  const idEtas: { id: string; etaSec: number; callsign: string; distanceNm: number; speedKt: number }[] = [];
  const baseBearing = (finalCourse + 180) % 360;
  for (let i = 0; i < count; i++) {
    const speed = speedRange.min + Math.floor(rng() * speedRange.span);
    const distNm = (speed * targetEtas[i]) / 3600;
    const offsetDeg = (rng() - 0.5) * 120;
    const bearing = (baseBearing + offsetDeg + 360) % 360;
    const r = bearing * DEG2RAD;
    const pos = {
      x: threshold.x + Math.sin(r) * distNm,
      y: threshold.y - Math.cos(r) * distNm,
    };
    const towardThresholdDeg = (Math.atan2(threshold.x - pos.x, -(threshold.y - pos.y)) * 180 / Math.PI + 360) % 360;
    const callsign = genCallsign(rng);
    const id = `ac-${i}`;
    aircraftList.push({
      id,
      callsign,
      pos,
      heading: towardThresholdDeg,
      altitude: 5000 + i * 1000 + Math.floor(rng() * 500),
      speed,
    });
    idEtas.push({ id, etaSec: targetEtas[i], callsign, distanceNm: distNm, speedKt: speed });
  }

  const sortedByEta = [...idEtas].sort((a, b) => a.etaSec - b.etaSec);
  const correctOrder = sortedByEta.map((s) => s.id);
  const orderedCallsigns = sortedByEta.map((s) => s.callsign);
  const answer = orderedCallsigns.join(' → ');

  const showInstruments = difficulty !== 'hard';
  const instruments = showInstruments
    ? `Sequence ${count} inbounds for ${runway.he.ident || 'the runway'} by landing order. Tap blips on the scope.`
    : undefined;

  // Recap shows the math; the round itself does not. This is coaching after
  // the fact, not part of the puzzle.
  const explanation = `Earliest to cross the threshold lands first. Order: ${sortedByEta
    .map((s) => `${s.callsign} (${s.distanceNm.toFixed(1)} nm @ ${s.speedKt} kt → ETA ${fmtEta(s.etaSec)})`)
    .join(', ')}.`;

  // Hard keeps a 1-min vector — turning vectors fully off was the same kind of
  // anti-pattern the strip-arithmetic fix was trying to avoid (hide the data
  // and force mental math). 1-min vectors give just enough projection to read.
  const defaultVectorMin = difficulty === 'easy' ? 2 : 1;

  const scenario: SequenceScenario = {
    airportName: airport.name,
    airportIata: airport.iata || airport.icao,
    airportIcao: airport.icao,
    aircraft: aircraftList,
    runways: airportRunwaysToScope(airport, runway),
    rangeNm,
  };

  return {
    mode: 'sequence',
    prompt: 'Tap the inbounds in landing order.',
    instruments,
    correctOrder,
    answer,
    explanation,
    scenario,
    showAnswerHint: difficulty === 'easy',
    defaultVectorMin,
  };
}

export function buildSequenceRound(difficulty: Difficulty, rng: Rng = defaultRng()): SequenceQuestion[] {
  return Array.from({ length: SEQUENCE_ROUND_LENGTH }, () => buildSequenceQuestion({ difficulty, rng }));
}
