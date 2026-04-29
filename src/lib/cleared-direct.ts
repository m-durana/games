// Cleared Direct: ATC clears the player aircraft direct to a named fix. The
// scope shows the aircraft + the target fix (highlighted) on a real-airport
// chart. The player's job is to read the radar — eyeball the bearing — and
// pick the right heading from four options. Real navigation skill, not
// label-matching.

import type { Aircraft, Scenario, Waypoint } from 'radarscope';
import { airportsByType, type RealAirport } from 'radarscope/data';
import type { Difficulty } from './types';
import { airlines, airlineMeta } from './engine';
import { airportRunwaysToScope } from './scope-runways';

export const CLEARED_ROUND_LENGTH = 10;

export interface ClearedQuestion {
  /** For AtcResults compatibility — always 'cleared'. */
  mode: 'cleared';
  prompt: string;
  /** Human-readable correct answer (e.g. "Heading 075"). */
  answer: string;
  explanation: string;
  scenario: ClearedScenario;
  /** The four heading options (in degrees, 0..359). */
  options: number[];
  /** Index of the correct option in `options`. */
  correctIndex: number;
}

export interface ClearedScenario extends Scenario {
  airportName: string;
  airportIata: string;
  airportIcao: string;
  /** Visible fixes — at minimum, the target. */
  waypoints: Waypoint[];
  /** ID of the highlighted target waypoint. */
  targetWaypointId: string;
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

// ---- Real-airport pool -------------------------------------------------------

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

// ---- Pronounceable 5-letter ICAO-style fix names ----------------------------

const PREFIXES = ['PAK', 'BRA', 'TAN', 'KEL', 'LOR', 'MIK', 'NOR', 'VEK', 'BIR', 'DOL', 'ZIR', 'GAM', 'HEK', 'JAR', 'POR', 'SAN', 'WIM', 'CAR'];
const SUFFIXES = ['AR', 'EN', 'IS', 'OL', 'UM', 'IK', 'AT', 'OR'];

function fixName(rng: Rng): string {
  return (pick(PREFIXES, rng) + pick(SUFFIXES, rng)).slice(0, 5).toUpperCase();
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

function roundTo10(deg: number): number {
  const r = Math.round(deg / 10) * 10;
  return ((r % 360) + 360) % 360;
}

function fmtHeading(deg: number): string {
  return deg.toString().padStart(3, '0');
}

// ---- Question builder --------------------------------------------------------
// Mechanic: the radar shows the player aircraft + the target fix (highlighted).
// Optional decoy fixes are drawn unlabeled as plain diamonds so the player
// can't read the answer off the labels — they have to look at where the
// target fix is and mentally estimate the bearing. Four heading buttons; pick
// the closest. Difficulty narrows the decoy spread.

function buildClearedQuestion(difficulty: Difficulty, rng: Rng): ClearedQuestion {
  const airport = pick(airportPool(), rng);
  const rangeNm = 25;

  // Aircraft position — somewhere mid-scope, heading inbound-ish.
  const acBearing = rng() * 360;
  const acDist = 14 + rng() * 6; // 14..20 nm from center
  const ar = acBearing * DEG2RAD;
  const acPos = { x: Math.sin(ar) * acDist, y: -Math.cos(ar) * acDist };
  const acHeading = Math.floor(rng() * 360);
  const tas = 280 + Math.floor(rng() * 80);

  // Target fix — placed somewhere with a clean readable bearing from the
  // aircraft. Distance 8..18 nm from the aircraft so it's clearly visible.
  let targetPos: { x: number; y: number };
  let safety = 0;
  do {
    const tb = rng() * 360;
    const td = 8 + rng() * 10;
    const tr = tb * DEG2RAD;
    targetPos = { x: acPos.x + Math.sin(tr) * td, y: acPos.y - Math.cos(tr) * td };
    safety++;
  } while (
    safety < 30 &&
    (Math.hypot(targetPos.x, targetPos.y) > rangeNm - 2 ||
      Math.hypot(targetPos.x, targetPos.y) < 4)
  );

  const targetName = fixName(rng);
  const target: Waypoint = { id: 'wp-target', label: targetName, pos: targetPos };
  const waypoints: Waypoint[] = [target];

  // A few unlabeled decoy fixes so the chart doesn't feel empty. They have
  // generic labels (·) so the player can't pattern-match a name.
  const decoyCount = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;
  for (let i = 0; i < decoyCount; i++) {
    let p: { x: number; y: number };
    let s = 0;
    do {
      const b = rng() * 360;
      const d = 8 + rng() * 14;
      const r = b * DEG2RAD;
      p = { x: Math.sin(r) * d, y: -Math.cos(r) * d };
      s++;
    } while (
      s < 20 &&
      (Math.hypot(p.x - targetPos.x, p.y - targetPos.y) < 5 ||
        Math.hypot(p.x - acPos.x, p.y - acPos.y) < 5)
    );
    waypoints.push({ id: `wp-d${i}`, label: '·', pos: p });
  }

  const callsign = genCallsign(rng);
  const aircraft: Aircraft = {
    id: 'ac-self',
    callsign,
    pos: acPos,
    heading: acHeading,
    altitude: 10000 + Math.floor(rng() * 8) * 1000,
    speed: tas,
  };

  // Correct heading: bearing from aircraft to target, rounded to nearest 10°.
  const correctHeading = roundTo10(bearingFromTo(acPos, targetPos));

  // Decoy headings: spread depends on difficulty. Always avoid duplicates.
  const offsets =
    difficulty === 'easy'
      ? [40, -40, 80]
      : difficulty === 'medium'
        ? [25, -25, 50]
        : [15, -15, 30];
  const headings = new Set<number>([correctHeading]);
  const options: number[] = [correctHeading];
  for (const off of offsets) {
    const h = roundTo10((correctHeading + off + 360) % 360);
    if (headings.has(h)) {
      // shift by +10 to avoid duplicate
      const alt = roundTo10((h + 10) % 360);
      if (!headings.has(alt)) {
        headings.add(alt);
        options.push(alt);
      }
    } else {
      headings.add(h);
      options.push(h);
    }
  }

  // Shuffle so correct isn't always option 1.
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  const correctIndex = options.indexOf(correctHeading);

  const scenario: ClearedScenario = {
    airportName: airport.name,
    airportIata: airport.iata || airport.icao,
    airportIcao: airport.icao,
    aircraft: [aircraft],
    runways: airportRunwaysToScope(airport),
    waypoints,
    targetWaypointId: target.id,
    rangeNm,
  };

  return {
    mode: 'cleared',
    prompt: `${callsign}, near ${scenario.airportIata}: cleared direct ${targetName}. What heading?`,
    answer: `Heading ${fmtHeading(correctHeading)}`,
    explanation: `${targetName} is bearing ${fmtHeading(correctHeading)}° from your position. Eyeball it on the scope: 0° = north (up), 090° = east (right), 180° = south, 270° = west.`,
    scenario,
    options,
    correctIndex,
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
