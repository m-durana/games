// Shared scenario-builder for Radar Intercepts. Lives in its own file to keep
// `intercepts.ts` (which imports templates) and `intercept-questions.ts` (which
// imports this helper) free of circular dependencies.

import type { Aircraft } from 'radarscope';
import { geoToScope, type Approach, type RealAirport, type RealRunway, type RealRunwayEnd } from 'radarscope/data';
import { airlines, airlineMeta } from './engine';
import type { InterceptScenario, InterceptState } from './intercepts-types';
import { airportRunwaysToScope } from './scope-runways';

const DEG2RAD = Math.PI / 180;

export interface ApproachContext {
  approach: Approach;
  airport: RealAirport;
  /** Parent runway of the approach end (used to flag the active runway). */
  runway: RealRunway;
  runwayEnd: RealRunwayEnd;
  reciprocalDesignator?: string;
}

export interface ScenarioParams {
  range: number;
  altitude: number;
  speed: number;
  windFrom: number;
  windKt: number;
  customPos?: { x: number; y: number };
  customHeading?: number;
}

type Rng = () => number;

function pick<T>(arr: T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)];
}

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

export function genCallsign(rng: Rng): string {
  const spec = pick(callsignPool(), rng);
  const num = 100 + Math.floor(rng() * 900);
  return `${spec.word}${num}`;
}

function headingToVec(h: number, len: number): { x: number; y: number } {
  const r = h * DEG2RAD;
  return { x: Math.sin(r) * len, y: -Math.cos(r) * len };
}

function onCenterline(threshold: { x: number; y: number }, finalCourse: number, nm: number): { x: number; y: number } {
  const reciprocal = (finalCourse + 180) % 360;
  const v = headingToVec(reciprocal, nm);
  return { x: threshold.x + v.x, y: threshold.y + v.y };
}

export function buildScenario(ctx: ApproachContext, params: ScenarioParams, rng: Rng): InterceptScenario {
  const airport = ctx.airport;
  const center = { lat: airport.lat, lon: airport.lon };
  const threshold = geoToScope(center, ctx.runwayEnd);
  const finalCourse = ctx.approach.finalCourseT;
  const acPos = params.customPos ?? onCenterline(threshold, finalCourse, params.range);
  const callsign = genCallsign(rng);

  const aircraft: Aircraft = {
    id: 'ac-self',
    callsign,
    pos: acPos,
    heading: params.customHeading ?? finalCourse,
    altitude: params.altitude,
    speed: params.speed,
  };

  const state: InterceptState = {
    callsign,
    rangeNm: params.range,
    altitudeFt: params.altitude,
    speedKt: params.speed,
    windFrom: params.windFrom,
    windKt: params.windKt,
    finalCourseT: finalCourse,
    runwayDesignator: ctx.approach.runway,
    reciprocalRunway: ctx.reciprocalDesignator,
  };

  return {
    airportName: airport.name,
    airportIata: airport.iata || airport.icao,
    airportIcao: airport.icao,
    approachName: ctx.approach.name,
    aircraft: [aircraft],
    runways: airportRunwaysToScope(airport, ctx.runway),
    wind: { from: params.windFrom, kt: params.windKt },
    rangeNm: 25,
    state,
  };
}
