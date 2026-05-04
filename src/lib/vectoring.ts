// Vectoring: approach-controller mode where the player picks a heading change
// for the trailing aircraft on final to open spacing to the legal minimum.
// See docs/tier1-radar-modes.md for the design + difficulty philosophy.

import type { Aircraft, Scenario } from 'radarscope';
import { airportsByType, geoToScope, type RealAirport, type RealRunway } from 'radarscope/data';
import type { Difficulty } from './types';
import { airlines, airlineMeta } from './engine';
import { airportRunwaysToScope } from './scope-runways';

export const VECTOR_ROUND_LENGTH = 10;
const SEPARATION_MIN_NM = 3.0;
const VECTOR_DURATION_MIN = 3.0;
const DEG2RAD = Math.PI / 180;

export interface VectorOption {
  /** Display label, e.g. "Left 20°" or "No change". */
  label: string;
  /** Signed degrees off the current track. Positive = right, negative = left, 0 = no change. */
  deltaDeg: number;
  /** Resulting spacing at threshold (nm) given the heading change. */
  resultingNm: number;
  /** True if the resulting spacing meets the separation minimum AND the new track
   *  doesn't blunder through any other inbound. */
  legal: boolean;
}

export interface VectorQuestion {
  mode: 'vector';
  prompt: string;
  /** ATC clearance / context spoken on the radio. Rendered as a speech bubble. */
  atcCall: string;
  /** Inline reference info shown to easy/medium players. */
  instruments?: string;
  answer: string;
  explanation: string;
  scenario: VectorScenario;
  options: VectorOption[];
  correctIndex: number;
  /** Easy mode: outline the correct option in green to remove all jargon load. */
  showAnswerHint: boolean;
}

export interface VectorScenario extends Scenario {
  airportName: string;
  airportIata: string;
  airportIcao: string;
  /** Aircraft IDs sorted by distance to threshold, leader first. */
  inboundOrder: string[];
  /** ID of the trailer (the player's lever). Highlighted in the round UI. */
  trailerId: string;
}

export interface VectorRoundResult {
  question: VectorQuestion;
  picked: string;
  correct: boolean;
}

type Rng = () => number;
const defaultRng: () => Rng = () => Math.random;
function pick<T>(arr: T[], rng: Rng): T { return arr[Math.floor(rng() * arr.length)]; }

function pickWeighted<T>(arr: T[], weights: number[], rng: Rng): number {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return arr.length - 1;
}

// ---- Airport pool (mirrors atc-radar's choices) ------------------------------

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

// ---- Callsigns ---------------------------------------------------------------

let cachedCallsignPool: { word: string; iata: string }[] | null = null;
function callsignPool() {
  if (cachedCallsignPool) return cachedCallsignPool;
  const out: { word: string; iata: string }[] = [];
  for (const a of airlines) {
    const m = airlineMeta(a.iata);
    if (!m.callsign) continue;
    out.push({ word: m.callsign, iata: a.iata });
  }
  cachedCallsignPool = out;
  return out;
}

function genCallsign(rng: Rng): string {
  const spec = pick(callsignPool(), rng);
  const num = 100 + Math.floor(rng() * 900);
  return `${spec.word}${num}`;
}

// ---- Geometry ----------------------------------------------------------------

/** Position N nm along the final approach track from the threshold, on the
 *  inbound side (i.e. opposite the runway heading). */
function posOnFinal(threshold: { x: number; y: number }, finalCourseDeg: number, distanceNm: number) {
  // Aircraft on final fly heading = finalCourse. They are positioned distanceNm
  // BEHIND the threshold (i.e. in the reciprocal direction).
  const r = (finalCourseDeg + 180) * DEG2RAD;
  return {
    x: threshold.x + Math.sin(r) * distanceNm,
    y: threshold.y - Math.cos(r) * distanceNm,
  };
}

/** Extra path length when a trailer flies `deltaDeg` off-course for `durationMin`
 *  at `speedKt`, then turns back. The total path is speed × t, the along-track
 *  progress is speed × t × cos(delta) - so the lost spacing recovered is the
 *  difference. (Pre-turn-back; we approximate the turn-back as instantaneous.) */
