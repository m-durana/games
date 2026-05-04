// Conflict Resolution: en-route / approach controller picks an immediate
// resolution for an active converging-pair conflict. Differs from Conflict
// Spot (which asks WHO is conflicting): here the pair is already flagged in
// the alarm bubble, and the player picks one of four resolutions. Other
// traffic on the scope can block one or more options.
// See docs/tier2-radar-modes.md.

import type { Aircraft, Scenario } from 'radarscope';
import { findConflicts } from 'radarscope';
import { airportsByType, geoToScope, type RealAirport, type RealRunway } from 'radarscope/data';
import type { Difficulty } from './types';
import { airlines, airlineMeta } from './engine';
import { airportRunwaysToScope } from './scope-runways';

export const RESOLVE_ROUND_LENGTH = 10;
const DEG2RAD = Math.PI / 180;
const SEP_NM = 5;
const SEP_FT = 1000;
const HORIZON_SEC = 240;

export type ResolveOptionKey = 'climbA' | 'descendB' | 'leftA' | 'rightB';

export interface ResolveOption {
  label: string;
  key: ResolveOptionKey;
  /** True if applying this resolution leaves the scope conflict-free in the horizon. */
  legal: boolean;
  /** Higher = more spacing recovered. Used to rank legal options. */
  resolvedSepNm: number;
}

export interface ResolveQuestion {
  mode: 'resolve';
  prompt: string;
  /** STCA-style alarm bubble. */
  atcCall: string;
  /** Inline reference (easy/medium). */
  instruments?: string;
  answer: string;
  explanation: string;
  scenario: ResolveScenario;
  options: ResolveOption[];
  correctIndex: number;
  /** Easy mode: green-outline the correct option. */
  showAnswerHint: boolean;
}

export interface ResolveScenario extends Scenario {
  airportName: string;
  airportIata: string;
  airportIcao: string;
  /** Aircraft IDs of the conflict pair: leader, trailer. */
  pairIds: [string, string];
}

