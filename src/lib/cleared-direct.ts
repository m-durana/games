// Cleared Direct: top-down map mode powered by `radarscope`. Each round shows
// a real airport at center plus a flight plan through 4–6 procedurally-named
// waypoints. ATC says "Cleared direct X" and the player picks the heading that
// points at X — at hard difficulty, the right answer is wind-corrected.

import type { Aircraft, Runway, Scenario, Waypoint } from 'radarscope';
import { airportsByType, geoToScope, type RealAirport, type RealRunway } from 'radarscope/data';
import type { Difficulty } from './types';
import { airlines, airlineMeta } from './engine';
import { airportRunwaysToScope } from './scope-runways';

export const CLEARED_ROUND_LENGTH = 10;

export interface ClearedQuestion {
  /** For AtcResults compatibility — always 'cleared'. */
  mode: 'cleared';
  prompt: string;
  /** Human-readable correct answer (the cleared waypoint name). */
  answer: string;
  explanation: string;
  scenario: ClearedScenario;
  /** Waypoint id the player was cleared direct to. */
  targetWaypointId: string;
}

export interface ClearedScenario extends Scenario {
  airportName: string;
  airportIata: string;
  airportIcao: string;
  /** All visible fixes — the target plus phonetically-similar decoys. */
  waypoints: Waypoint[];
  /** Every runway at the airport (so the chart shows the airport authentically). */
  allRunways: Runway[];
}

export interface ClearedRoundResult {
  question: ClearedQuestion;
  picked: string;
  correct: boolean;
}

type Rng = () => number;

function defaultRng(): Rng {
  return Math.random;
}

