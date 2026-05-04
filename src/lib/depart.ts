// Departure Release: tower controller picks which holding-short aircraft to
// release next, given inbound traffic on final and the candidate's initial
// departure heading. Wake-pair ordering between successive departures is
// intentionally NOT modeled — that's a lookup-table mode, not a game. The
// surviving skill is the spatial read: how close is the inbound, and does the
// candidate's initial heading conflict with anything?
// See docs/tier2-radar-modes.md (mode is "narrowed").

import type { Aircraft, Scenario } from 'radarscope';
import { airportsByType, geoToScope, type RealAirport, type RealRunway } from 'radarscope/data';
import type { Difficulty } from './types';
import { airlines, airlineMeta } from './engine';
import { airportRunwaysToScope } from './scope-runways';

export const DEPART_ROUND_LENGTH = 10;
const DEG2RAD = Math.PI / 180;
const HOLD_THRESHOLD_NM = 2.0;

export type DepartOptionKey = string; // candidate id, or 'hold'

export interface DepartOption {
  label: string;
  key: DepartOptionKey;
  legal: boolean;
  /** Higher = better choice. Used for ranking and scoring partial credit. */
  rank: number;
}

export interface DepartQuestion {
  mode: 'depart';
  prompt: string;
  atcCall: string;
  instruments?: string;
  answer: string;
  explanation: string;
  scenario: DepartScenario;
  options: DepartOption[];
  correctIndex: number;
  showAnswerHint: boolean;
}

export interface DepartScenario extends Scenario {
  airportName: string;
  airportIata: string;
  airportIcao: string;
  /** Aircraft IDs of holding-short candidates (drawn near threshold, speed 0). */
  candidateIds: string[];
  /** Aircraft IDs of inbounds on final. */
  inboundIds: string[];
}

