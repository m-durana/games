// ATC Radar: top-down radar quiz mode powered by `radarscope`. Each round renders
// a procedurally-generated traffic snapshot at a real airport (from
// radarscope/data) and asks one of three question types: spot the conflict,
// sequence to final, or approve a direct request.

import type { Aircraft, Scenario } from 'radarscope';
import { findConflicts } from 'radarscope';
import { airportsByType, geoToScope, type RealAirport, type RealRunway } from 'radarscope/data';
import type { Difficulty } from './types';
import { airlines, airlineMeta } from './engine';
import { airportRunwaysToScope } from './scope-runways';

export const RADAR_ROUND_LENGTH = 10;

export type RadarKind = 'conflict' | 'direct';

interface RadarBaseQuestion {
  kind: RadarKind;
  /** For AtcResults compatibility — always 'radar'. */
  mode: 'radar';
  prompt: string;
  /** Human-readable correct-answer string (shown in the recap). */
  answer: string;
  explanation: string;
  scenario: RadarScenario;
}

export interface ConflictQuestion extends RadarBaseQuestion {
  kind: 'conflict';
  /** Aircraft IDs of the true conflict pair. */
  conflictPair: [string, string];
}

export interface DirectQuestion extends RadarBaseQuestion {
  kind: 'direct';
  /** Three button labels. */
  options: string[];
  /** Index of the correct option in `options`. */
  correctIndex: number;
}

export type RadarQuestion = ConflictQuestion | DirectQuestion;

export interface RadarScenario extends Scenario {
  airportName: string;
  airportIata: string;
  airportIcao: string;
}

