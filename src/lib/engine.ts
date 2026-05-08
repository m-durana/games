import airlinesData from '../data/airlines.json';
import logoFlagsData from '../data/logo-flags.json';
import airportsData from '../data/airports.json';
import airportMetaData from '../data/airport-meta.json';
import metaData from '../data/airline-meta.json';
import tailsData from '../data/tails.json';
import airportRoutesData from '../data/airport-routes.json';
import airlineRoutesData from '../data/airline-routes.json';
import type { Airline, AirlineMeta, Difficulty, HistoryEntry, Mode, Question, Settings } from './types';

export const airlines = airlinesData as Airline[];

export type Pool = 'all' | 'us' | 'us_eu';
const POOL_KEY = 'pool';
export function loadPool(): Pool {
  if (typeof localStorage === 'undefined') return 'all';
  const raw = localStorage.getItem(POOL_KEY);
  if (raw === 'us' || raw === 'us_eu' || raw === 'all') return raw;
  return 'all';
}
export function savePool(p: Pool) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(POOL_KEY, p);
}

// Western Europe - used for the "US + Europe" pool. Russia is intentionally
// excluded so the pool reads as a Western/NATO-aligned grouping (consistent
// with how the military origin buckets treat Russia as its own bloc).
export const EU_COUNTRIES = new Set([
  'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czech Republic',
  'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary',
  'Iceland', 'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta',
  'Netherlands', 'Norway', 'Poland', 'Portugal', 'Romania', 'Serbia',
  'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland', 'Turkey',
  'Ukraine', 'United Kingdom',
]);

export function poolCountryFilter(country: string): boolean {
  const p = loadPool();
  if (p === 'all') return true;
  if (p === 'us') return country === 'United States';
  return country === 'United States' || EU_COUNTRIES.has(country);
}

export function pooledAirlines(): Airline[] {
  return airlines.filter((a) => poolCountryFilter(a.country));
}
const airports = airportsData as Record<string, string>;
const airportCountry = airportMetaData as Record<string, string>;

// IATAs allowed by the current pool — used to keep distractors on-pool so
// US-only doesn't surface Canadian/Mexican airports as decoys, etc.
function pooledAirportSet(): Set<string> {
  const p = loadPool();
  const out = new Set<string>();
  for (const code in airports) {
    const c = airportCountry[code];
    if (!c) continue;
    if (p === 'all') out.add(code);
    else if (p === 'us' && c === 'United States') out.add(code);
    else if (p === 'us_eu' && (c === 'United States' || EU_COUNTRIES.has(c))) out.add(code);
  }
  return out;
}

function airportsByCountry(country: string): string[] {
  const out: string[] = [];
  for (const code in airportCountry) {
    if (airportCountry[code] === country && airports[code]) out.push(code);
  }
  return out;
}

function airportsBySameRegion(country: string): string[] {
  const region = REGIONS[country];
  if (!region) return [];
  const out: string[] = [];
  for (const code in airportCountry) {
    const c = airportCountry[code];
    if (c !== country && REGIONS[c] === region && airports[code]) out.push(code);
  }
  return out;
}
const meta = metaData as Record<string, AirlineMeta>;

interface AirportRouteEntry {
  topAirlines?: string[];
  topDestinations?: string[];
  year?: number;
  source?: string;
  sourceUrl?: string;
  destinationRanked?: boolean;
  destinationMetric?: string;
  destinationBasis?: string;
  airlinesUnranked?: boolean;
}
interface AirlineRouteEntry {
  topDestinations?: string[];
  year?: number;
  source?: string;
  sourceUrl?: string;
  serviceSource?: string;
  serviceSourceUrl?: string;
  metric?: string;
  basis?: string;
  confidence?: string;
}
const airportRoutesMap = airportRoutesData as Record<string, AirportRouteEntry>;
const airlineRoutesMap = airlineRoutesData as Record<string, AirlineRouteEntry>;

export function airportRoutes(iata: string): AirportRouteEntry | null {
  return airportRoutesMap[iata] ?? null;
}
export function airlineRoutes(iata: string): AirlineRouteEntry | null {
  return airlineRoutesMap[iata] ?? null;
}

function hasRankedAirportDestinations(r: AirportRouteEntry | null): r is AirportRouteEntry {
  return !!r && r.destinationRanked === true && Array.isArray(r.topDestinations) && r.topDestinations.length >= 3;
}

export interface TailCrop { x: number; y: number; w: number; h: number }
export interface TailEntry { url: string; thumb?: string; title?: string; crop?: TailCrop }
const tails = tailsData as Record<string, TailEntry>;

export function hasTail(iata: string): boolean {
  return !!tails[iata];
}

export function tailEntry(iata: string): TailEntry | null {
  return tails[iata] ?? null;
}

export function tailUrl(iata: string): string | null {
  const t = tails[iata];
  if (!t) return null;
  return t.thumb ?? t.url;
}

export function tailCount(): number {
  return Object.keys(tails).length;
}

export function airlineMeta(iata: string): AirlineMeta {
  return meta[iata] ?? {};
}

export const ROUND_LENGTH = 10;

const INDEPENDENT = 'Independent';

export const ALLIANCE_ORDER: string[] = ['Star Alliance', 'Oneworld', 'SkyTeam', INDEPENDENT];

export function airportName(iata: string): string {
  return airports[iata] ?? iata;
}

export function airportLabel(iata: string): string {
  const n = airports[iata];
  return n ? `${n} · ${iata}` : iata;
}

export function airportLabelWithCountry(iata: string): string {
  const n = airports[iata];
  const country = airportCountry[iata];
  if (n && country) return `${n} · ${iata} · ${country}`;
  if (n) return `${n} · ${iata}`;
  return iata;
}

// Tier 1 = truly globally mass-market flag carriers and dominant low-cost
// brands. The kind of airline a casual traveller would recognize unprompted.
// Tightened: regional/national champions with limited global recognition were
// moved to Tier 2 (Aeromexico, IndiGo, Eurowings, Air Indians, Aeroflot,
// Ethiopian, Spirit, Frontier, etc.).
const TIER_1 = new Set([
  'LH', 'BA', 'AF', 'KL', 'AA', 'DL', 'UA', 'B6', 'WN', 'AS',
  'AC', 'EK', 'QR', 'SQ', 'CX', 'JL', 'NH', 'KE', 'QF',
  'TK', 'FR', 'U2', 'IB', 'AY',
]);