export interface ResolveRoundResult {
  question: ResolveQuestion;
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

function randomScopePos(rng: Rng, minNm: number, maxNm: number): { x: number; y: number } {
  const r = minNm + rng() * (maxNm - minNm);
  const t = rng() * Math.PI * 2;
  return { x: Math.cos(t) * r, y: Math.sin(t) * r };
}

/** Apply one of the four resolution actions to the scenario, returning a copy
 *  of the aircraft list with the modification baked in. */
function applyAction(aircraft: Aircraft[], pairA: string, pairB: string, key: ResolveOptionKey): Aircraft[] {
  return aircraft.map((ac) => {
    if (key === 'climbA' && ac.id === pairA) return { ...ac, altitude: ac.altitude + 2000 };
    if (key === 'descendB' && ac.id === pairB) return { ...ac, altitude: ac.altitude - 2000 };
    if (key === 'leftA' && ac.id === pairA) return { ...ac, heading: (ac.heading - 30 + 360) % 360 };
    if (key === 'rightB' && ac.id === pairB) return { ...ac, heading: (ac.heading + 30) % 360 };
    return ac;
  });
}

/** Compute minimum predicted lateral separation between the pair after a
 *  resolution is applied. Higher = better. Uses straight-line projection. */
function pairMinSepAfter(aircraft: Aircraft[], aId: string, bId: string): number {
  const a = aircraft.find((x) => x.id === aId)!;
  const b = aircraft.find((x) => x.id === bId)!;
  // Vertical resolutions take ~30s to gain 1000 ft (typical 2000 fpm rate);
  // we accept the simplification that altitude change is "applied" to the
  // entire horizon for the purpose of the conflict-free check, which is what
  // findConflicts does anyway.
  if (Math.abs(a.altitude - b.altitude) >= SEP_FT) return Infinity;
  let minSep = Infinity;
  const stepSec = 4;
  for (let t = 0; t <= HORIZON_SEC; t += stepSec) {
    const pa = projectPos(a, t);
    const pb = projectPos(b, t);
    const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    if (d < minSep) minSep = d;
  }
  return minSep;
}

function projectPos(ac: Aircraft, tSec: number) {
  const dNm = (ac.speed / 3600) * tSec;
  const r = ac.heading * DEG2RAD;
  return { x: ac.pos.x + Math.sin(r) * dNm, y: ac.pos.y - Math.cos(r) * dNm };
}

interface BuildOpts { difficulty: Difficulty; rng: Rng; }

export function buildResolveQuestion({ difficulty, rng }: BuildOpts): ResolveQuestion {
  const airport = pick(airportPool(), rng);
  const runway = longestPavedRunway(airport);
  const center = { lat: airport.lat, lon: airport.lon };
  const threshold = geoToScope(center, { lat: runway.he.lat, lon: runway.he.lon });
  const rangeNm = 30;

  const meetingPoint = randomScopePos(rng, 6, 14);
  const meetingAlt = 14000 + Math.floor(rng() * 12) * 1000;

  // Heading geometry: leader (A) and trailer (B) converge at meetingPoint.
  const headingDelta = 100 + Math.floor(rng() * 80); // 100°-180°: cleanly converging
  const headingA = Math.floor(rng() * 360);
  const headingB = (headingA + headingDelta) % 360;

  const speedA = 360 + Math.floor(rng() * 120);
  const speedB = 360 + Math.floor(rng() * 120);
  const tToMeet = 90 + Math.floor(rng() * 90);
  const distA = (speedA / 3600) * tToMeet;
  const distB = (speedB / 3600) * tToMeet;
  const ar = headingA * DEG2RAD;
  const br = headingB * DEG2RAD;
  const posA = { x: meetingPoint.x - Math.sin(ar) * distA, y: meetingPoint.y + Math.cos(ar) * distA };
  const posB = { x: meetingPoint.x - Math.sin(br) * distB, y: meetingPoint.y + Math.cos(br) * distB };

  const aId = 'ac-A';
  const bId = 'ac-B';
  const csA = genCallsign(rng);
  let csB = genCallsign(rng);
  while (csB === csA) csB = genCallsign(rng);

  const a: Aircraft = { id: aId, callsign: csA, pos: posA, heading: headingA, altitude: meetingAlt, speed: speedA };
  const b: Aircraft = { id: bId, callsign: csB, pos: posB, heading: headingB, altitude: meetingAlt, speed: speedB };

  const aircraft: Aircraft[] = [a, b];

  // Difficulty-driven blockers: place extra traffic that makes one or two
  // resolutions illegal. We *seed* blockers tied to specific options so we
  // know upfront which ones we want to invalidate, then verify with findConflicts.
  const wantBlocked: ResolveOptionKey[] = [];
  if (difficulty === 'medium') {
    // One blocker. Random side.
    wantBlocked.push(pick<ResolveOptionKey>(['climbA', 'descendB', 'leftA', 'rightB'], rng));
  } else if (difficulty === 'hard') {
    // Two blockers — one altitude blocker, one lateral blocker — so two of the
    // four options are illegal.
    const altOpt = pick<ResolveOptionKey>(['climbA', 'descendB'], rng);
    const latOpt = pick<ResolveOptionKey>(['leftA', 'rightB'], rng);
    wantBlocked.push(altOpt, latOpt);
  }

  // Filler distant traffic for atmosphere (easy/medium).
  const fillerCount = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 2;

  let nextId = 0;
  function newId() { return `ac-${nextId++}`; }

  // Place blockers — each blocker is positioned to conflict with the post-action
  // path of the resolved aircraft.
  for (const key of wantBlocked) {
    const blockerCs = genCallsign(rng);
    let blocker: Aircraft;
    if (key === 'climbA') {
      // Aircraft 1500 ft above A on a slow crossing track near A's projected position.
      const ahead = projectPos(a, 60);
      blocker = {
        id: newId(),
        callsign: blockerCs,
        pos: { x: ahead.x + (rng() - 0.5) * 2, y: ahead.y + (rng() - 0.5) * 2 },
        heading: (headingA + 90) % 360,
        altitude: meetingAlt + 1500,
        speed: 320 + Math.floor(rng() * 80),
      };
    } else if (key === 'descendB') {
      const ahead = projectPos(b, 60);
      blocker = {
        id: newId(),
        callsign: blockerCs,
        pos: { x: ahead.x + (rng() - 0.5) * 2, y: ahead.y + (rng() - 0.5) * 2 },
        heading: (headingB - 90 + 360) % 360,
        altitude: meetingAlt - 1500,
        speed: 320 + Math.floor(rng() * 80),
      };
    } else if (key === 'leftA') {
      // Place a co-altitude aircraft on A's left-30° projected path.
      const turnedA: Aircraft = { ...a, heading: (headingA - 30 + 360) % 360 };
      const ahead = projectPos(turnedA, 90);
      blocker = {
        id: newId(),
        callsign: blockerCs,
        pos: { x: ahead.x + (rng() - 0.5) * 1.5, y: ahead.y + (rng() - 0.5) * 1.5 },
        heading: (turnedA.heading + 180) % 360,
        altitude: meetingAlt,
        speed: 360 + Math.floor(rng() * 80),
      };
    } else {
      // rightB blocker
      const turnedB: Aircraft = { ...b, heading: (headingB + 30) % 360 };
      const ahead = projectPos(turnedB, 90);
      blocker = {
        id: newId(),
        callsign: blockerCs,
        pos: { x: ahead.x + (rng() - 0.5) * 1.5, y: ahead.y + (rng() - 0.5) * 1.5 },
        heading: (turnedB.heading + 180) % 360,
        altitude: meetingAlt,
        speed: 360 + Math.floor(rng() * 80),
      };
    }
    aircraft.push(blocker);
  }

  // Filler aircraft well away vertically and laterally — atmosphere only,
  // confirmed not to introduce extra conflicts.
  let safety = 0;
  while (aircraft.length < 2 + wantBlocked.length + fillerCount && safety < 60) {
    safety++;
    const altOffset = (4 + Math.floor(rng() * 6)) * 1000 * (rng() < 0.5 ? -1 : 1);
    const candidate: Aircraft = {
      id: newId(),
      callsign: genCallsign(rng),
      pos: randomScopePos(rng, 14, rangeNm - 4),
      heading: Math.floor(rng() * 360),
      altitude: Math.max(5000, Math.min(40000, meetingAlt + altOffset)),
      speed: 280 + Math.floor(rng() * 160),
    };
    aircraft.push(candidate);
  }

  // Build options. For each: simulate, check (1) the original A↔B conflict is
  // resolved, (2) no NEW conflicts appear with anyone else.
  const allKeys: ResolveOptionKey[] = ['climbA', 'descendB', 'leftA', 'rightB'];
  const options: ResolveOption[] = allKeys.map((key) => {
    const after = applyAction(aircraft, aId, bId, key);
    const conflicts = findConflicts({ aircraft: after }, HORIZON_SEC, SEP_NM, SEP_FT);
    const stillPair = conflicts.some(
      (c) => (c.a.id === aId && c.b.id === bId) || (c.a.id === bId && c.b.id === aId),
    );
    const newConflicts = conflicts.filter(
      (c) => !((c.a.id === aId && c.b.id === bId) || (c.a.id === bId && c.b.id === aId)),
    );
    const legal = !stillPair && newConflicts.length === 0;
    const sep = pairMinSepAfter(after, aId, bId);
    return {
      key,
      label: labelFor(key, csA, csB),
      legal,
      resolvedSepNm: sep,
    };
  });

  // Best legal option = highest resolvedSepNm (and ties broken toward altitude
  // resolutions, which are operationally preferred for STCA — they don't
  // require extra ATC follow-up). If nothing is legal in the generated scope,
  // fall back to the first vertical option as the "least-bad".
  const legalOpts = options.filter((o) => o.legal);
  let correctKey: ResolveOptionKey;
  if (legalOpts.length > 0) {
    legalOpts.sort((x, y) => {
      if (Math.abs(x.resolvedSepNm - y.resolvedSepNm) > 0.5) return y.resolvedSepNm - x.resolvedSepNm;
      // Vertical preference for tie-breaks
      const xVert = x.key === 'climbA' || x.key === 'descendB';
      const yVert = y.key === 'climbA' || y.key === 'descendB';
      if (xVert !== yVert) return xVert ? -1 : 1;
      return 0;
    });
    correctKey = legalOpts[0].key;
  } else {
    // Edge case: blocker geometry conspired so all four are technically illegal.
    // Pick whichever opens the most spacing.
    options.sort((x, y) => y.resolvedSepNm - x.resolvedSepNm);
    correctKey = options[0].key;
    options.find((o) => o.key === correctKey)!.legal = true;
  }

  // Restore option order to keep UI consistent with `allKeys`.
  options.sort((x, y) => allKeys.indexOf(x.key) - allKeys.indexOf(y.key));
  const correctIndex = options.findIndex((o) => o.key === correctKey);

  const showInstruments = difficulty !== 'hard';

  const scenario: ResolveScenario = {
    airportName: airport.name,
    airportIata: airport.iata || airport.icao,
    airportIcao: airport.icao,
    aircraft,
    runways: airportRunwaysToScope(airport, runway),
    rangeNm,
    pairIds: [aId, bId],
  };

  const atcCall = `STCA: ${csA} ↔ ${csB} - predicted loss of separation in ${tToMeet}s.`;
  const instruments = showInstruments
    ? `Both at FL${Math.round(meetingAlt / 100)}. ${csA} on ${headingA.toString().padStart(3, '0')}°, ${csB} on ${headingB.toString().padStart(3, '0')}°.`
    : undefined;
  const correct = options[correctIndex];
  const explanation = buildExplanation(correct, options, csA, csB);

  return {
    mode: 'resolve',
    prompt: "What's your call?",
    atcCall,
    instruments,
    answer: correct.label,
    explanation,
    scenario,
    options,
    correctIndex,
    showAnswerHint: false,
  };
}

function labelFor(key: ResolveOptionKey, csA: string, csB: string): string {
  switch (key) {
    case 'climbA': return `Climb ${csA} 2,000 ft`;
    case 'descendB': return `Descend ${csB} 2,000 ft`;
    case 'leftA': return `Vector ${csA} left 30°`;
    case 'rightB': return `Vector ${csB} right 30°`;
  }
}

function buildExplanation(correct: ResolveOption, options: ResolveOption[], _csA: string, _csB: string): string {
  const blocked = options.filter((o) => !o.legal && o.key !== correct.key);
  const blockedTxt = blocked.length > 0
    ? ` Blocked options: ${blocked.map((o) => o.label).join(', ')} - other traffic on those resolutions.`
    : '';
  return `${correct.label} opens ${correct.resolvedSepNm.toFixed(1)} nm of lateral separation and stays clear of other traffic.${blockedTxt}`;
}

export function buildResolveRound(difficulty: Difficulty, rng: Rng = defaultRng()): ResolveQuestion[] {
  return Array.from({ length: RESOLVE_ROUND_LENGTH }, () => buildResolveQuestion({ difficulty, rng }));
}