function vectorAddedNm(speedKt: number, deltaDeg: number, durationMin: number): number {
  const total = speedKt * (durationMin / 60);
  const along = total * Math.cos(deltaDeg * DEG2RAD);
  return total - along;
}

// ---- Scenario builder --------------------------------------------------------

function fmtHeading(deg: number): string {
  const n = ((Math.round(deg) % 360) + 360) % 360;
  return n.toString().padStart(3, '0');
}

function runwayLabel(runway: RealRunway): string {
  // RealRunway has .he and .le; .he is what we used for finalCourse.
  const ident = runway.he.ident || `${Math.round(runway.he.headingDegT / 10).toString().padStart(2, '0')}`;
  return ident;
}

interface BuildOpts {
  difficulty: Difficulty;
  rng: Rng;
}

export function buildVectorQuestion({ difficulty, rng }: BuildOpts): VectorQuestion {
  const airport = pick(airportPool(), rng);
  const runway = longestPavedRunway(airport);
  const finalCourse = runway.he.headingDegT;
  const threshold = geoToScope({ lat: airport.lat, lon: airport.lon }, { lat: runway.he.lat, lon: runway.he.lon });
  const rangeNm = 30;

  // Speeds: leader 170-200, trailer 5-25 kt faster (so it's closing).
  const leaderSpeed = 170 + Math.floor(rng() * 31);
  const trailerSpeed = leaderSpeed + 5 + Math.floor(rng() * 21);

  // Place leader 4-7 nm from threshold.
  const leaderDist = 4 + rng() * 3;
  const timeToTouchdownHr = leaderDist / leaderSpeed;
  const closureRateKt = trailerSpeed - leaderSpeed;

  // Pick which deflection should be the correct answer FIRST, then size the
  // initial gap so that's the smallest sufficient option. This prevents the
  // "always 30°" pattern that emerged when initial gaps were chosen blindly.
  // 'No change' shows up rarely — most of the time the spacing genuinely
  // needs an action.
  const angles = [0, 10, 20, 30];
  const targetIdx = pickWeighted([0, 10, 20, 30], [1, 3, 4, 3], rng); // index, not angle
  const targetAngle = angles[targetIdx];
  // We want: projectedGap + addedNm(targetAngle) >= 3.0
  //      AND projectedGap + addedNm(prevAngle) <  3.0   (for targetIdx > 0)
  const targetAdded = vectorAddedNm(trailerSpeed, targetAngle, VECTOR_DURATION_MIN);
  const prevAdded = targetIdx > 0 ? vectorAddedNm(trailerSpeed, angles[targetIdx - 1], VECTOR_DURATION_MIN) : -Infinity;
  const minProjected = SEPARATION_MIN_NM - targetAdded + 0.05;
  const maxProjected = targetIdx > 0 ? SEPARATION_MIN_NM - prevAdded - 0.05 : SEPARATION_MIN_NM + 0.5;
  const projectedGapNoChange = minProjected + rng() * Math.max(0.1, maxProjected - minProjected);
  const initialGap = projectedGapNoChange + closureRateKt * timeToTouchdownHr;
  const trailerDist = leaderDist + initialGap;

  // Candidate options (left-side conventional, but randomize side per question).
  const sideSign = rng() < 0.5 ? -1 : 1;
  const sideWord = sideSign < 0 ? 'Left' : 'Right';
  const options: VectorOption[] = angles.map((a) => {
    const added = vectorAddedNm(trailerSpeed, a, VECTOR_DURATION_MIN);
    const result = projectedGapNoChange + added;
    return {
      label: a === 0 ? 'No change' : `${sideWord} ${a}°`,
      deltaDeg: sideSign * a,
      resultingNm: result,
      legal: result >= SEPARATION_MIN_NM,
    };
  });

  let correctIndex = options.findIndex((o) => o.legal);
  if (correctIndex < 0) {
    correctIndex = options.length - 1;
    options[correctIndex].legal = true;
  }

  // ---- Build aircraft + scenario --------------------------------------------
  const leaderCS = genCallsign(rng);
  let trailerCS = genCallsign(rng);
  while (trailerCS === leaderCS) trailerCS = genCallsign(rng);

  const leaderPos = posOnFinal(threshold, finalCourse, leaderDist);
  const trailerPos = posOnFinal(threshold, finalCourse, trailerDist);

  const altLeader = 3000 + Math.floor(rng() * 8) * 500;
  const altTrailer = altLeader + 1000;

  const leaderAc: Aircraft = {
    id: 'ac-leader',
    callsign: leaderCS,
    pos: leaderPos,
    heading: finalCourse,
    altitude: altLeader,
    speed: leaderSpeed,
  };
  const trailerAc: Aircraft = {
    id: 'ac-trailer',
    callsign: trailerCS,
    pos: trailerPos,
    heading: finalCourse,
    altitude: altTrailer,
    speed: trailerSpeed,
  };
  const aircraftList: Aircraft[] = [leaderAc, trailerAc];

  // Hard mode: a third inbound on one side of the trailer that blocks one of
  // the vector directions, forcing the player to use the other side.
  if (difficulty === 'hard') {
    // Place 4-6 nm abeam the trailer on the opposite side from sideSign so the
    // player's "obvious" turn would conflict; correct answer must use the side
    // we already selected. This keeps the correctIndex computation valid.
    const blockSide = -sideSign;
    const acrossR = (finalCourse + 90 * blockSide) * DEG2RAD;
    const offset = 4 + rng() * 2;
    const blockerPos = {
      x: trailerPos.x + Math.sin(acrossR) * offset,
      y: trailerPos.y - Math.cos(acrossR) * offset,
    };
    const blockerCS = genCallsign(rng);
    const blockerAc: Aircraft = {
      id: 'ac-blocker',
      callsign: blockerCS,
      pos: blockerPos,
      heading: (finalCourse + 60 * sideSign + 360) % 360,
      altitude: altTrailer,
      speed: leaderSpeed + 10,
    };
    aircraftList.push(blockerAc);
  }

  const scenario: VectorScenario = {
    airportName: airport.name,
    airportIata: airport.iata || airport.icao,
    airportIcao: airport.icao,
    aircraft: aircraftList,
    runways: airportRunwaysToScope(airport, runway),
    rangeNm,
    inboundOrder: [leaderAc.id, trailerAc.id],
    trailerId: trailerAc.id,
  };

  const correct = options[correctIndex];
  const rwLabel = runwayLabel(runway);

  const atcCall = `${trailerCS}, follow ${leaderCS} to runway ${rwLabel}, ${SEPARATION_MIN_NM.toFixed(0)} nm in trail required.`;
  // Required separation is a constant; show it on every difficulty so the
  // mode tests "pick the right vector" not "remember the rule". Hard hides
  // the projected-gap number so the player has to read closure off the scope.
  const instruments = difficulty === 'hard'
    ? `${trailerCS} (trailer) is ${(trailerSpeed - leaderSpeed)} kt faster than ${leaderCS}. Need ≥ ${SEPARATION_MIN_NM.toFixed(0)} nm at the threshold.`
    : `${trailerCS} (trailer) is ${(trailerSpeed - leaderSpeed)} kt faster than ${leaderCS}. Projected spacing at the threshold: ${projectedGapNoChange.toFixed(1)} nm. Need ≥ ${SEPARATION_MIN_NM.toFixed(0)} nm.`;
  const answer = correct.label;
  const explanation = correct.deltaDeg === 0
    ? `Spacing is already legal (${projectedGapNoChange.toFixed(1)} nm at the threshold). No vector needed.`
    : `${sideWord} ${Math.abs(correct.deltaDeg)}° at ${trailerSpeed} kt for ${VECTOR_DURATION_MIN.toFixed(0)} min adds ${(correct.resultingNm - projectedGapNoChange).toFixed(1)} nm of path. Resulting spacing: ${correct.resultingNm.toFixed(1)} nm. Smaller deflections (${options.slice(0, correctIndex).map((o) => o.label).join(', ') || 'no change'}) wouldn't open enough.`;

  return {
    mode: 'vector',
    prompt: 'What heading change?',
    atcCall,
    instruments,
    answer,
    explanation,
    scenario,
    options,
    correctIndex,
    showAnswerHint: false,
  };
}

export function buildVectorRound(difficulty: Difficulty, rng: Rng = defaultRng()): VectorQuestion[] {
  const out: VectorQuestion[] = [];
  for (let i = 0; i < VECTOR_ROUND_LENGTH; i++) {
    out.push(buildVectorQuestion({ difficulty, rng }));
  }
  return out;
}