// Tier 3 = the genuinely obscure end: regional carriers, country-only
// flag carriers most international audiences won't recognize, niche LCCs.
// Expanded so Hard mode is meaningfully harder than Medium.
const TIER_3 = new Set([
  // Original Tier 3 picks (regional / niche)
  'MQ', 'OH', 'PT', '9E', 'LV', 'JU', 'OK', 'OU', 'MK', 'WB',
  'KU', 'GF', 'KC', 'HY', 'J2', 'FJ', 'QH', 'VJ', '5J', 'LS',
  'PD', 'VB', 'AD', 'SY', 'G4', 'BY', 'A3', 'FI', 'UL', 'AT',
  'LY', 'RJ', 'WY', 'SV', 'FZ',
  // Promoted from Tier 1/2 to make Hard actually hard:
  '6E', 'AZ', 'VY', 'NK', 'F9', 'AM', 'CA', 'MU', 'CZ', 'TG',
  'SU', 'ET', 'TP', 'EW',
]);

function tier(a: Airline): 1 | 2 | 3 {
  if (TIER_1.has(a.iata)) return 1;
  if (TIER_3.has(a.iata)) return 3;
  return 2;
}

export function pool(difficulty: Difficulty): Airline[] {
  return pooledAirlines().filter((a) => {
    const t = tier(a);
    if (difficulty === 'easy') return t === 1;
    if (difficulty === 'medium') return t <= 2;
    // Hard: only Tier 3 (obscure airlines). Previously hard was "all tiers",
    // which made it the same content as medium plus a few extras. Now it's
    // genuinely harder - every answer is from the obscure pool.
    return t === 3;
  });
}

// --- RNG ---------------------------------------------------------------

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function defaultRng(): Rng {
  return Math.random;
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick<T>(arr: T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)];
}

function groupOptions(answer: string, distractors: string[], rng: Rng): string[] {
  const options = shuffle([answer, ...distractors], rng);
  return [
    ...options.filter((o) => o !== INDEPENDENT),
    ...options.filter((o) => o === INDEPENDENT),
  ];
}

// --- Question construction --------------------------------------------

function answerFor(airline: Airline, mode: Mode): string {
  if (mode === 'group') return airline.group ?? INDEPENDENT;
  if (mode === 'alliance') return airline.alliance ?? INDEPENDENT;
  if (mode === 'hub') return airline.hub;
  if (mode === 'country') return airline.country;
  // The route-based modes are special-cased entirely in buildQuestion (the answer
  // there depends on a randomly-picked top-3 entry, not on the airline alone).
  // Returning '' here is fine - buildQuestion never falls through to this for them.
  if (mode === 'airportAirline' || mode === 'airlineDest' || mode === 'airportConn') return '';
  // mode === 'logo' or 'reverseGroup' or 'tail' or 'code': answer is the airline name
  return airline.name;
}

function airlineNameByIata(iata: string): string {
  const a = airlines.find((x) => x.iata === iata);
  return a ? a.name : iata;
}

function airlineByIata(iata: string): Airline | null {
  return airlines.find((x) => x.iata === iata) ?? null;
}

function optionPool(mode: Mode, sourcePool: Airline[]): string[] {
  const set = new Set<string>();
  if (mode === 'airportAirline') {
    // Pool of airline IATA codes (from full airlines list, not just sourcePool,
    // so distractors aren't artificially shrunk by the difficulty filter).
    for (const a of airlines) set.add(a.iata);
    return [...set];
  }
  if (mode === 'airlineDest' || mode === 'airportConn') {
    // Pool of airport IATA codes - use airports we know about.
    for (const code in airports) set.add(code);
    return [...set];
  }
  for (const a of sourcePool) {
    if (mode === 'group') {
      if (a.group) set.add(a.group);
    } else if (mode === 'alliance') {
      if (a.alliance) set.add(a.alliance);
    } else if (mode === 'hub') {
      set.add(a.hub);
    } else if (mode === 'country') {
      set.add(a.country);
    } else {
      set.add(a.name);
    }
  }
  if (mode === 'group' || mode === 'alliance') set.add(INDEPENDENT);
  return [...set];
}

function distractorCount(mode: Mode): number {
  if (mode === 'group' || mode === 'reverseGroup') return 5;
  return 3;
}

function smartDistractors(
  airline: Airline,
  mode: Mode,
  sourcePool: Airline[],
  fallbackPool: string[],
  rng: Rng,
): string[] {
  const answer = answerFor(airline, mode);
  const n = distractorCount(mode);
  if (mode === 'logo' || mode === 'tail' || mode === 'code') {
    const same = sourcePool.filter(
      (a) => a.iata !== airline.iata && (a.alliance === airline.alliance || a.country === airline.country),
    );
    const names = shuffle(same.map((a) => a.name), rng);
    const out = names.slice(0, n);
    if (out.length < n) {
      const extra = shuffle(fallbackPool.filter((x) => x !== answer && !out.includes(x)), rng).slice(0, n - out.length);
      out.push(...extra);
    }
    return out;
  }
  if (mode === 'reverseGroup') {
    const others = sourcePool.filter((a) => a.iata !== airline.iata && a.group !== airline.group);
    const names = shuffle(others.map((a) => a.name), rng);
    return names.slice(0, n);
  }
  if (mode === 'hub') {
    // Distractors: other airports in the same country, then same region, then anywhere.
    // Keep distractors inside the active pool so US-only doesn't surface CA/MX/etc.
    const ok = pooledAirportSet();
    const sameCountryAps = shuffle(airportsByCountry(airline.country).filter((c) => c !== answer && ok.has(c)), rng);
    const sameRegionAps = shuffle(airportsBySameRegion(airline.country).filter((c) => c !== answer && ok.has(c)), rng);
    const out: string[] = [];
    for (const code of sameCountryAps) {
      if (!out.includes(code)) out.push(code);
      if (out.length === n) return out;
    }
    for (const code of sameRegionAps) {
      if (!out.includes(code)) out.push(code);
      if (out.length === n) return out;
    }
    const extra = shuffle(fallbackPool.filter((x) => x !== answer && !out.includes(x) && ok.has(x)), rng).slice(0, n - out.length);
    return [...out, ...extra];
  }
  if (mode === 'country') {
    const region = regionOf(airline.country);
    const sameRegion = region
      ? sourcePool.filter((a) => a.iata !== airline.iata && regionOf(a.country) === region && a.country !== airline.country)
      : [];
    const sameAlliance = airline.alliance
      ? sourcePool.filter((a) => a.iata !== airline.iata && a.alliance === airline.alliance && a.country !== airline.country)
      : [];
    const ranked = [...shuffle(sameRegion, rng), ...shuffle(sameAlliance, rng)];
    const out: string[] = [];
    for (const a of ranked) {
      if (a.country !== answer && !out.includes(a.country)) out.push(a.country);
      if (out.length === n) return out;
    }
    const extra = shuffle(fallbackPool.filter((x) => x !== answer && !out.includes(x)), rng).slice(0, n - out.length);
    return [...out, ...extra];
  }
  return shuffle(fallbackPool.filter((p) => p !== answer), rng).slice(0, n);
}

