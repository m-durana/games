import airlinesData from '../data/airlines.json';
import airportsData from '../data/airports.json';
import airportMetaData from '../data/airport-meta.json';
import metaData from '../data/airline-meta.json';
import tailsData from '../data/tails.json';
import airportRoutesData from '../data/airport-routes.json';
import airlineRoutesData from '../data/airline-routes.json';
import type { Airline, AirlineMeta, Difficulty, HistoryEntry, Mode, Question, Settings } from './types';

export const airlines = airlinesData as Airline[];

export type Pool = 'all' | 'us';
const POOL_KEY = 'pool';
export function loadPool(): Pool {
  if (typeof localStorage === 'undefined') return 'all';
  return (localStorage.getItem(POOL_KEY) as Pool) ?? 'all';
}
export function savePool(p: Pool) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(POOL_KEY, p);
}
export function pooledAirlines(): Airline[] {
  return loadPool() === 'us' ? airlines.filter((a) => a.country === 'United States') : airlines;
}
const airports = airportsData as Record<string, string>;
const airportCountry = airportMetaData as Record<string, string>;

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
  airlinesUnranked?: boolean;
}
interface AirlineRouteEntry {
  topDestinations?: string[];
  year?: number;
  source?: string;
}
const airportRoutesMap = airportRoutesData as Record<string, AirportRouteEntry>;
const airlineRoutesMap = airlineRoutesData as Record<string, AirlineRouteEntry>;

