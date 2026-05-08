// Shared approach-scenario type + builder used by all Intercept phases
// (Stable/GA, At Minimums, FMA Watch, Fly the Diamonds). Sources real
// airport + ILS approach data from `radarscope/data` and shapes it for the
// PFD widget set in `radarscope/instruments`.
//
// Spec reference: docs/potential-intercept-mode.md

import { allApproaches, findAirportByIcao, type Approach, type RealAirport, type RealRunwayEnd } from 'radarscope/data';
import type { FmaState } from 'radarscope/instruments';
import type { Difficulty } from './types';

export type { FmaState };

export type Rng = () => number;

export const STABILIZATION_GATES = [
  'speed',     // VREF .. VREF+20
  'sink',      // ≤ 1000 fpm
  'loc',       // within 1 dot
  'gs',        // within 1 dot
  'config',    // gear+flaps landing
  'thrust',    // not idle, not max
] as const;
export type Gate = typeof STABILIZATION_GATES[number];

export interface ApproachWeather {
  /** Visibility in metres (RVR proxy). Lower = worse. */
  rvrM: number;
  /** Cloud ceiling AGL. */
  ceilingFt: number;
  /** Wind FROM, true degrees. */
  windFromT: number;
  windKt: number;
}

export interface AircraftState {
  /** Indicated airspeed, kt. */
  ias: number;
  /** Reference landing speed, kt. */
  vref: number;
  /** Pressure altitude, ft MSL. */
  alt: number;
  /** Above-ground level, ft. */
  agl: number;
  /** Fpm (negative = descending). */
  fpm: number;
  /** Heading, deg true. */
  hdg: number;
  /** Pitch, deg (positive = nose up). */
  pitch: number;
  /** Roll, deg (positive = right wing down). */
  roll: number;
  /** Localizer deviation, dots. Positive = needle right (you are left of course). */
  locDots: number;
  /** Glideslope deviation, dots. Positive = needle up (you are below path). */
  gsDots: number;
  /** Landing config flag. */
  landingConfig: boolean;
  /** Thrust setting [0..1]. 0 = idle, 1 = max. Stable band ≈ 0.4..0.85. */
  thrust: number;
}

export interface ApproachIls {
  /** ILS frequency MHz, just for label. */
  locFreqMhz?: number;
  /** Glideslope angle, deg (typically 3.0). */
  gsAngleDeg: number;
  /** DME at threshold, nm. */
  dmeNm?: number;
}

export interface ApproachScenario {
  /** Source airport. */
  airport: { icao: string; iata: string; name: string };
  /** Destination runway end (the approach we're flying). */
  runway: { ident: string; headingT: number; elevationFt: number };
  /** Plain-English approach name (e.g. "ILS RWY 27L"). */
  approachName: string;
  ils: ApproachIls;
  weather: ApproachWeather;
  aircraft: AircraftState;
  fma: FmaState;
  /** AP engagement state. */
  ap: 'CMD' | 'FD' | null;
  /** Optional sub-text on AP annunciator (e.g. "LNAV/VNAV"). */
  apSub?: string;
  /** Selected altitude bug, ft. */
  selectedAlt?: number;
  /** Selected speed bug, kt. */
  selectedSpeed?: number;
  /** Decision altitude (baro), ft MSL. */
  daBaroFt?: number;
  /** Decision height, ft AGL — used for displays + gating. */
  decisionHeightFt: number;
  /** Approach category label, e.g. "CAT I", "CAT II", "CAT IIIb". */
  cat: 'I' | 'II' | 'IIIa' | 'IIIb';
}

export interface ApproachContext {
  approach: Approach;
  airport: RealAirport;
  runwayEnd: RealRunwayEnd;
}

let cachedContexts: ApproachContext[] | null = null;
export function approachContexts(): ApproachContext[] {
  if (cachedContexts) return cachedContexts;
  const out: ApproachContext[] = [];
  for (const ap of allApproaches()) {
    const airport = findAirportByIcao(ap.airport);
    if (!airport) continue;
    let end: RealRunwayEnd | null = null;
    for (const rw of airport.runways) {
      if (rw.le.ident === ap.runway) { end = rw.le; break; }
      if (rw.he.ident === ap.runway) { end = rw.he; break; }
    }
    if (!end) continue;
    out.push({ approach: ap, airport, runwayEnd: end });
  }
  cachedContexts = out;
  return out;
}

