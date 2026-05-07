// Sequencing: approach controller orders 3-4 inbounds onto the same runway.
// The player taps blips on the scope in landing order; no strip arithmetic is
// shown. Ground-truth ETA is computed internally to score the answer; nothing
// about distance/speed/ETA is exposed in the UI until the post-answer recap.
// On Hard, wake separation forces exactly one swap relative to ETA order — the
// difficulty is "spot the wake interaction," not "do mental long-division."
// See docs/tier1-radar-modes.md.

import type { Aircraft, Scenario } from 'radarscope';
import { airportsByType, geoToScope, type RealAirport, type RealRunway } from 'radarscope/data';
import type { Difficulty } from './types';
import { airlines, airlineMeta } from './engine';
import { airportRunwaysToScope } from './scope-runways';

export const SEQUENCE_ROUND_LENGTH = 10;
const DEG2RAD = Math.PI / 180;

/** ICAO wake categories used here: Light / Medium / Heavy / Super (J). */
export type WakeCategory = 'L' | 'M' | 'H' | 'J';

export interface SequenceQuestion {
  mode: 'sequence';
  prompt: string;
  /** Inline reminder shown to easy/medium players. */
  instruments?: string;
  /** Aircraft IDs in the correct landing order. On Easy/Medium that's just
   *  ETA-sorted; on Hard wake spacing may force one swap. */
  correctOrder: string[];
  /** Plain-English correct answer (used in recap). */
  answer: string;
  explanation: string;
  scenario: SequenceScenario;
  /** Easy mode: live-outline the correct blip the moment the player picks. */
  showAnswerHint: boolean;
  /** Default speed-vector minutes shown on the scope. Player can still toggle. */
  defaultVectorMin: number;
  /** Wake category per aircraft id. Populated only when Hard mode shows the
   *  badge; an empty/undefined map means "ignore wake" (Easy/Medium). */
  wakes?: Record<string, WakeCategory>;
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

const WAKE_LABEL: Record<WakeCategory, string> = { L: 'Light', M: 'Medium', H: 'Heavy', J: 'Super' };

/** Required wake separation (nm) for trailer behind leader. RECAT-EU-ish.
 *  Returns the radar minimum (3 nm) when no wake category dominates. */
function wakeSepNm(leader: WakeCategory, trailer: WakeCategory): number {
  if (leader === 'J') return trailer === 'L' ? 8 : trailer === 'M' ? 7 : trailer === 'H' ? 6 : 3;
  if (leader === 'H') return trailer === 'L' ? 6 : trailer === 'M' ? 5 : 3;
  if (leader === 'M') return trailer === 'L' ? 4 : 3;
  return 3;
}

interface BuildOpts { difficulty: Difficulty; rng: Rng; }

interface AcSpec {
  id: string;
  callsign: string;
  etaSec: number;
  speedKt: number;
  distanceNm: number;
  wake: WakeCategory;
}

/** Actual gap (nm) between two aircraft at the threshold given their ETAs and
 *  the trailer's ground speed. Used to decide whether wake spacing is met. */
function gapAtThresholdNm(leaderEtaSec: number, trailerEtaSec: number, trailerSpeedKt: number): number {
  return ((trailerEtaSec - leaderEtaSec) / 3600) * trailerSpeedKt;
}

/** True if `order` (an array of ids) keeps wake spacing at every adjacent pair
 *  given the per-id specs. */
function orderRespectsWake(order: string[], specs: Record<string, AcSpec>): boolean {
  for (let i = 0; i < order.length - 1; i++) {
    const lead = specs[order[i]];
    const trail = specs[order[i + 1]];
    const gap = gapAtThresholdNm(lead.etaSec, trail.etaSec, trail.speedKt);
    const required = wakeSepNm(lead.wake, trail.wake);
    if (gap < required) return false;
  }
  return true;
}

/** Pick wake categories for `count` aircraft so that ETA-order respects wake
 *  spacing — used by Easy/Medium. Mostly Medium with the odd Heavy. */
function pickEasyWakes(count: number, rng: Rng): WakeCategory[] {
  // 70% Medium, 30% Heavy. No Lights or Supers — they're the ones that create
  // forced swaps, which Easy/Medium shouldn't have.
  return Array.from({ length: count }, () => (rng() < 0.7 ? 'M' : 'H'));
}

/** Build a Hard scenario with exactly one wake-forced swap relative to ETA
 *  order. Returns the per-aircraft spec list (in ETA order) plus the
 *  swap-pair indices (i, i+1) for the explanation. */
function buildHardSpecs(rng: Rng): { specs: AcSpec[]; swapAt: number } | null {
  const count = 4;
  // Comfortable ETA spread: 45–60s gaps. Difficulty is wake reasoning, not arithmetic.
  const baseEta = 200 + Math.floor(rng() * 40);
  const etas = [baseEta];
  for (let i = 1; i < count; i++) etas.push(etas[i - 1] + 45 + Math.floor(rng() * 16));

  // Tight speed band: 190–250 kt (matches medium). Removes long-division headache.
  const speeds = Array.from({ length: count }, () => 190 + Math.floor(rng() * 60));

  // Pick the swap pair index (0..count-2). Avoid the last position so a third
  // aircraft can witness that the swap doesn't ripple.
  const swapAt = Math.floor(rng() * (count - 1));

  // Pick wakes such that pair (swapAt, swapAt+1) violates in ETA order, the
  // swap fixes that pair, and no other adjacency in either order violates.
  // Strategy: pick a leader/trailer wake combo from a hand list of "forces a
  // swap" pairs, then fill remaining slots with neutral wakes (Medium).
  const FORCED_PAIRS: Array<{ lead: WakeCategory; trail: WakeCategory }> = [
    { lead: 'H', trail: 'L' }, // Heavy then Light: needs 6 nm
    { lead: 'J', trail: 'M' }, // Super then Medium: needs 7 nm
    { lead: 'J', trail: 'L' }, // Super then Light: needs 8 nm
    { lead: 'H', trail: 'M' }, // Heavy then Medium: needs 5 nm (only forces if gap is <5)
  ];

  for (let attempt = 0; attempt < 20; attempt++) {
    const pair = FORCED_PAIRS[Math.floor(rng() * FORCED_PAIRS.length)];
    const wakes: WakeCategory[] = Array.from({ length: count }, () => 'M');
    wakes[swapAt] = pair.lead;
    wakes[swapAt + 1] = pair.trail;

    const specs: AcSpec[] = etas.map((eta, i) => ({
      id: `ac-${i}`,
      callsign: '', // filled later
      etaSec: eta,
      speedKt: speeds[i],
      distanceNm: (speeds[i] * eta) / 3600,
      wake: wakes[i],
    }));
    const ids = specs.map((s) => s.id);
    const recordSpecs: Record<string, AcSpec> = Object.fromEntries(specs.map((s) => [s.id, s]));

    // Natural order must violate exactly at the swap pair.
    const naturalGap = gapAtThresholdNm(specs[swapAt].etaSec, specs[swapAt + 1].etaSec, specs[swapAt + 1].speedKt);
    const naturalReq = wakeSepNm(pair.lead, pair.trail);
    if (naturalGap >= naturalReq) continue; // pair didn't violate — try another combo

    // Build the swapped order and confirm it's clean end-to-end.
    const swappedIds = [...ids];
    [swappedIds[swapAt], swappedIds[swapAt + 1]] = [swappedIds[swapAt + 1], swappedIds[swapAt]];
    if (!orderRespectsWake(swappedIds, recordSpecs)) continue;

    // Make sure no *other* adjacency in ETA order is violating (otherwise the
    // problem isn't a single swap).
    let otherViolation = false;
    for (let i = 0; i < ids.length - 1; i++) {
      if (i === swapAt) continue;
      const g = gapAtThresholdNm(specs[i].etaSec, specs[i + 1].etaSec, specs[i + 1].speedKt);
      if (g < wakeSepNm(specs[i].wake, specs[i + 1].wake)) { otherViolation = true; break; }
    }
    if (otherViolation) continue;

    return { specs, swapAt };
  }
  return null;
}

export function buildSequenceQuestion({ difficulty, rng }: BuildOpts): SequenceQuestion {
  const airport = pick(airportPool(), rng);
  const runway = longestPavedRunway(airport);
  const finalCourse = runway.he.headingDegT;
  const threshold = geoToScope({ lat: airport.lat, lon: airport.lon }, { lat: runway.he.lat, lon: runway.he.lon });
  const rangeNm = 40;

  const count = difficulty === 'hard' ? 4 : 3;

  let specs: AcSpec[];
  let swapAt = -1;
  if (difficulty === 'hard') {
    const built = buildHardSpecs(rng);
    if (built) {
      specs = built.specs;
      swapAt = built.swapAt;
    } else {
      // Fallback: synthesise a clean ETA-order scenario if the constraint
      // search exhausts itself. Better to ship a solvable round than stall.
      specs = synthClean(count, rng);
    }
  } else {
    specs = synthClean(count, rng);
  }

  // Fill callsigns now that the spec set is fixed.
  for (const s of specs) s.callsign = genCallsign(rng);

  // Place each aircraft on a distinct bearing around the FAF so the scope
  // reads as a real arrival push, not a parade on final. Bearings span ±60°
  // off the reciprocal final course.
  const aircraftList: Aircraft[] = [];
  const baseBearing = (finalCourse + 180) % 360;
  const wakes: Record<string, WakeCategory> = {};
  specs.forEach((s, i) => {
    const offsetDeg = (rng() - 0.5) * 120;
    const bearing = (baseBearing + offsetDeg + 360) % 360;
    const r = bearing * DEG2RAD;
    const pos = {
      x: threshold.x + Math.sin(r) * s.distanceNm,
      y: threshold.y - Math.cos(r) * s.distanceNm,
    };
    const towardThresholdDeg = (Math.atan2(threshold.x - pos.x, -(threshold.y - pos.y)) * 180 / Math.PI + 360) % 360;
    aircraftList.push({
      id: s.id,
      callsign: s.callsign,
      pos,
      heading: towardThresholdDeg,
      altitude: 5000 + i * 1000 + Math.floor(rng() * 500),
      speed: s.speedKt,
    });
    wakes[s.id] = s.wake;
  });

  const etaOrder = [...specs].sort((a, b) => a.etaSec - b.etaSec).map((s) => s.id);
  let correctOrderIds: string[];
  if (difficulty === 'hard' && swapAt >= 0) {
    correctOrderIds = [...etaOrder];
    [correctOrderIds[swapAt], correctOrderIds[swapAt + 1]] = [correctOrderIds[swapAt + 1], correctOrderIds[swapAt]];
  } else {
    correctOrderIds = etaOrder;
  }

  const csById = Object.fromEntries(specs.map((s) => [s.id, s.callsign]));
  const answer = correctOrderIds.map((id) => csById[id]).join(' → ');

  // Recap shows the math; the round itself does not. Hard mode also explains
  // the wake reason for the swap, so the player learns *why* this isn't ETA.
  let explanation: string;
  if (difficulty === 'hard' && swapAt >= 0) {
    const recordSpecs: Record<string, AcSpec> = Object.fromEntries(specs.map((s) => [s.id, s]));
    const leadId = etaOrder[swapAt];
    const trailId = etaOrder[swapAt + 1];
    const lead = recordSpecs[leadId];
    const trail = recordSpecs[trailId];
    const gap = gapAtThresholdNm(lead.etaSec, trail.etaSec, trail.speedKt);
    const required = wakeSepNm(lead.wake, trail.wake);
    explanation = `${trail.callsign} (${WAKE_LABEL[trail.wake]}) reaches the threshold ~${Math.round(trail.etaSec - lead.etaSec)} s after ${lead.callsign} (${WAKE_LABEL[lead.wake]}) — only ${gap.toFixed(1)} nm apart, but ${WAKE_LABEL[trail.wake]} behind ${WAKE_LABEL[lead.wake]} needs ${required} nm. Land ${trail.callsign} first; ${lead.callsign} (${WAKE_LABEL[lead.wake]}) only needs ${wakeSepNm(trail.wake, lead.wake)} nm behind ${WAKE_LABEL[trail.wake]}.`;
  } else {
    const sortedSpecs = [...specs].sort((a, b) => a.etaSec - b.etaSec);
    explanation = `Earliest to cross the threshold lands first. Order: ${sortedSpecs
      .map((s) => `${s.callsign} (${s.distanceNm.toFixed(1)} nm @ ${s.speedKt} kt → ETA ${fmtEta(s.etaSec)})`)
      .join(', ')}.`;
  }

  const showInstruments = difficulty !== 'hard';
  const instruments = showInstruments
    ? `Sequence ${count} inbounds for ${runway.he.ident || 'the runway'} by landing order. Tap blips on the scope.`
    : `Sequence ${count} inbounds for ${runway.he.ident || 'the runway'}. Wake categories shown — wake spacing can override pure ETA.`;

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
    correctOrder: correctOrderIds,
    answer,
    explanation,
    scenario,
    showAnswerHint: difficulty === 'easy',
    defaultVectorMin,
    wakes: difficulty === 'hard' ? wakes : undefined,
  };
}

/** Synthesise a clean (ETA-order = correct-order) spec set for non-hard or as
 *  a fallback when hard-spec search fails. Matches medium's old characteristics. */
function synthClean(count: number, rng: Rng): AcSpec[] {
  const etaGapSec = 45 + rng() * 20;
  const baseEta = 200 + Math.floor(rng() * 60);
  const wakes = pickEasyWakes(count, rng);
  return Array.from({ length: count }, (_, i) => {
    const speedKt = 190 + Math.floor(rng() * 60);
    const etaSec = baseEta + i * etaGapSec;
    return {
      id: `ac-${i}`,
      callsign: '',
      etaSec,
      speedKt,
      distanceNm: (speedKt * etaSec) / 3600,
      wake: wakes[i],
    };
  });
}

export function buildSequenceRound(difficulty: Difficulty, rng: Rng = defaultRng()): SequenceQuestion[] {
  return Array.from({ length: SEQUENCE_ROUND_LENGTH }, () => buildSequenceQuestion({ difficulty, rng }));
}