export interface DepartRoundResult {
  question: DepartQuestion;
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

interface BuildOpts { difficulty: Difficulty; rng: Rng; }

export function buildDepartQuestion({ difficulty, rng }: BuildOpts): DepartQuestion {
  const airport = pick(airportPool(), rng);
  const runway = longestPavedRunway(airport);
  const finalCourse = runway.he.headingDegT; // landing direction onto .he end
  const departCourse = runway.le.headingDegT; // takeoff direction off .le end
  const center = { lat: airport.lat, lon: airport.lon };
  const threshold = geoToScope(center, { lat: runway.he.lat, lon: runway.he.lon });
  const departThreshold = geoToScope(center, { lat: runway.le.lat, lon: runway.le.lon });
  // Tower scope is tight — the runway is the focus, not en-route traffic.
  const rangeNm = 6;

  const candidateCount = difficulty === 'easy' ? 2 : 3;
  const inboundCount = difficulty === 'hard' ? 2 : 1;

  // ---- Inbounds on final --------------------------------------------------
  const inbounds: Aircraft[] = [];
  // Place inbounds at varied final-distance ranges by difficulty.
  // Hard sometimes places the closest inbound INSIDE 2 nm so "hold all" is correct.
  const closeInboundChance = difficulty === 'hard' ? 0.35 : difficulty === 'medium' ? 0.15 : 0.0;
  const forceClose = rng() < closeInboundChance;
  for (let i = 0; i < inboundCount; i++) {
    let distNm: number;
    if (i === 0 && forceClose) {
      distNm = 0.9 + rng() * 0.9; // 0.9 - 1.8 nm => "hold all"
    } else if (i === 0) {
      distNm = 2.5 + rng() * 2.5; // 2.5 - 5 nm: comfortable but visible on the tight scope
    } else {
      distNm = 5 + rng() * 1; // far inbound, still in range
    }
    const r = (finalCourse + 180) * DEG2RAD;
    const pos = {
      x: threshold.x + Math.sin(r) * distNm,
      y: threshold.y - Math.cos(r) * distNm,
    };
    inbounds.push({
      id: `in-${i}`,
      callsign: genCallsign(rng),
      pos,
      heading: finalCourse,
      altitude: 1500 + Math.floor(rng() * 1500),
      speed: 130 + Math.floor(rng() * 30),
    });
  }

  // ---- Holding-short candidates ------------------------------------------
  // Drawn at a small offset from the departure threshold so blips don't stack.
  // Initial heading is what the SID assigns once airborne; varied per candidate.
  const candidates: Aircraft[] = [];
  // Choose a "preferred" diverging direction that the optimal candidate will use.
  const preferredOffset = rng() < 0.5 ? -45 : 45;
  const initialHeadings: number[] = [];
  for (let i = 0; i < candidateCount; i++) {
    let offset: number;
    if (i === 0) offset = preferredOffset;             // diverging — optimal
    else if (i === 1) offset = 0;                       // straight out — same vector as inbound traffic
    else offset = -preferredOffset;                     // opposite diverging — also OK but less preferred (e.g. trails another candidate)
    initialHeadings.push((departCourse + offset + 360) % 360);
  }
  // Shuffle the candidate display order so the player can't pattern-match
  // "always pick the first one".
  const order = shuffle([...Array(candidateCount).keys()], rng);
  // Spread holding-short aircraft along a short spur perpendicular to the
  // runway so they're distinguishable on the scope. With rangeNm=6 and a
  // typical large-airport runway ~1.7 nm long, 1.5 nm of spread keeps them
  // readable without crowding the data tags.
  const lateralR = (departCourse + 90) * DEG2RAD;
  for (let displayIdx = 0; displayIdx < candidateCount; displayIdx++) {
    const designIdx = order[displayIdx];
    const lateralOffset = (displayIdx - (candidateCount - 1) / 2) * 1.5;
    const pos = {
      x: departThreshold.x + Math.sin(lateralR) * lateralOffset,
      y: departThreshold.y - Math.cos(lateralR) * lateralOffset,
    };
    candidates.push({
      id: `dep-${designIdx}`,
      callsign: genCallsign(rng),
      pos,
      heading: initialHeadings[designIdx],
      altitude: 0,
      speed: 0,
    });
  }

  // ---- Scoring ------------------------------------------------------------
  // closeInbound forces "hold all" to be correct.
  const nearestInboundNm = Math.min(...inbounds.map((ac) => distNm(ac.pos, threshold)));
  const inboundTooClose = nearestInboundNm < HOLD_THRESHOLD_NM;

  // For each candidate, assess legality + rank.
  // Legal if: (a) inbound is not too close, (b) candidate's initial heading
  // doesn't point straight back at the active final approach (which would
  // converge with the inbound).
  // Rank prefers candidates whose initial heading diverges most from the
  // inbound's projected track.
  const candidateScores = candidates.map((cand) => {
    const designIdx = parseInt(cand.id.split('-')[1], 10);
    const headingDelta = signedDelta(cand.heading, departCourse); // signed deg from runway centerline
    const divergence = Math.abs(headingDelta);
    // Conflicts-with-inbound check: divergence ~0 means flying parallel to (and
    // below) the inbound's path, which is fine. The real conflict is when the
    // departure heading is < 30° off-runway AND the inbound is < 4 nm away —
    // by the time the departure climbs to pattern altitude, it's near the
    // inbound's track. Encode this as a soft penalty.
    const proximityPenalty = nearestInboundNm < 4 && divergence < 25 ? 1 : 0;
    const legal = !inboundTooClose && proximityPenalty === 0;
    const rank = legal ? divergence : -1;
    return { cand, designIdx, legal, rank, divergence };
  });

  // ---- Build options (display order matches `candidates`) ----------------
  const options: DepartOption[] = candidates.map((cand) => {
    const score = candidateScores.find((s) => s.cand.id === cand.id)!;
    return {
      key: cand.id,
      label: `Release ${cand.callsign}`,
      legal: score.legal && !inboundTooClose,
      rank: score.rank,
    };
  });
  options.push({
    key: 'hold',
    label: 'Hold all - inbound too close',
    legal: inboundTooClose,
    rank: inboundTooClose ? 100 : -2,
  });

  // ---- Resolve correct answer --------------------------------------------
  let correctIndex: number;
  if (inboundTooClose) {
    correctIndex = options.findIndex((o) => o.key === 'hold');
  } else {
    // Highest-rank legal candidate wins.
    const legal = options.filter((o) => o.legal && o.key !== 'hold');
    legal.sort((x, y) => y.rank - x.rank);
    if (legal.length === 0) {
      // Defensive fallback: shouldn't happen, but if all candidates are
      // somehow penalized, pick the first one and mark it legal.
      correctIndex = 0;
      options[0].legal = true;
    } else {
      correctIndex = options.findIndex((o) => o.key === legal[0].key);
    }
  }

  // ---- Scenario assembly --------------------------------------------------
  const aircraft = [...candidates, ...inbounds];
  const scenario: DepartScenario = {
    airportName: airport.name,
    airportIata: airport.iata || airport.icao,
    airportIcao: airport.icao,
    aircraft,
    runways: airportRunwaysToScope(airport, runway),
    rangeNm,
    candidateIds: candidates.map((c) => c.id),
    inboundIds: inbounds.map((c) => c.id),
  };

  const showInstruments = difficulty !== 'hard';
  const correct = options[correctIndex];

  const headingList = candidates
    .map((c) => `${c.callsign} hdg ${fmtHeading(c.heading)}`)
    .join(', ');
  const atcCall = `Holding short ${runway.le.ident || 'runway'}: ${headingList}.`;
  const instruments = showInstruments
    ? `Inbound on final: ${inbounds.map((ac) => `${ac.callsign} ${distNm(ac.pos, threshold).toFixed(1)} nm`).join(', ')}.`
    : undefined;

  const explanation = buildExplanation(correct, options, candidates, inbounds, threshold, inboundTooClose);

  return {
    mode: 'depart',
    prompt: 'Who do you release first?',
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

function buildExplanation(
  correct: DepartOption,
  options: DepartOption[],
  candidates: Aircraft[],
  inbounds: Aircraft[],
  threshold: { x: number; y: number },
  inboundTooClose: boolean,
): string {
  if (correct.key === 'hold') {
    const nearest = inbounds.reduce((best, ac) => (distNm(ac.pos, threshold) < distNm(best.pos, threshold) ? ac : best), inbounds[0]);
    return `${nearest.callsign} is ${distNm(nearest.pos, threshold).toFixed(1)} nm on final - inside the ${HOLD_THRESHOLD_NM} nm release minimum. Hold all departures.`;
  }
  if (inboundTooClose) {
    return `An inbound is inside the release minimum - all departures must hold.`;
  }
  const cand = candidates.find((c) => c.id === correct.key);
  const nearest = inbounds.reduce((best, ac) => (distNm(ac.pos, threshold) < distNm(best.pos, threshold) ? ac : best), inbounds[0]);
  const others = options.filter((o) => o.key !== correct.key && o.key !== 'hold' && !o.legal);
  const blockedTxt = others.length > 0
    ? ` Other candidates' initial headings would converge with ${nearest.callsign}'s final track.`
    : '';
  return cand
    ? `${cand.callsign} departs on heading ${fmtHeading(cand.heading)}, diverging from final - safest release with ${nearest.callsign} ${distNm(nearest.pos, threshold).toFixed(1)} nm out.${blockedTxt}`
    : `Pick the candidate whose initial heading diverges most from the inbound's track.${blockedTxt}`;
}

function distNm(p: { x: number; y: number }, q: { x: number; y: number }): number {
  return Math.hypot(p.x - q.x, p.y - q.y);
}

function signedDelta(a: number, b: number): number {
  let d = ((a - b + 540) % 360) - 180;
  return d;
}

function fmtHeading(deg: number): string {
  const n = ((Math.round(deg) % 360) + 360) % 360;
  return n.toString().padStart(3, '0');
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildDepartRound(difficulty: Difficulty, rng: Rng = defaultRng()): DepartQuestion[] {
  return Array.from({ length: DEPART_ROUND_LENGTH }, () => buildDepartQuestion({ difficulty, rng }));
}