function buildQuestion(
  airline: Airline,
  mode: Mode,
  sourcePool: Airline[],
  fallbackPool: string[],
  difficulty: Difficulty,
  rng: Rng,
): Question {
  const answer = answerFor(airline, mode);
  if (mode === 'alliance') {
    return { mode, airline, options: [...ALLIANCE_ORDER], answer };
  }
  if (mode === 'airportAirline') {
    const airportIata = airline.hub;
    const r = airportRoutes(airportIata)!;
    // Avoid trivial answers: don't pick the hub carrier itself as the correct
    // answer if the top list contains other carriers.
    const topRaw = (r.topAirlines ?? []).slice(0, 3);
    const topFiltered = topRaw.filter((x) => x !== airline.iata);
    const top = topFiltered.length > 0 ? topFiltered : topRaw;
    const correct = pick(top, rng);
    const exclude = new Set(r.topAirlines ?? []);
    // Smart distractors: same alliance / same country first, then any airline.
    const sameAlliance = airline.alliance
      ? airlines.filter((x) => x.alliance === airline.alliance && !exclude.has(x.iata) && x.iata !== correct).map((x) => x.iata)
      : [];
    const sameCountry = airlines
      .filter((x) => x.country === airline.country && !exclude.has(x.iata) && x.iata !== correct)
      .map((x) => x.iata);
    const ranked = [...shuffle(sameAlliance, rng), ...shuffle(sameCountry, rng)];
    const distractors: string[] = [];
    for (const iata of ranked) {
      if (!distractors.includes(iata)) distractors.push(iata);
      if (distractors.length === 3) break;
    }
    if (distractors.length < 3) {
      const extra = shuffle(
        fallbackPool.filter((x) => !exclude.has(x) && x !== correct && !distractors.includes(x)),
        rng,
      ).slice(0, 3 - distractors.length);
      distractors.push(...extra);
    }
    return {
      mode,
      airline,
      airport: airportIata,
      options: shuffle([correct, ...distractors], rng),
      answer: correct,
    };
  }
  if (mode === 'airportConn') {
    const airportIata = airline.hub;
    const r = airportRoutes(airportIata)!;
    const top = r.topDestinations ?? [];
    const correct = top[0];
    const exclude = new Set(r.topDestinations ?? []);
    exclude.add(airportIata); // never offer the airport itself as a destination
    const ok = pooledAirportSet();
    const apCountry = airportCountry[airportIata];
    const region = apCountry ? REGIONS[apCountry] : undefined;
    const sameRegion = region
      ? Object.keys(airports).filter(
          (c) =>
            !exclude.has(c) &&
            c !== correct &&
            airportCountry[c] &&
            REGIONS[airportCountry[c]] === region &&
            ok.has(c),
        )
      : [];
    const ranked = shuffle(sameRegion, rng);
    const distractors: string[] = [];
    for (const code of ranked) {
      if (!distractors.includes(code)) distractors.push(code);
      if (distractors.length === 3) break;
    }
    if (distractors.length < 3) {
      const extra = shuffle(
        fallbackPool.filter((x) => !exclude.has(x) && x !== correct && !distractors.includes(x) && ok.has(x)),
        rng,
      ).slice(0, 3 - distractors.length);
      distractors.push(...extra);
    }
    return {
      mode,
      airline,
      airport: airportIata,
      options: shuffle([correct, ...distractors], rng),
      answer: correct,
    };
  }
  if (mode === 'airlineDest') {
    const r = airlineRoutes(airline.iata)!;
    const top = (r.topDestinations ?? []).slice(0, 3);
    const correct = top[0];
    const exclude = new Set(r.topDestinations ?? []);
    exclude.add(airline.hub); // hub isn't a meaningful "destination"
    const ok = pooledAirportSet();
    const region = REGIONS[airline.country];
    const sameRegion = region
      ? Object.keys(airports).filter(
          (c) =>
            !exclude.has(c) &&
            c !== correct &&
            airportCountry[c] &&
            REGIONS[airportCountry[c]] === region &&
            ok.has(c),
        )
      : [];
    const sameCountry = Object.keys(airports).filter(
      (c) => !exclude.has(c) && c !== correct && airportCountry[c] === airline.country && ok.has(c),
    );
    const ranked = [...shuffle(sameCountry, rng), ...shuffle(sameRegion, rng)];
    const distractors: string[] = [];
    for (const code of ranked) {
      if (!distractors.includes(code)) distractors.push(code);
      if (distractors.length === 3) break;
    }
    if (distractors.length < 3) {
      const extra = shuffle(
        fallbackPool.filter((x) => !exclude.has(x) && x !== correct && !distractors.includes(x) && ok.has(x)),
        rng,
      ).slice(0, 3 - distractors.length);
      distractors.push(...extra);
    }
    return {
      mode,
      airline,
      options: shuffle([correct, ...distractors], rng),
      answer: correct,
    };
  }
  if (mode === 'whereAmI') {
    const airportIata = airline.hub;
    const r = airportRoutes(airportIata)!;
    const showCount = difficulty === 'hard' ? 3 : difficulty === 'easy' ? 5 : 4;
    const destinations = (r.topDestinations ?? []).slice(0, showCount);
    const correct = airportIata;
    const ok = pooledAirportSet();
    const apCountry = airportCountry[airportIata];
    const region = apCountry ? REGIONS[apCountry] : undefined;
    const sameRegion = region
      ? Object.keys(airports).filter(
          (c) => c !== correct && airportCountry[c] && REGIONS[airportCountry[c]] === region && ok.has(c),
        )
      : [];
    const sameAlliance = airline.alliance
      ? sourcePool
          .filter((x) => x.iata !== airline.iata && x.alliance === airline.alliance && x.hub !== correct && airports[x.hub] && ok.has(x.hub))
          .map((x) => x.hub)
      : [];
    const ranked = difficulty === 'hard'
      ? [...shuffle(sameAlliance, rng), ...shuffle(sameRegion, rng)]
      : [...shuffle(sameRegion, rng)];
    const distractors: string[] = [];
    for (const code of ranked) {
      if (!distractors.includes(code) && code !== correct) distractors.push(code);
      if (distractors.length === 3) break;
    }
    if (distractors.length < 3) {
      const extra = shuffle(
        Object.keys(airports).filter((x) => x !== correct && !distractors.includes(x) && ok.has(x)),
        rng,
      ).slice(0, 3 - distractors.length);
      distractors.push(...extra);
    }
    return {
      mode,
      airline,
      airport: airportIata,
      options: shuffle([correct, ...distractors], rng),
      answer: correct,
      destinations,
      promptKind: 'destinations',
    };
  }
  if (mode === 'hubOf') {
    const airportIata = airline.hub;
    const r = airportRoutes(airportIata);
    const dominantIata = r?.topAirlines?.[0] ?? airline.iata;
    const dominant = airlineByIata(dominantIata) ?? airline;
    const correct = dominant.name;
    const sameAlliance = dominant.alliance
      ? airlines.filter((x) => x.iata !== dominant.iata && x.alliance === dominant.alliance)
      : [];
    const sameCountry = airlines.filter(
      (x) => x.iata !== dominant.iata && x.country === dominant.country && x.alliance !== dominant.alliance,
    );
    const ranked = [...shuffle(sameAlliance, rng), ...shuffle(sameCountry, rng)];
    const distractors: string[] = [];
    for (const x of ranked) {
      if (!distractors.includes(x.name) && x.name !== correct) distractors.push(x.name);
      if (distractors.length === 3) break;
    }
    if (distractors.length < 3) {
      const extra = shuffle(
        airlines.filter((x) => x.name !== correct && !distractors.includes(x.name)).map((x) => x.name),
        rng,
      ).slice(0, 3 - distractors.length);
      distractors.push(...extra);
    }
    return {
      mode,
      airline: dominant,
      airport: airportIata,
      options: shuffle([correct, ...distractors], rng),
      answer: correct,
      prompt: airportIata,
      promptKind: 'airport',
    };
  }
  if (mode === 'country' && airports[airline.hub] && rng() < 0.5) {
    const airportIata = airline.hub;
    const apCountry = airportCountry[airportIata] ?? airline.country;
    const correct = apCountry;
    const region = REGIONS[apCountry];
    const sameRegion = region
      ? Object.values(airportCountry).filter((c) => c !== correct && REGIONS[c] === region)
      : [];
    const ranked = shuffle([...new Set(sameRegion)], rng);
    const distractors: string[] = [];
    for (const c of ranked) {
      if (!distractors.includes(c)) distractors.push(c);
      if (distractors.length === 3) break;
    }
    if (distractors.length < 3) {
      const extra = shuffle(
        fallbackPool.filter((x) => x !== correct && !distractors.includes(x)),
        rng,
      ).slice(0, 3 - distractors.length);
      distractors.push(...extra);
    }
    return {
      mode,
      airline,
      airport: airportIata,
      options: shuffle([correct, ...distractors], rng),
      answer: correct,
      prompt: airportIata,
      promptKind: 'airport',
    };
  }
  if (mode === 'reverseGroup') {
    // Multi-select with unknown count: pick 1..min(4, mates) correct, rest distractors.
    const groupMates = sourcePool.filter(
      (a) => a.group === airline.group && !isObviousGroup(a),
    );
    const maxCorrect = Math.min(6, groupMates.length);
    const correctCount = 1 + Math.floor(rng() * maxCorrect);
    const correctNames = shuffle(groupMates.map((a) => a.name), rng).slice(0, correctCount);
    const distractors = sourcePool
      .filter((a) => a.group !== airline.group && a.iata !== airline.iata)
      .map((a) => a.name);
    const fillerCount = 6 - correctNames.length;
    const fillers = shuffle(distractors.filter((n) => !correctNames.includes(n)), rng).slice(0, fillerCount);
    return {
      mode,
      airline,
      options: shuffle([...correctNames, ...fillers], rng),
      answer: correctNames[0],
      answers: correctNames,
    };
  }
  if (mode === 'code') {
    const m = airlineMeta(airline.iata);
    const variants: Array<{ kind: 'iata' | 'icao' | 'callsign'; value: string }> = [
      { kind: 'iata', value: airline.iata },
    ];
    if (difficulty === 'hard') {
      if (m.icao) variants.push({ kind: 'icao', value: m.icao });
      // Skip callsigns that are essentially the airline name re-spoken - those
      // are giveaways once the airline appears in the options. Same overlap
      // rule as the ATC callsign quiz uses.
      if (m.callsign && !callsignIsObviousFor(airline.name, m.callsign)) {
        variants.push({ kind: 'callsign', value: m.callsign });
      }
    }
    const chosen = pick(variants, rng);
    const distractors = smartDistractors(airline, mode, sourcePool, fallbackPool, rng);
    return {
      mode,
      airline,
      options: shuffle([answer, ...distractors], rng),
      answer,
      prompt: chosen.value,
      promptKind: chosen.kind,
    };
  }
  const useSmart =
    mode === 'logo' || mode === 'tail' ||
    difficulty === 'hard' ||
    (difficulty !== 'easy' && (mode === 'hub' || mode === 'country'));
  const distractors = useSmart
    ? smartDistractors(airline, mode, sourcePool, fallbackPool, rng)
    : shuffle(fallbackPool.filter((p) => p !== answer), rng).slice(0, distractorCount(mode));
  const options = mode === 'group'
    ? groupOptions(answer, distractors, rng)
    : shuffle([answer, ...distractors], rng);
  return {
    mode,
    airline,
    options,
    answer,
  };
}