export function pickContext(rng: Rng): ApproachContext {
  const ctxs = approachContexts();
  if (ctxs.length === 0) throw new Error('No approach contexts available.');
  return ctxs[Math.floor(rng() * ctxs.length)];
}

/** Standard 3° glideslope mapping: 1 nm ≈ 318 ft. */
export function glidepathFt(distNm: number, angleDeg = 3): number {
  return distNm * 6076 * Math.tan((angleDeg * Math.PI) / 180);
}

/** Pick a CAT level appropriate to the difficulty. CAT I dominates Easy; CAT IIIb only at Hard. */
export function pickCat(difficulty: Difficulty, rng: Rng): ApproachScenario['cat'] {
  if (difficulty === 'easy') return 'I';
  if (difficulty === 'medium') return rng() < 0.5 ? 'I' : 'II';
  // hard: full mix, IIIb less frequent because it's a different kind of decision (FMA-driven)
  const r = rng();
  if (r < 0.4) return 'I';
  if (r < 0.7) return 'II';
  if (r < 0.85) return 'IIIa';
  return 'IIIb';
}

export function decisionHeightFor(cat: ApproachScenario['cat']): number {
  switch (cat) {
    case 'I': return 200;
    case 'II': return 100;
    case 'IIIa': return 50;
    case 'IIIb': return 25;
  }
}

/** Build a baseline "stable everything" state at ~1000 ft AGL. Phase builders
 *  perturb fields away from this baseline. */
export function baselineAtThousand(ctx: ApproachContext, rng: Rng): { scenario: Omit<ApproachScenario, 'cat' | 'decisionHeightFt'>, vref: number } {
  const fc = ctx.approach.finalCourseT;
  const elev = ctx.runwayEnd.elevationFt ?? ctx.airport.elevationFt ?? 0;
  const agl = 1000;
  const alt = elev + agl;
  // Stable approach speed: VREF .. VREF+10 typical at 1000 ft
  const vref = 130 + Math.floor(rng() * 25); // 130..155
  const ias = vref + 5 + Math.floor(rng() * 6); // VREF+5..VREF+10
  const fpm = -700 - Math.floor(rng() * 100); // -700..-800 fpm (stable for 3°)
  const hdg = fc;
  const pitch = -1 + (rng() - 0.5) * 0.6;
  const roll = (rng() - 0.5) * 1.5;
  const locDots = (rng() - 0.5) * 0.4; // ±0.2 dots
  const gsDots = (rng() - 0.5) * 0.4;
  const windFrom = (fc + (rng() - 0.5) * 60 + 360) % 360; // mostly down-runway-ish
  const windKt = Math.floor(rng() * 12); // 0..11 kt
  const fma: FmaState = { at: 'SPEED', lat: 'LOC', vert: 'G/S', app: 'ILS' };
  const scenario: Omit<ApproachScenario, 'cat' | 'decisionHeightFt'> = {
    airport: { icao: ctx.airport.icao, iata: ctx.airport.iata, name: ctx.airport.name },
    runway: { ident: ctx.runwayEnd.ident, headingT: fc, elevationFt: elev },
    approachName: ctx.approach.name,
    ils: { gsAngleDeg: 3.0, dmeNm: 4 },
    weather: { rvrM: 800 + Math.floor(rng() * 1500), ceilingFt: 600 + Math.floor(rng() * 800), windFromT: Math.round(windFrom), windKt },
    aircraft: { ias, vref, alt, agl, fpm, hdg, pitch, roll, locDots, gsDots, landingConfig: true, thrust: 0.55 + (rng() - 0.5) * 0.2 },
    fma,
    ap: 'CMD',
    apSub: 'LNAV/VNAV',
    // Missed-approach climb-to altitude (typical 4000 ft AGL).
    selectedAlt: elev + 4000,
    selectedSpeed: vref,
    daBaroFt: elev + 200,
  };
  return { scenario, vref };
}