export function airportRoutes(iata: string): AirportRouteEntry | null {
  return airportRoutesMap[iata] ?? null;
}
export function airlineRoutes(iata: string): AirlineRouteEntry | null {
  return airlineRoutesMap[iata] ?? null;
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

const TIER_1 = new Set([
  'LH', 'BA', 'AF', 'KL', 'AA', 'DL', 'UA', 'B6', 'WN', 'AS',
  'AC', 'EK', 'EY', 'QR', 'SQ', 'CX', 'JL', 'NH', 'KE', 'QF',
  'NZ', 'TK', 'FR', 'U2', 'AZ', 'IB', 'LX', 'OS', 'AY', 'SK',
  'AI', '6E', 'EW', 'VY', 'TP', 'CA', 'MU', 'CZ', 'AM', 'WS',
  'SU', 'ET', 'TG', 'NK', 'F9',
]);

const TIER_3 = new Set([
  'MQ', 'OH', 'PT', '9E', 'LV', 'JU', 'OK', 'OU', 'MK', 'WB',
  'KU', 'GF', 'KC', 'HY', 'J2', 'FJ', 'QH', 'VJ', '5J', 'LS',
  'PD', 'VB', 'AD', 'SY', 'G4', 'BY', 'A3', 'FI', 'UL', 'AT',
  'LY', 'RJ', 'WY', 'SV', 'FZ', 'JJ',
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
    return true;
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

// --- Question construction --------------------------------------------

function answerFor(airline: Airline, mode: Mode): string {
  if (mode === 'group') return airline.group ?? INDEPENDENT;
  if (mode === 'alliance') return airline.alliance ?? INDEPENDENT;
  if (mode === 'hub') return airline.hub;
  if (mode === 'country') return airline.country;
  // The route-based modes are special-cased entirely in buildQuestion (the answer
  // there depends on a randomly-picked top-3 entry, not on the airline alone).
  // Returning '' here is fine — buildQuestion never falls through to this for them.
  if (mode === 'airportAirline' || mode === 'airlineDest' || mode === 'airportConn') return '';
  // mode === 'logo' or 'reverseGroup' or 'tail': answer is the airline name
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
    // Pool of airport IATA codes — use airports we know about.
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
  if (mode === 'logo' || mode === 'tail') {
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
    const sameCountryAps = shuffle(airportsByCountry(airline.country).filter((c) => c !== answer), rng);
    const sameRegionAps = shuffle(airportsBySameRegion(airline.country).filter((c) => c !== answer), rng);
    const out: string[] = [];
    for (const code of sameCountryAps) {
      if (!out.includes(code)) out.push(code);
      if (out.length === n) return out;
    }
    for (const code of sameRegionAps) {
      if (!out.includes(code)) out.push(code);
      if (out.length === n) return out;
    }
    const extra = shuffle(fallbackPool.filter((x) => x !== answer && !out.includes(x)), rng).slice(0, n - out.length);
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
    const top = (r.topDestinations ?? []).slice(0, 3);
    const correct = pick(top, rng);
    const exclude = new Set(r.topDestinations ?? []);
    exclude.add(airportIata); // never offer the airport itself as a destination
    const apCountry = airportCountry[airportIata];
    const region = apCountry ? REGIONS[apCountry] : undefined;
    const sameRegion = region
      ? Object.keys(airports).filter(
          (c) =>
            !exclude.has(c) &&
            c !== correct &&
            airportCountry[c] &&
            REGIONS[airportCountry[c]] === region,
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
  if (mode === 'airlineDest') {
    const r = airlineRoutes(airline.iata)!;
    const top = (r.topDestinations ?? []).slice(0, 3);
    const correct = top[0];
    const exclude = new Set(r.topDestinations ?? []);
    exclude.add(airline.hub); // hub isn't a meaningful "destination"
    const region = REGIONS[airline.country];
    const sameRegion = region
      ? Object.keys(airports).filter(
          (c) =>
            !exclude.has(c) &&
            c !== correct &&
            airportCountry[c] &&
            REGIONS[airportCountry[c]] === region,
        )
      : [];
    const sameCountry = Object.keys(airports).filter(
      (c) => !exclude.has(c) && c !== correct && airportCountry[c] === airline.country,
    );
    const ranked = [...shuffle(sameCountry, rng), ...shuffle(sameRegion, rng)];
    const distractors: string[] = [];
    for (const code of ranked) {
      if (!distractors.includes(code)) distractors.push(code);
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
      options: shuffle([correct, ...distractors], rng),
      answer: correct,
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
  const useSmart =
    mode === 'logo' || mode === 'tail' ||
    difficulty === 'hard' ||
    (difficulty !== 'easy' && (mode === 'hub' || mode === 'country'));
  const distractors = useSmart
    ? smartDistractors(airline, mode, sourcePool, fallbackPool, rng)
    : shuffle(fallbackPool.filter((p) => p !== answer), rng).slice(0, distractorCount(mode));
  return {
    mode,
    airline,
    options: shuffle([answer, ...distractors], rng),
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

function eligibleFor(mode: Mode, sourcePool: Airline[]): Airline[] {
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
      return !!r && Array.isArray(r.topDestinations) && r.topDestinations.length > 0;
    });
  }
  if (mode === 'airlineDest') {
    return sourcePool.filter((a) => {
      const r = airlineRoutes(a.iata);
      return !!r && Array.isArray(r.topDestinations) && r.topDestinations.length > 0;
    });
  }
  return sourcePool;
}

export function buildRound(mode: Mode, difficulty: Difficulty, seed?: number): Question[] {
  const rng = seed === undefined ? defaultRng() : mulberry32(seed);
  const sourcePool = pool(difficulty);
  const eligible = eligibleFor(mode, sourcePool);
  const used = new Set<string>();
  const out: Question[] = [];
  let safety = 0;
  while (out.length < ROUND_LENGTH && safety < 1000) {
    safety++;
    const a = pick(eligible, rng);
    if (used.has(a.iata)) continue;
    used.add(a.iata);
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
  const modes: Mode[] = ['group', 'alliance', 'hub', 'logo', 'country', 'reverseGroup', 'airportAirline', 'airlineDest', 'airportConn'];
  let mode = pick(modes, rng);
  let eligible = eligibleFor(mode, sourcePool);
  if (eligible.length === 0) {
    mode = 'group';
    eligible = eligibleFor(mode, sourcePool);
  }
  const a = pick(eligible, rng);
  const fallbackPool = optionPool(mode, sourcePool);
  return buildQuestion(a, mode, sourcePool, fallbackPool, difficulty, rng);
}

export function buildMixedRound(rng: Rng = defaultRng()): Question[] {
  const difficulty: Difficulty = 'medium';
  const sourcePool = pool(difficulty);
  const tailEligible = eligibleFor('tail', sourcePool).length >= 4;
  const allModes: Mode[] = ['group', 'alliance', 'hub', 'logo', 'country', 'reverseGroup', 'airportAirline', 'airlineDest', 'airportConn'];
  if (tailEligible) allModes.push('tail');
  const used = new Set<string>();
  const out: Question[] = [];
  let safety = 0;
  while (out.length < ROUND_LENGTH && safety < 2000) {
    safety++;
    const mode = pick(allModes, rng);
    const eligible = eligibleFor(mode, sourcePool);
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
    const eligible = eligibleFor(mode, sourcePool);
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
    case 'country':
      return `${a.name} is based in ${a.country}. Hub: ${airportLabel(a.hub)}.`;
    case 'logo':
    case 'tail':
      return `${a.name} — ${a.country}${a.alliance ? `, ${a.alliance}` : ''}.${founded}`;
    case 'reverseGroup':
      return `${a.name} (${a.country}) belongs to ${a.group}.`;
    case 'airportAirline': {
      const ap = q.airport ?? a.hub;
      const ans = airlineByIata(q.answer);
      return `${ans?.name ?? q.answer} is among the top carriers at ${airportLabel(ap)}.`;
    }
    case 'airportConn': {
      const ap = q.airport ?? a.hub;
      return `${airportLabel(q.answer)} is one of the busiest connections from ${airportLabel(ap)}.`;
    }
    case 'airlineDest':
      return `${airportLabel(q.answer)} is the top destination for ${a.name}.`;
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
    case 'airportConn': return 'Major destination from here';
    case 'airlineDest': return 'Top destination served';
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
    case 'tail': return 'Livery Spotter';
    case 'airportAirline': return 'Airport Carriers';
    case 'airportConn': return 'Airport Routes';
    case 'airlineDest': return 'Airline Routes';
  }
}

export function modeDescription(mode: Mode): string {
  switch (mode) {
    case 'group': return 'Identify the parent group an airline belongs to — or whether it operates independently.';
    case 'alliance': return 'Star Alliance, Oneworld, SkyTeam, or no alliance at all?';
    case 'hub': return "Pick the airline's primary hub airport — the one it bases the bulk of its operation at.";
    case 'logo': return 'Identify the airline from its logo.';
    case 'country': return "Pick the country where the airline is registered / headquartered.";
    case 'reverseGroup': return 'Given a group (e.g. Lufthansa Group), select every airline that belongs to it. There may be one correct answer or several.';
    case 'tail': return 'Identify the airline from a photo of its tail livery.';
    case 'airportAirline': return 'Pick a top carrier at the given airport. Ranked from airport stats where available, with curated fallbacks for airports that lack clean ranked tables.';
    case 'airportConn': return 'Pick a major destination served from the given airport. Ranked from busiest-route tables where available, with curated fallbacks for sparse airport pages.';
    case 'airlineDest': return "Pick the top destination served by the airline. Ranked by route frequency / passenger volume; for major carriers from Wikipedia 'most-flown routes', otherwise from curated common knowledge — exact #1 vs #2 can be fuzzy.";
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
const DEFAULT_SETTINGS: Settings = { sound: true, haptics: true, keyboardHints: true };

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