// Rough region map for plausible country/hub distractors.
const REGIONS: Record<string, string> = {
  // North America
  'United States': 'NA', 'Canada': 'NA', 'Mexico': 'NA', 'Panama': 'NA', 'Trinidad and Tobago': 'NA',
  // South America
  'Argentina': 'SA', 'Brazil': 'SA', 'Chile': 'SA', 'Colombia': 'SA',
  // Europe
  'Austria': 'EU', 'Belgium': 'EU', 'Bulgaria': 'EU', 'Croatia': 'EU', 'Czech Republic': 'EU',
  'Finland': 'EU', 'France': 'EU', 'Germany': 'EU', 'Greece': 'EU', 'Hungary': 'EU',
  'Iceland': 'EU', 'Ireland': 'EU', 'Italy': 'EU', 'Latvia': 'EU', 'Netherlands': 'EU',
  'Norway': 'EU', 'Poland': 'EU', 'Portugal': 'EU', 'Romania': 'EU', 'Serbia': 'EU',
  'Spain': 'EU', 'Sweden': 'EU', 'Switzerland': 'EU', 'Turkey': 'EU', 'United Kingdom': 'EU',
  // Middle East
  'Bahrain': 'ME', 'Israel': 'ME', 'Jordan': 'ME', 'Kuwait': 'ME', 'Oman': 'ME',
  'Qatar': 'ME', 'Saudi Arabia': 'ME', 'United Arab Emirates': 'ME',
  // Africa
  'Egypt': 'AF', 'Ethiopia': 'AF', 'Kenya': 'AF', 'Mauritius': 'AF', 'Morocco': 'AF',
  'Rwanda': 'AF', 'South Africa': 'AF',
  // Asia
  'Azerbaijan': 'AS', 'Brunei': 'AS', 'China': 'AS', 'Hong Kong': 'AS', 'India': 'AS',
  'Indonesia': 'AS', 'Japan': 'AS', 'Kazakhstan': 'AS', 'Malaysia': 'AS', 'Mongolia': 'AS',
  'Pakistan': 'AS', 'Philippines': 'AS', 'Russia': 'AS', 'Singapore': 'AS', 'South Korea': 'AS',
  'Sri Lanka': 'AS', 'Taiwan': 'AS', 'Thailand': 'AS', 'Uzbekistan': 'AS', 'Vietnam': 'AS',
  // Oceania
  'Australia': 'OC', 'Fiji': 'OC', 'New Zealand': 'OC', 'Papua New Guinea': 'OC',
};

