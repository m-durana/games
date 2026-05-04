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
  /** Game question to the player (e.g. "Which two will lose separation?"). */
  prompt: string;
  /** Pilot voice on the radio (only direct-request mode). The player is the
   *  controller; this is a pilot calling in. Rendered as a speech bubble. */
  pilotCall?: string;
  /** Human-readable correct-answer string (shown in the recap). */
  answer: string;
  explanation: string;
  scenario: RadarScenario;
}

export interface ConflictQuestion extends RadarBaseQuestion {
  kind: 'conflict';
  /** For AtcResults recap pill. */
  mode: 'conflict';
  /** Aircraft IDs of the true conflict pair. */
  conflictPair: [string, string];
  /** Vertical rates in ft/min, keyed by aircraft id. Positive = climb, negative = descent.
   *  Aircraft not present here are level. Hard-mode scenarios use this to seed
   *  altitude-crossover conflicts where one aircraft descends through another's level. */
  verticalRates?: Record<string, number>;
}

export interface DirectQuestion extends RadarBaseQuestion {
  kind: 'direct';
  /** For AtcResults recap pill. */
  mode: 'direct';
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

/** Project an aircraft's position forward by `tSec` seconds. */
function projectPos(ac: Aircraft, tSec: number): { x: number; y: number } {
  const dNm = (ac.speed / 3600) * tSec;
  const r = (ac.heading * Math.PI) / 180;
  return { x: ac.pos.x + Math.sin(r) * dNm, y: ac.pos.y - Math.cos(r) * dNm };
}

/** Project altitude forward by `tSec` seconds given a vertical rate (ft/min). */
function projectAlt(altFt: number, vrFtPerMin: number, tSec: number): number {
  return altFt + (vrFtPerMin * tSec) / 60;
}

interface VConflict {
  a: Aircraft;
  b: Aircraft;
  minSeparation: number;
  tSeconds: number;
  /** Vertical separation in ft at the time of minimum lateral separation. */
  vSepFt: number;
}

/** Conflict detector that respects per-aircraft vertical rates. Two aircraft
 *  are in conflict when their lateral separation drops below `sepNm` AND
 *  vertical separation drops below `sepFt` at the same instant within the horizon. */
function findVConflicts(
  aircraft: Aircraft[],
  vRates: Record<string, number>,
  horizonSec: number,
  sepNm: number,
  sepFt = 1000,
): VConflict[] {
  const out: VConflict[] = [];
  const step = Math.max(1, Math.floor(horizonSec / 60));
  for (let i = 0; i < aircraft.length; i++) {
    for (let j = i + 1; j < aircraft.length; j++) {
      const u = aircraft[i];
      const d = aircraft[j];
      const vu = vRates[u.id] ?? 0;
      const vd = vRates[d.id] ?? 0;
      let minLat = Infinity;
      let tAtMin = 0;
      let vSepAtMin = Math.abs(u.altitude - d.altitude);
      let conflict = false;
      for (let t = 0; t <= horizonSec; t += step) {
        const pu = projectPos(u, t);
        const pd = projectPos(d, t);
        const lat = Math.hypot(pu.x - pd.x, pu.y - pd.y);
        const au = projectAlt(u.altitude, vu, t);
        const ad = projectAlt(d.altitude, vd, t);
        const vSep = Math.abs(au - ad);
        if (lat < minLat) {
          minLat = lat;
          tAtMin = t;
          vSepAtMin = vSep;
        }
        if (lat < sepNm && vSep < sepFt) conflict = true;
      }
      if (conflict) out.push({ a: u, b: d, minSeparation: minLat, tSeconds: tAtMin, vSepFt: vSepAtMin });
    }
  }
  return out;
}

function buildConflictQuestion(difficulty: Difficulty, rng: Rng): ConflictQuestion {
  const aircraftCount = difficulty === 'easy' ? 4 : difficulty === 'medium' ? 6 : 9;
  const horizonSec = difficulty === 'hard' ? 120 : 180;
  const sepNm = difficulty === 'hard' ? 3 : 5;

  const base = buildScenarioBase(rng);

  // Heading-convergence variety. Easy stays head-on (180°). Medium spans
  // beam-to-head-on (90°-180°). Hard goes anywhere from converging to nearly
  // overtaking (45°-180°), so the player can't pattern-match opposing arrows.
  const minDelta = difficulty === 'easy' ? 175 : difficulty === 'medium' ? 90 : 45;
  const maxDelta = 180;
  const headingDelta = minDelta + Math.floor(rng() * (maxDelta - minDelta + 1));
  const headingA = Math.floor(rng() * 360);
  const headingB = (headingA + headingDelta) % 360;

  // Altitude crossover (hard only): one aircraft descends through the other's
  // level so they're not co-altitude *now* but will be at the meeting time.
  // This rewards reading the trend, not just the current FL.
  const useCrossover = difficulty === 'hard' && rng() < 0.5;
  const meetingAlt = 14000 + Math.floor(rng() * 12) * 1000;

  const meetingPoint = randomScopePos(rng, 5, 12);
  const speedA = 380 + Math.floor(rng() * 80);
  const speedB = 380 + Math.floor(rng() * 80);

  // Position the pair so they collide AT meetingPoint within the detector's
  // horizon, accounting for their actual speeds. Must stay < horizonSec or
  // the conflict happens past the lookahead and the detector reports nothing
  // (then `pair` is undefined when we build the explanation).
  const maxT = Math.max(60, horizonSec - 15);
  const tToMeet = 60 + Math.floor(rng() * Math.max(1, maxT - 60));
  const distA = (speedA / 3600) * tToMeet;
  const distB = (speedB / 3600) * tToMeet;
  // Aircraft is OFFSET FROM meeting BACKWARDS along its heading: pos = meeting - heading*dist.
  const ar = (headingA * Math.PI) / 180;
  const br = (headingB * Math.PI) / 180;
  const posA = { x: meetingPoint.x - Math.sin(ar) * distA, y: meetingPoint.y + Math.cos(ar) * distA };
  const posB = { x: meetingPoint.x - Math.sin(br) * distB, y: meetingPoint.y + Math.cos(br) * distB };

  let altA = meetingAlt;
  let altB = meetingAlt;
  let vrA = 0;
  let vrB = 0;
  if (useCrossover) {
    // The higher aircraft descends 2000 ft over the time-to-meet. They cross
    // through each other's level at the conflict point (meetingAlt - 1000).
    const aIsHigh = rng() < 0.5;
    altA = aIsHigh ? meetingAlt + 1000 : meetingAlt - 1000;
    altB = aIsHigh ? meetingAlt - 1000 : meetingAlt + 1000;
    const descentFtPerMin = -(2000 * 60) / tToMeet;
    if (aIsHigh) vrA = descentFtPerMin;
    else vrB = descentFtPerMin;
  }

  const a: Aircraft = {
    id: 'ac-0',
    callsign: genCallsign(rng).callsign,
    pos: posA,
    heading: headingA,
    altitude: altA,
    speed: speedA,
  };
  const b: Aircraft = {
    id: 'ac-1',
    callsign: genCallsign(rng).callsign,
    pos: posB,
    heading: headingB,
    altitude: altB,
    speed: speedB,
  };
  const aircraft: Aircraft[] = [a, b];
  const vRates: Record<string, number> = {};
  if (vrA !== 0) vRates[a.id] = vrA;
  if (vrB !== 0) vRates[b.id] = vrB;

  // Step 2: add distractors one at a time, rejecting any that introduce a 2nd conflict.
  // Hard mode adds "near-miss" distractors: aircraft that look threatening
  // (similar altitude, converging heading) but stay just outside separation.
  let safety = 0;
  let nextId = 2;
  while (aircraft.length < aircraftCount && safety < 600) {
    safety++;
    const isFalsePositive = difficulty === 'hard' && aircraft.length < aircraftCount - 2 && rng() < 0.55;
    let altOffset: number;
    let heading: number;
    let pos: { x: number; y: number };
    let speed: number;
    let candidateVr = 0;
    if (isFalsePositive) {
      // Looks dangerous: 1500-2500 ft offset (just safe vertically), heading
      // converging toward the conflict region, but won't actually breach.
      altOffset = (1500 + Math.floor(rng() * 1100)) * (rng() < 0.5 ? -1 : 1);
      heading = (headingA + 90 + Math.floor(rng() * 180)) % 360;
      pos = randomScopePos(rng, 10, 22);
      speed = 280 + Math.floor(rng() * 160);
      // Some near-misses also have a small vertical rate that brings them
      // almost-but-not-quite into the conflict layer.
      if (rng() < 0.4) candidateVr = (rng() < 0.5 ? -1 : 1) * (200 + Math.floor(rng() * 400));
    } else {
      altOffset = (3 + Math.floor(rng() * 6)) * 1000 * (rng() < 0.5 ? -1 : 1);
      heading = Math.floor(rng() * 360);
      pos = randomScopePos(rng, 8, base.rangeNm - 4);
      speed = 240 + Math.floor(rng() * 200);
    }
    const candidate: Aircraft = {
      id: `ac-${nextId}`,
      callsign: genCallsign(rng).callsign,
      pos,
      heading,
      altitude: Math.max(5000, Math.min(40000, meetingAlt + altOffset)),
      speed,
    };
    const testRates = candidateVr !== 0 ? { ...vRates, [candidate.id]: candidateVr } : vRates;
    const test = [...aircraft, candidate];
    const conflicts = findVConflicts(test, testRates, horizonSec, sepNm);
    if (conflicts.length === 1 && conflicts[0].a.id === 'ac-0' && conflicts[0].b.id === 'ac-1') {
      aircraft.push(candidate);
      if (candidateVr !== 0) vRates[candidate.id] = candidateVr;
      nextId++;
    }
  }

  const finalConflicts = findVConflicts(aircraft, vRates, horizonSec, sepNm);
  const pair = finalConflicts.find((c) => (c.a.id === 'ac-0' && c.b.id === 'ac-1') || (c.a.id === 'ac-1' && c.b.id === 'ac-0')) ?? finalConflicts[0];
  const scenario = scenarioFromBase(base, aircraft);

  // Defensive: if (somehow) the seeded pair didn't register a conflict, fall
  // back to a generic explanation rather than crashing on undefined.
  const minSep = pair?.minSeparation ?? 0;
  const tSec = pair?.tSeconds ?? tToMeet;
  const vSep = pair?.vSepFt ?? Math.abs(altA - altB);

  let explanation: string;
  if (useCrossover) {
    const descender = vrA < 0 ? a : b;
    const leveler = descender === a ? b : a;
    explanation = `${descender.callsign} is descending through ${leveler.callsign}'s level (FL${Math.round(leveler.altitude / 100)}); minimum predicted separation ${minSep.toFixed(1)} nm with ${Math.round(vSep)} ft vertical in ${tSec}s.`;
  } else if (headingDelta < 170) {
    explanation = `Converging at ${headingDelta}° at FL${Math.round(a.altitude / 100)}; minimum predicted separation ${minSep.toFixed(1)} nm in ${tSec}s.`;
  } else {
    explanation = `Both aircraft are at FL${Math.round(a.altitude / 100)} on opposing tracks; minimum predicted separation ${minSep.toFixed(1)} nm in ${tSec}s.`;
  }

  return {
    kind: 'conflict',
    mode: 'conflict',
    prompt: `Tap the two aircraft on a collision course near ${scenario.airportIata}.`,
    answer: `${a.callsign} ↔ ${b.callsign}`,
    explanation,
    scenario,
    conflictPair: [a.id, b.id],
    verticalRates: Object.keys(vRates).length > 0 ? vRates : undefined,
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

  // Random "destination" headings - we'll point requester at a heading.
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
    explanation = 'No traffic on the requested track within 4 minutes - clean approval.';
  } else {
    // Find the blocker aircraft
    const conflict = conflicts[0];
    const blocker = conflict.a.id === 'ac-req' ? conflict.b : conflict.a;
    blockerCallsign = blocker.callsign;
    if (Math.abs(requesterDirect.altitude - blocker.altitude) > 800 || conflict.tSeconds > 180) {
      // Borderline - "approve after" is the safer call
      correctIndex = 1;
      correctAnswer = `Approve after ${blocker.callsign}`;
      explanation = `${blocker.callsign} is on a converging track - let it pass first, then approve.`;
    } else {
      correctIndex = 2;
      correctAnswer = 'Deny';
      explanation = `${blocker.callsign} is at the same level on a head-on track inside 3 min - deny outright.`;
    }
  }

  // Build options: always 3, in fixed slot order so the UI is consistent.
  const blockerName = blockerCallsign ?? others[0].callsign;
  const options = ['Approve direct', `Approve after ${blockerName}`, 'Deny'];

  const scenario = scenarioFromBase(base, all);
  return {
    kind: 'direct',
    mode: 'direct',
    pilotCall: `${requester.callsign}, request direct destination, heading ${destHeading.toString().padStart(3, '0')}.`,
    prompt: 'Your call?',
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

export function buildConflictRound(difficulty: Difficulty, rng: Rng = defaultRng()): ConflictQuestion[] {
  return Array.from({ length: RADAR_ROUND_LENGTH }, () => buildConflictQuestion(difficulty, rng));
}

export function buildDirectRound(difficulty: Difficulty, rng: Rng = defaultRng()): DirectQuestion[] {
  return Array.from({ length: RADAR_ROUND_LENGTH }, () => buildDirectQuestion(difficulty, rng));
}