function pick<T>(arr: T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ---- Real-airport pool (shared filter with ATC Radar) ------------------------

let cachedAirportPool: RealAirport[] | null = null;

function airportPool(): RealAirport[] {
  if (cachedAirportPool) return cachedAirportPool;
  cachedAirportPool = airportsByType('large_airport').filter((ap) =>
    ap.runways.some(
      (rw) => rw.lengthFt >= 7000 && /^(asp|con|bit|pem|paved|portland|cement)/i.test(rw.surface ?? ''),
    ),
  );
  return cachedAirportPool;
}

function longestPavedRunway(ap: RealAirport): RealRunway {
  const paved = ap.runways.filter((rw) => /^(asp|con|bit|pem|paved|portland|cement)/i.test(rw.surface ?? ''));
  return paved.reduce((best, rw) => (rw.lengthFt > best.lengthFt ? rw : best), paved[0]);
}

// ---- Procedural waypoint names (phonetically-similar siblings) --------------

// Real ICAO fixes are 5-letter pronounceable names. To make picking the right
// one a real test of careful reading, we generate a base prefix and create
// SIBLINGS with phonetically-similar suffixes. Difficulty controls similarity.
const BASE_PREFIXES = [
  'PAK', 'BRA', 'TAN', 'KEL', 'LOR', 'MIK', 'NOR', 'VEK', 'BIR', 'DOL', 'ZIR', 'GAM', 'HEK', 'JAR', 'POR',
];

const SIB_EASY_SUFFIXES = ['AR', 'EN', 'IS', 'OL', 'UM', 'IK', 'AT'];
const SIB_HARD_SUFFIXES = ['AR', 'EN', 'IM', 'OL', 'UR', 'AN'];

function siblingNames(count: number, similar: boolean, rng: Rng): string[] {
  const prefix = pick(BASE_PREFIXES, rng);
  const suffixPool = similar ? SIB_HARD_SUFFIXES : SIB_EASY_SUFFIXES;
  const used = new Set<string>();
  const out: string[] = [];
  let safety = 0;
  while (out.length < count && safety < 200) {
    safety++;
    const sfx = pick(suffixPool, rng);
    const name = (prefix + sfx).slice(0, 5).toUpperCase();
    if (used.has(name)) continue;
    used.add(name);
    out.push(name);
  }
  return out;
}

// ---- Realistic callsigns -----------------------------------------------------

let cachedCallsignPool: { word: string }[] | null = null;
function callsignPool(): { word: string }[] {
  if (cachedCallsignPool) return cachedCallsignPool;
  const out: { word: string }[] = [];
  for (const a of airlines) {
    const m = airlineMeta(a.iata);
    if (m.callsign) out.push({ word: m.callsign });
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

const DEG2RAD = Math.PI / 180;

function bearingFromTo(from: { x: number; y: number }, to: { x: number; y: number }): number {
  const dx = to.x - from.x;
  const dy = -(to.y - from.y);
  let deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

// ---- Question builder --------------------------------------------------------
// Mechanic: ATC clears the player direct to a named fix. The chart shows 4-5
// phonetically-similar fixes (PAKAR, PAKEN, PAKIM, …). Player CLICKS the
// correct fix on the map. Easy = looser-similar names, Hard = very similar.

function buildClearedQuestion(difficulty: Difficulty, rng: Rng): ClearedQuestion {
  const airport = pick(airportPool(), rng);
  const runway = longestPavedRunway(airport);
  const center = { lat: airport.lat, lon: airport.lon };
  const threshold = geoToScope(center, runway.he);

  const wpCount = difficulty === 'easy' ? 4 : difficulty === 'medium' ? 5 : 5;
  const similarNames = difficulty !== 'easy';
  const rangeNm = 25;
  const names = siblingNames(wpCount, similarNames, rng);

  // Place waypoints around the airport at varying bearings/distances. Spread
  // bearings so labels don't overlap.
  const waypoints: Waypoint[] = [];
  const baseBearing = rng() * 360;
  const bearingStep = 360 / wpCount;
  for (let i = 0; i < wpCount; i++) {
    const bearing = (baseBearing + i * bearingStep + (rng() - 0.5) * (bearingStep * 0.4)) % 360;
    const distNm = 12 + rng() * 9; // 12..21 nm — well inside the 25 nm scope
    const r = bearing * DEG2RAD;
    waypoints.push({
      id: `wp-${i}`,
      label: names[i],
      pos: { x: Math.sin(r) * distNm, y: -Math.cos(r) * distNm },
    });
  }

  // Player aircraft positioned outside the fix ring, heading inbound.
  const acBearing = (baseBearing + 180 + (rng() - 0.5) * 60) % 360;
  const r = acBearing * DEG2RAD;
  const acDist = 22;
  const acPos = { x: Math.sin(r) * acDist, y: -Math.cos(r) * acDist };
  // Aircraft heading: roughly toward the airport center.
  const acHeading = bearingFromTo(acPos, { x: 0, y: 0 });
  const tas = 320 + Math.floor(rng() * 60);

  const target = pick(waypoints, rng);

  const callsign = genCallsign(rng);
  const aircraft: Aircraft = {
    id: 'ac-self',
    callsign,
    pos: acPos,
    heading: acHeading,
    altitude: 12000 + Math.floor(rng() * 8) * 1000,
    speed: tas,
  };

  const scenario: ClearedScenario = {
    airportName: airport.name,
    airportIata: airport.iata || airport.icao,
    airportIcao: airport.icao,
    aircraft: [aircraft],
    runway: {
      threshold,
      heading: runway.he.headingDegT,
      lengthNm: runway.lengthFt / 6076.12,
    },
    allRunways: airportRunwaysToScope(airport),
    waypoints,
    rangeNm,
  };

  const otherNames = waypoints.filter((w) => w.id !== target.id).map((w) => w.label).join(', ');
  return {
    mode: 'cleared',
    prompt: `${callsign}, near ${scenario.airportIata}: cleared direct ${target.label}.`,
    answer: target.label,
    explanation: `Tap ${target.label} on the chart. Decoys: ${otherNames}. Read the names carefully — they're designed to look alike.`,
    scenario,
    targetWaypointId: target.id,
  };
}

// ---- Round builder -----------------------------------------------------------

export function buildClearedRound(difficulty: Difficulty, rng: Rng = defaultRng()): ClearedQuestion[] {
  const out: ClearedQuestion[] = [];
  for (let i = 0; i < CLEARED_ROUND_LENGTH; i++) {
    out.push(buildClearedQuestion(difficulty, rng));
  }
  return out;
}