function regionOf(country: string): string | null {
  return REGIONS[country] ?? null;
}

function normalizeForOverlap(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function callsignIsObviousFor(airlineName: string, callsign: string): boolean {
  const nameTokens = new Set(
    normalizeForOverlap(airlineName).split(' ').filter((t) => t.length >= 3),
  );
  const csTokens = normalizeForOverlap(callsign).split(' ').filter((t) => t.length >= 3);
  if (csTokens.length === 0) return true;
  return csTokens.every((t) => nameTokens.has(t));
}

// Adjective forms / common name fragments that telegraph the airline's country.
// Used to filter the country quiz: airlines whose name already contains one of
// these for their own country are giveaways (e.g. "American Airlines" → USA,
// "British Airways" → UK, "Air France" → France).
const COUNTRY_REVEALS: Record<string, string[]> = {
  'United States': ['american', 'united states', 'us'],
  'United Kingdom': ['british', 'uk'],
  'France': ['france', 'french', 'air france'],
  'Germany': ['german', 'germany', 'deutsch'],
  'Italy': ['italian', 'italy', 'italia'],
  'Spain': ['spanish', 'spain'],
  'Russia': ['russian', 'russia'],
  'China': ['china', 'chinese'],
  'Japan': ['japan', 'japanese', 'nippon'],
  'South Korea': ['korean', 'korea'],
  'Australia': ['australian', 'australia'],
  'Iceland': ['iceland', 'icelandic'],
  'Czech Republic': ['czech'],
  'Turkey': ['turkish', 'turkey'],
  'Thailand': ['thai', 'thailand'],
  'Egypt': ['egypt', 'egyptian'],
  'Argentina': ['argentine', 'argentinian', 'argentinas', 'argentina'],
  'Saudi Arabia': ['saudi', 'saudia'],
  'Vietnam': ['vietnam', 'vietnamese'],
  'Indonesia': ['indonesia', 'indonesian'],
  'Philippines': ['philippine', 'philippines', 'filipino'],
  'Pakistan': ['pakistan', 'pakistani'],
  'India': ['india', 'indian', 'air india'],
  'Canada': ['air canada', 'canadian', 'canada'],
  'Mexico': ['mexico', 'mexican', 'aeromexico'],
  'Brazil': ['brazil', 'brazilian', 'brasil'],
  'Norway': ['norwegian', 'norway'],
  'Sweden': ['swedish', 'sweden'],
  'Finland': ['finnish', 'finland', 'finnair'],
  'Denmark': ['danish', 'denmark'],
  'Netherlands': ['dutch', 'netherlands'],
  'Switzerland': ['swiss', 'switzerland'],
  'Austria': ['austrian', 'austria'],
  'Belgium': ['belgian', 'belgium'],
  'Portugal': ['portugal', 'portuguese'],
  'Greece': ['greek', 'greece', 'aegean'],
  'Poland': ['polish', 'poland'],
  'Ireland': ['irish', 'ireland'],
  'Croatia': ['croatian', 'croatia'],
  'Hungary': ['hungarian', 'hungary'],
  'Romania': ['romanian', 'romania'],
  'Serbia': ['serbian', 'serbia'],
  'Bulgaria': ['bulgarian', 'bulgaria'],
  'Latvia': ['latvian', 'latvia'],
  'Ethiopia': ['ethiopian', 'ethiopia'],
  'Kenya': ['kenya', 'kenyan'],
  'Morocco': ['moroccan', 'morocco', 'maroc'],
  'South Africa': ['south african', 'south africa'],
  'Israel': ['israeli', 'israel', 'el al'],
  'Jordan': ['jordan', 'jordanian'],
  'New Zealand': ['new zealand'],
  'Hong Kong': ['hong kong'],
  'Singapore': ['singapore'],
  'Malaysia': ['malaysia', 'malaysian'],
  'Sri Lanka': ['sri lankan', 'srilankan', 'sri lanka'],
  'Mongolia': ['mongolia', 'mongolian'],
  'Azerbaijan': ['azerbaijan', 'azal'],
  'Kazakhstan': ['kazakh', 'kazakhstan', 'astana'],
  'Uzbekistan': ['uzbek', 'uzbekistan'],
  'Brunei': ['brunei', 'royal brunei'],
  'Fiji': ['fiji', 'fijian'],
  'Papua New Guinea': ['papua', 'png'],
  'Mauritius': ['mauritius', 'mauritian'],
  'Rwanda': ['rwandair', 'rwanda'],
  'Bahrain': ['gulf air', 'bahrain'],
  'Kuwait': ['kuwait'],
  'Oman': ['oman'],
  'United Arab Emirates': ['emirates', 'etihad'],
  'Qatar': ['qatar'],
  'Trinidad and Tobago': ['caribbean'],
  'Panama': ['copa'],
  'Chile': ['lan', 'sky airline'],
  'Colombia': ['avianca'],
};

function airlineRevealsCountry(a: Airline): boolean {
  const reveals = COUNTRY_REVEALS[a.country];
  if (!reveals) return false;
  const name = a.name.toLowerCase();
  return reveals.some((r) => name.includes(r));
}

function isObviousGroup(a: Airline): boolean {
  if (!a.group) return false;
  const name = normalizeForOverlap(a.name);
  const group = normalizeForOverlap(a.group);
  if (name === group) return true;
  // tokens of the airline name (length >= 3) appearing in group name
  const tokens = name.split(' ').filter((t) => t.length >= 3);
  for (const tok of tokens) {
    if (group.split(' ').includes(tok)) return true;
  }
  return false;
}

// Logos with the airline name visible (wordmarks) - populated via the logo
// review tool's "wordmark?" toggle. Filtered out of the logo quiz on hard so
// the game tests visual recognition rather than reading.
const WORDMARK_LOGOS = new Set<string>((logoFlagsData as { wordmark: string[] }).wordmark);

function eligibleFor(mode: Mode, sourcePool: Airline[], difficulty?: Difficulty): Airline[] {
  if (mode === 'country' && difficulty !== 'easy') {
    // Don't pick airlines whose name reveals their country on medium/hard;
    // it's a giveaway ("British Airways" → UK).
    return sourcePool.filter((a) => !airlineRevealsCountry(a));
  }
  if (mode === 'logo' && difficulty === 'hard') {
    // Hard logo mode: skip airlines whose logo is a wordmark - those are
    // reading tests rather than visual recognition.
    return sourcePool.filter((a) => !WORDMARK_LOGOS.has(a.iata));
  }
  if (mode === 'group') return sourcePool.filter((a) => !isObviousGroup(a));
  if (mode === 'reverseGroup') {
    return sourcePool.filter((a) => {
      if (a.group === null || isObviousGroup(a)) return false;
      const mates = sourcePool.filter((b) => b.group === a.group && !isObviousGroup(b));
      return mates.length >= 2;
    });
  }
  if (mode === 'tail') return sourcePool.filter((a) => hasTail(a.iata));
  if (mode === 'airportAirline') {
    return sourcePool.filter((a) => {
      const r = airportRoutes(a.hub);
      return !!r && Array.isArray(r.topAirlines) && r.topAirlines.length > 0;
    });
  }
  if (mode === 'airportConn') {
    return sourcePool.filter((a) => {
      const r = airportRoutes(a.hub);
      return hasRankedAirportDestinations(r);
    });
  }
  if (mode === 'airlineDest') {
    return sourcePool.filter((a) => {
      const r = airlineRoutes(a.iata);
      return !!r && Array.isArray(r.topDestinations) && r.topDestinations.length > 0;
    });
  }
  if (mode === 'whereAmI') {
    return sourcePool.filter((a) => {
      const r = airportRoutes(a.hub);
      return !!r && Array.isArray(r.topDestinations) && r.topDestinations.length >= 3;
    });
  }
  if (mode === 'hubOf') {
    // Eligible: airline's hub is a known airport. Hard difficulty narrows to
    // hubs where multiple airlines list it as their primary hub (forces the
    // player to pick the dominant carrier instead of any tenant).
    return sourcePool.filter((a) => {
      if (!airports[a.hub]) return false;
      if (difficulty === 'hard') {
        const tenants = airlines.filter((x) => x.hub === a.hub);
        return tenants.length >= 2;
      }
      if (difficulty === 'easy') {
        const tenants = airlines.filter((x) => x.hub === a.hub);
        return tenants.length === 1;
      }
      return true;
    });
  }
  return sourcePool;
}

// Modes whose question is "about" an airport (the airline's hub). For these we
// also dedupe by hub IATA so US-only doesn't ask about DFW twice in one round
// just because two different US airlines share the hub.
const AIRPORT_MODES: Mode[] = ['airportAirline', 'airportConn', 'whereAmI', 'hubOf'];

export function buildRound(mode: Mode, difficulty: Difficulty, seed?: number): Question[] {
  const rng = seed === undefined ? defaultRng() : mulberry32(seed);
  const sourcePool = pool(difficulty);
  const eligible = eligibleFor(mode, sourcePool, difficulty);
  const used = new Set<string>();
  const usedHubs = new Set<string>();
  const dedupHubs = AIRPORT_MODES.includes(mode);
  const out: Question[] = [];
  let safety = 0;
  while (out.length < ROUND_LENGTH && safety < 1000) {
    safety++;
    const a = pick(eligible, rng);
    if (used.has(a.iata)) continue;
    if (dedupHubs && usedHubs.has(a.hub)) continue;
    used.add(a.iata);
    if (dedupHubs) usedHubs.add(a.hub);
    const fallbackPool = optionPool(mode, sourcePool);
    out.push(buildQuestion(a, mode, sourcePool, fallbackPool, difficulty, rng));
  }
  return out;
}

const DAILY_ROTATION: Mode[] = ['logo', 'group', 'alliance', 'hub', 'country', 'reverseGroup', 'logo', 'group', 'hub', 'country'];

export function buildSpeedQuestion(): Question {
  const rng = defaultRng();
  const difficulty: Difficulty = 'medium';
  const sourcePool = pool(difficulty);
  const modes: Mode[] = (['group', 'alliance', 'hub', 'logo', 'country', 'reverseGroup', 'airportAirline', 'airlineDest', 'airportConn', 'whereAmI', 'hubOf'] as Mode[])
    .filter((m) => !(loadPool() === 'us' && m === 'country'));
  let mode = pick(modes, rng);
  let eligible = eligibleFor(mode, sourcePool, difficulty);
  if (eligible.length === 0) {
    mode = 'group';
    eligible = eligibleFor(mode, sourcePool, difficulty);
  }
  const a = pick(eligible, rng);
  const fallbackPool = optionPool(mode, sourcePool);
  return buildQuestion(a, mode, sourcePool, fallbackPool, difficulty, rng);
}

export function buildMixedRound(rng: Rng = defaultRng()): Question[] {
  const difficulty: Difficulty = 'medium';
  const sourcePool = pool(difficulty);
  const tailEligible = eligibleFor('tail', sourcePool).length >= 4;
  const allModes: Mode[] = (['group', 'alliance', 'hub', 'logo', 'country', 'reverseGroup', 'airportAirline', 'airlineDest', 'airportConn', 'code', 'whereAmI', 'hubOf'] as Mode[])
    .filter((m) => !(loadPool() === 'us' && m === 'country'));
  if (tailEligible) allModes.push('tail');
  const used = new Set<string>();
  const out: Question[] = [];
  let safety = 0;
  while (out.length < ROUND_LENGTH && safety < 2000) {
    safety++;
    const mode = pick(allModes, rng);
    const eligible = eligibleFor(mode, sourcePool, difficulty);
    if (eligible.length === 0) continue;
    const a = pick(eligible, rng);
    const key = `${mode}:${a.iata}`;
    if (used.has(key)) continue;
    used.add(key);
    const fallbackPool = optionPool(mode, sourcePool);
    out.push(buildQuestion(a, mode, sourcePool, fallbackPool, difficulty, rng));
  }
  return out;
}

export function buildDailyRound(dateKey: string): Question[] {
  const seed = hashSeed('daily-' + dateKey);
  const rng = mulberry32(seed);
  const difficulty: Difficulty = 'medium';
  const sourcePool = pool(difficulty);
  const used = new Set<string>();
  const out: Question[] = [];
  let safety = 0;
  while (out.length < ROUND_LENGTH && safety < 1000) {
    safety++;
    const mode = DAILY_ROTATION[out.length];
    const eligible = eligibleFor(mode, sourcePool, difficulty);
    const a = pick(eligible, rng);
    if (used.has(a.iata)) continue;
    used.add(a.iata);
    const fallbackPool = optionPool(mode, sourcePool);
    out.push(buildQuestion(a, mode, sourcePool, fallbackPool, difficulty, rng));
  }
  return shuffle(out, rng);
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// --- Labels -----------------------------------------------------------

export function explainAnswer(q: Question): string {
  const a = q.airline;
  const m = airlineMeta(a.iata);
  const founded = m.founded ? ` Founded ${m.founded}.` : '';
  switch (q.mode) {
    case 'group':
      return a.group
        ? `${a.name} is part of ${a.group}.${founded}`
        : `${a.name} operates independently.${founded}`;
    case 'alliance':
      return a.alliance
        ? `${a.name} is a ${a.alliance} member.`
        : `${a.name} doesn't belong to a global alliance.`;
    case 'hub':
      return `${airportLabel(a.hub)} is ${a.name}'s primary hub (${a.country}).`;
    case 'country': {
      if (q.promptKind === 'airport' && q.airport) {
        return `${airportLabel(q.airport)} is in ${q.answer}.`;
      }
      return `${a.name} is based in ${a.country}. Hub: ${airportLabel(a.hub)}.`;
    }
    case 'logo':
    case 'tail':
      return `${a.name} - ${a.country}${a.alliance ? `, ${a.alliance}` : ''}.${founded}`;
    case 'reverseGroup':
      return `${a.name} (${a.country}) belongs to ${a.group}.`;
    case 'airportAirline': {
      const ap = q.airport ?? a.hub;
      const ans = airlineByIata(q.answer);
      return `${ans?.name ?? q.answer} is among the top carriers at ${airportLabel(ap)}.`;
    }
    case 'airportConn': {
      const ap = q.airport ?? a.hub;
      return `${airportLabelWithCountry(q.answer)} is the busiest ranked destination from ${airportLabelWithCountry(ap)} in the airport route source.`;
    }
    case 'airlineDest':
      return `${airportLabel(q.answer)} is the top sourced destination for ${a.name}.`;
    case 'code': {
      const meta = airlineMeta(a.iata);
      const parts = [`IATA ${a.iata}`];
      if (meta.icao) parts.push(`ICAO ${meta.icao}`);
      if (meta.callsign) parts.push(`callsign "${meta.callsign}"`);
      return `${a.name} - ${parts.join(', ')}.`;
    }
    case 'whereAmI': {
      const ap = q.airport ?? a.hub;
      return `Those destinations are top routes from ${airportLabelWithCountry(ap)}.`;
    }
    case 'hubOf': {
      const ap = q.airport ?? a.hub;
      return `${a.name} is the dominant carrier at ${airportLabelWithCountry(ap)}.`;
    }
    case 'aircraftWordle':
    case 'aircraftIdentify':
    case 'militaryWordle':
    case 'militaryIdentify':
    case 'airportWordle':
    case 'airportIdentify':
      return '';
  }
}

export function modeLabel(mode: Mode): string {
  switch (mode) {
    case 'group': return 'Parent group';
    case 'alliance': return 'Alliance';
    case 'hub': return 'Primary hub';
    case 'logo': return 'Which airline?';
    case 'country': return 'Country of origin';
    case 'reverseGroup': return 'Which airline?';
    case 'tail': return 'Which airline?';
    case 'airportAirline': return 'Top carrier here';
    case 'airportConn': return 'Busiest destination from here';
    case 'airlineDest': return 'Top sourced destination';
    case 'code': return 'Which airline?';
    case 'aircraftWordle': return 'Which aircraft?';
    case 'aircraftIdentify': return 'Which aircraft?';
    case 'militaryWordle': return 'Which military aircraft?';
    case 'militaryIdentify': return 'Which military aircraft?';
    case 'whereAmI': return 'Which airport?';
    case 'hubOf': return 'Which airline hubs here?';
    case 'airportWordle': return 'Which airport?';
    case 'airportIdentify': return 'Which airport?';
  }
}

export function modeTitle(mode: Mode): string {
  switch (mode) {
    case 'group': return 'Group Guess';
    case 'alliance': return 'Alliance Guess';
    case 'hub': return 'Hub Guess';
    case 'logo': return 'Logo Quiz';
    case 'country': return 'Country Guess';
    case 'reverseGroup': return 'Reverse Group';
    case 'tail': return 'Tail Livery Spotter';
    case 'airportAirline': return 'Airport Carriers';
    case 'airportConn': return 'Airport Routes';
    case 'airlineDest': return 'Airline Routes';
    case 'code': return 'Code Guess';
    case 'aircraftWordle': return 'Aircraft Wordle';
    case 'aircraftIdentify': return 'Aircraft Identify';
    case 'militaryWordle': return 'Military Wordle';
    case 'militaryIdentify': return 'Military Identify';
    case 'whereAmI': return 'Where Am I?';
    case 'hubOf': return 'Hub Of';
    case 'airportWordle': return 'Airport Wordle';
    case 'airportIdentify': return 'Airport Identify';
  }
}

export function modeDescription(mode: Mode): string {
  switch (mode) {
    case 'group': return 'Identify the parent group an airline belongs to - or whether it operates independently.';
    case 'alliance': return 'Star Alliance, Oneworld, SkyTeam, or no alliance at all?';
    case 'hub': return "Pick the airline's primary hub airport - the one it bases the bulk of its operation at.";
    case 'logo': return 'Identify the airline from its logo.';
    case 'country': return "Pick the country where the airline is registered / headquartered.";
    case 'reverseGroup': return 'Given a group (e.g. Lufthansa Group), select every airline that belongs to it. There may be one correct answer or several.';
    case 'tail': return 'Identify the airline from a photo of its tail livery.';
    case 'airportAirline': return 'Pick a top carrier at the given airport. Ranked from airport stats where available, with curated fallbacks for airports that lack clean ranked tables.';
    case 'airportConn': return 'Pick the rank-1 destination from the airport route source. Only airports with a ranked public route table are used.';
    case 'airlineDest': return "Pick the top sourced destination served by the airline. Order comes from a public hub-airport route ranking, and each destination is checked against a public airline destination/source page.";
    case 'code': return 'Identify the airline from its carrier code. Easy and Medium use IATA (e.g. LH); Hard mixes in ICAO codes and radio callsigns.';
    case 'aircraftWordle': return 'Deduce a mystery aircraft from attribute feedback. Type a guess, see how close you are on maker, body, length, engines, tail, and era.';
    case 'aircraftIdentify': return 'Identify an aircraft from a photo. Take optional hints (maker, then family) at a point cost, then read the structured breakdown.';
    case 'militaryWordle': return 'Deduce a mystery military aircraft from attribute feedback across maker, origin, role, era, engines, wings, and speed.';
    case 'militaryIdentify': return 'Identify a military aircraft from a photo. Take optional hints (maker, then origin and role) at a point cost.';
    case 'whereAmI': return "Given an airport's top destinations, deduce which airport it is. Distractors share a region; hard mode also draws from the same alliance's hubs.";
    case 'hubOf': return 'Given an airport, pick the airline whose primary hub it is. Hard mode uses airports with multiple hub tenants - answer is the dominant carrier by traffic.';
    case 'airportWordle': return 'Deduce a mystery airport from attribute feedback across country, region, hub alliance, traffic tier, runways, layout, and latitude band.';
    case 'airportIdentify': return 'Identify an airport from a photo (terminal, tower, or aerial view) with progressive hints.';
  }
}

export function difficultyLabel(d: Difficulty): string {
  return d[0].toUpperCase() + d.slice(1);
}

export function logoUrl(iata: string): string {
  return `${import.meta.env.BASE_URL}logos/${iata}.png`;
}

// --- Persistence ------------------------------------------------------

const HISTORY_KEY = 'history';
const HISTORY_MAX = 20;

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function saveHistoryEntry(entry: HistoryEntry): HistoryEntry[] {
  const next = [entry, ...loadHistory()].slice(0, HISTORY_MAX);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function bestKey(mode: Mode, difficulty: Difficulty): string {
  return `best:${mode}:${difficulty}`;
}

export function loadBest(mode: Mode, difficulty: Difficulty): number {
  return Number(localStorage.getItem(bestKey(mode, difficulty)) ?? 0);
}

export function saveBest(mode: Mode, difficulty: Difficulty, score: number): boolean {
  const prev = loadBest(mode, difficulty);
  if (score > prev) {
    localStorage.setItem(bestKey(mode, difficulty), String(score));
    return true;
  }
  return false;
}

// Streaks
const STREAK_KEY_PREFIX = 'streak-best:';

export function loadBestStreak(mode: Mode | 'daily'): number {
  return Number(localStorage.getItem(STREAK_KEY_PREFIX + mode) ?? 0);
}

export function saveBestStreak(mode: Mode | 'daily', streak: number): boolean {
  const prev = loadBestStreak(mode);
  if (streak > prev) {
    localStorage.setItem(STREAK_KEY_PREFIX + mode, String(streak));
    return true;
  }
  return false;
}

// Per-airline accuracy
const AIRLINE_STATS_KEY = 'airline-stats';

export interface AirlineStat {
  seen: number;
  missed: number;
}

export function loadAirlineStats(): Record<string, AirlineStat> {
  try {
    const raw = localStorage.getItem(AIRLINE_STATS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function recordRoundStats(results: { question: { airline: { iata: string } }; correct: boolean }[]) {
  const stats = loadAirlineStats();
  for (const r of results) {
    const iata = r.question.airline.iata;
    if (!stats[iata]) stats[iata] = { seen: 0, missed: 0 };
    stats[iata].seen += 1;
    if (!r.correct) stats[iata].missed += 1;
  }
  localStorage.setItem(AIRLINE_STATS_KEY, JSON.stringify(stats));
}

// Daily completion
const DAILY_DONE_KEY = 'daily-done';

export function loadDailyDone(): { date: string; score: number } | null {
  try {
    const raw = localStorage.getItem(DAILY_DONE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v.date === todayKey()) return v;
    return null;
  } catch {
    return null;
  }
}

export function saveDailyDone(score: number) {
  localStorage.setItem(DAILY_DONE_KEY, JSON.stringify({ date: todayKey(), score }));
}

// Settings
const SETTINGS_KEY = 'settings';
const DEFAULT_SETTINGS: Settings = { sound: true, haptics: true, keyboardHints: true, darkMode: true };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

const RESET_KEEP = new Set([SETTINGS_KEY]);

export function resetProgress() {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && !RESET_KEEP.has(k)) keys.push(k);
  }
  for (const k of keys) localStorage.removeItem(k);
}