export interface RadarRoundResult {
  question: RadarQuestion;
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

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- Real-airport pool -------------------------------------------------------

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

// ---- Realistic callsigns -----------------------------------------------------

interface CallsignSpec {
  /** Radio callsign (SPEEDBIRD, DYNASTY, …). */
  word: string;
  /** Short label for the recap, e.g. "BAW123". */
  shortIata: string;
}

let cachedCallsignPool: CallsignSpec[] | null = null;

function callsignPool(): CallsignSpec[] {
  if (cachedCallsignPool) return cachedCallsignPool;
  const out: CallsignSpec[] = [];
  for (const a of airlines) {
    const m = airlineMeta(a.iata);
    if (!m.callsign) continue;
    out.push({ word: m.callsign, shortIata: a.iata });
  }
  cachedCallsignPool = out;
  return out;
}

function genCallsign(rng: Rng): { callsign: string; shortIata: string } {
  const spec = pick(callsignPool(), rng);
  const num = 100 + Math.floor(rng() * 900);
  return {
    callsign: `${spec.word}${num}`,
    shortIata: `${spec.shortIata}${num}`,
  };
}

// ---- Scenario base -----------------------------------------------------------

interface ScenarioBase {
  airport: RealAirport;
  runway: RealRunway;
  /** True heading aircraft fly when on final to this runway. */
  finalCourse: number;
  /** Threshold position in scope coordinates (nm relative to airport center). */
  threshold: { x: number; y: number };
  rangeNm: number;
}

function buildScenarioBase(rng: Rng, rangeNm = 30): ScenarioBase {
  const airport = pick(airportPool(), rng);
  const runway = longestPavedRunway(airport);
  // Use the .he end as the "landing direction": its headingDegT is the heading
  // an aircraft flies on final to land on that end.
  const center = { lat: airport.lat, lon: airport.lon };
  const threshold = geoToScope(center, { lat: runway.he.lat, lon: runway.he.lon });
  return {
    airport,
    runway,
    finalCourse: runway.he.headingDegT,
    threshold,
    rangeNm,
  };
}

function scenarioFromBase(
  base: ScenarioBase,
  aircraft: Aircraft[],
  wind?: { from: number; kt: number },
): RadarScenario {
  return {
    airportName: base.airport.name,
    airportIata: base.airport.iata || base.airport.icao,
    airportIcao: base.airport.icao,
    aircraft,
    runways: airportRunwaysToScope(base.airport, base.runway),
    wind,
    rangeNm: base.rangeNm,
  };
}

// ---- Geometry helpers --------------------------------------------------------

/** Random position inside the scope at radius [minNm, maxNm] from center. */
function randomScopePos(rng: Rng, minNm: number, maxNm: number): { x: number; y: number } {
  const r = minNm + rng() * (maxNm - minNm);
  const t = rng() * Math.PI * 2;
  return { x: Math.cos(t) * r, y: Math.sin(t) * r };
}

// ---- Question 1: conflict spotter --------------------------------------------

function buildConflictQuestion(difficulty: Difficulty, rng: Rng): ConflictQuestion {
  const aircraftCount = difficulty === 'easy' ? 4 : difficulty === 'medium' ? 6 : 7;
  const horizonSec = difficulty === 'hard' ? 120 : 180;
  const sepNm = difficulty === 'hard' ? 3 : 5;

  const base = buildScenarioBase(rng);

  // Step 1: place a guaranteed-conflict pair.
  const meetingAlt = 14000 + Math.floor(rng() * 12) * 1000;
  const headingA = Math.floor(rng() * 360);
  const headingB = (headingA + 180) % 360;
  const meetingPoint = randomScopePos(rng, 5, 12);
  const offsetNm = 10;
  const dxA = Math.sin((headingA * Math.PI) / 180) * offsetNm;
  const dyA = -Math.cos((headingA * Math.PI) / 180) * offsetNm;
  const speedA = 380 + Math.floor(rng() * 80);
  const speedB = 380 + Math.floor(rng() * 80);
  const a: Aircraft = {
    id: 'ac-0',
    callsign: genCallsign(rng).callsign,
    pos: { x: meetingPoint.x - dxA, y: meetingPoint.y - dyA },
    heading: headingA,
    altitude: meetingAlt,
    speed: speedA,
  };
  const b: Aircraft = {
    id: 'ac-1',
    callsign: genCallsign(rng).callsign,
    pos: { x: meetingPoint.x + dxA, y: meetingPoint.y + dyA },
    heading: headingB,
    altitude: meetingAlt,
    speed: speedB,
  };
  const aircraft: Aircraft[] = [a, b];

  // Step 2: add distractors one at a time, rejecting any that introduce a 2nd conflict.
  let safety = 0;
  let nextId = 2;
  while (aircraft.length < aircraftCount && safety < 400) {
    safety++;
    // Altitude offset of ≥2000 ft from the conflict pair guarantees no vertical
    // conflict with them; we still verify against findConflicts to catch
    // distractor-vs-distractor collisions.
    const altOffset = (2 + Math.floor(rng() * 6)) * 1000 * (rng() < 0.5 ? -1 : 1);
    const candidate: Aircraft = {
      id: `ac-${nextId}`,
      callsign: genCallsign(rng).callsign,
      pos: randomScopePos(rng, 8, base.rangeNm - 4),
      heading: Math.floor(rng() * 360),
      altitude: Math.max(5000, Math.min(40000, meetingAlt + altOffset)),
      speed: 240 + Math.floor(rng() * 200),
    };
    const test = [...aircraft, candidate];
    const conflicts = findConflicts({ aircraft: test }, horizonSec, sepNm);
    if (conflicts.length === 1 && conflicts[0].a.id === 'ac-0' && conflicts[0].b.id === 'ac-1') {
      aircraft.push(candidate);
      nextId++;
    }
  }

  // Final verification — should be exactly one conflict (the seeded pair).
  const finalConflicts = findConflicts({ aircraft }, horizonSec, sepNm);
  const pair = finalConflicts.find((c) => (c.a.id === 'ac-0' && c.b.id === 'ac-1') || (c.a.id === 'ac-1' && c.b.id === 'ac-0')) ?? finalConflicts[0];
  const scenario = scenarioFromBase(base, aircraft);

  return {
    kind: 'conflict',
    mode: 'radar',
    prompt: `Conflict near ${scenario.airportIata} — which two will lose separation?`,
    answer: `${a.callsign} ↔ ${b.callsign}`,
    explanation: `Both aircraft are at FL${Math.round(a.altitude / 100)} on converging tracks; minimum predicted separation ${pair.minSeparation.toFixed(1)} nm in ${pair.tSeconds}s.`,
    scenario,
    conflictPair: [a.id, b.id],
  };
}

// ---- Question 2: approve direct ----------------------------------------------

function buildDirectQuestion(difficulty: Difficulty, rng: Rng): DirectQuestion {
  const base = buildScenarioBase(rng);
  const otherCount = difficulty === 'easy' ? 2 : difficulty === 'medium' ? 3 : 4;

  // The requester
  const requesterCs = genCallsign(rng);
  const requester: Aircraft = {
    id: 'ac-req',
    callsign: requesterCs.callsign,
    pos: randomScopePos(rng, 12, 22),
    heading: Math.floor(rng() * 360),
    altitude: 18000 + Math.floor(rng() * 8) * 1000,
    speed: 380 + Math.floor(rng() * 80),
  };

  // Random "destination" headings — we'll point requester at a heading.
  const destHeading = Math.floor(rng() * 360);

  // Other traffic
  const others: Aircraft[] = [];
  for (let i = 0; i < otherCount; i++) {
    const cs = genCallsign(rng);
    const altOffset = (Math.floor(rng() * 8) - 4) * 1000;
    others.push({
      id: `ac-${i}`,
      callsign: cs.callsign,
      pos: randomScopePos(rng, 8, base.rangeNm - 4),
      heading: Math.floor(rng() * 360),
      altitude: Math.max(5000, Math.min(40000, requester.altitude + altOffset)),
      speed: 240 + Math.floor(rng() * 200),
    });
  }

  // Project requester forward at destHeading; check conflicts against others.
  const requesterDirect: Aircraft = { ...requester, heading: destHeading };
  const all = [requesterDirect, ...others];
  const conflicts = findConflicts({ aircraft: all }, 240, 5);

  let correctIndex: number;
  let correctAnswer: string;
  let explanation: string;
  let blockerCallsign: string | undefined;

  if (conflicts.length === 0) {
    correctIndex = 0;
    correctAnswer = 'Approve direct';
    explanation = 'No traffic on the requested track within 4 minutes — clean approval.';
  } else {
    // Find the blocker aircraft
    const conflict = conflicts[0];
    const blocker = conflict.a.id === 'ac-req' ? conflict.b : conflict.a;
    blockerCallsign = blocker.callsign;
    if (Math.abs(requesterDirect.altitude - blocker.altitude) > 800 || conflict.tSeconds > 180) {
      // Borderline — "approve after" is the safer call
      correctIndex = 1;
      correctAnswer = `Approve after ${blocker.callsign}`;
      explanation = `${blocker.callsign} is on a converging track — let it pass first, then approve.`;
    } else {
      correctIndex = 2;
      correctAnswer = 'Deny';
      explanation = `${blocker.callsign} is at the same level on a head-on track inside 3 min — deny outright.`;
    }
  }

  // Build options: always 3, in fixed slot order so the UI is consistent.
  const blockerName = blockerCallsign ?? others[0].callsign;
  const options = ['Approve direct', `Approve after ${blockerName}`, 'Deny'];

  const scenario = scenarioFromBase(base, all);
  return {
    kind: 'direct',
    mode: 'radar',
    prompt: `${scenario.airportIata} — ${requester.callsign} requests direct destination (heading ${destHeading.toString().padStart(3, '0')}). Your call?`,
    answer: correctAnswer,
    explanation,
    scenario,
    options,
    correctIndex,
  };
}

// ---- Round builder -----------------------------------------------------------

export function buildRadarRound(difficulty: Difficulty, rng: Rng = defaultRng()): RadarQuestion[] {
  const kinds: RadarKind[] = ['conflict', 'direct'];
  const out: RadarQuestion[] = [];
  for (let i = 0; i < RADAR_ROUND_LENGTH; i++) {
    const kind = kinds[i % kinds.length];
    out.push(kind === 'conflict' ? buildConflictQuestion(difficulty, rng) : buildDirectQuestion(difficulty, rng));
  }
  return shuffle(out, rng);
}
