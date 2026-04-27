import airportData from '../data/airport-wordle.json';
import curatedPhotos from '../data/airport-photos.json';

export type HubAlliance = 'Star Alliance' | 'SkyTeam' | 'oneworld' | 'Independent';
export type Region = 'NA' | 'SA' | 'EU' | 'ME' | 'AF' | 'AS' | 'OC';
export type TrafficTier = 'Mega' | 'Large' | 'Mid' | 'Small';
export type LatBand = 'Tropical' | 'Subtropical' | 'Temperate' | 'Polar';

export interface AirportEntry {
  iata: string;
  name: string;
  country: string;
  city: string;
  runways: number;
  terminals: number;
  paxYearlyM: number;
  hubAlliance: HubAlliance;
  lat: number;
  wikipedia: string;
  commonsCategory?: string;
}

export type AirportDifficulty = 'easy' | 'medium' | 'hard';

export const airports = airportData as AirportEntry[];

const REGION_MAP: Record<string, Region> = {
  'United States': 'NA', 'Canada': 'NA', 'Mexico': 'NA', 'Panama': 'NA', 'Trinidad and Tobago': 'NA',
  'Argentina': 'SA', 'Brazil': 'SA', 'Chile': 'SA', 'Colombia': 'SA', 'Peru': 'SA',
  'Austria': 'EU', 'Belgium': 'EU', 'Bulgaria': 'EU', 'Croatia': 'EU', 'Czech Republic': 'EU',
  'Denmark': 'EU', 'Estonia': 'EU', 'Finland': 'EU', 'France': 'EU', 'Germany': 'EU',
  'Greece': 'EU', 'Hungary': 'EU', 'Iceland': 'EU', 'Ireland': 'EU', 'Italy': 'EU',
  'Latvia': 'EU', 'Luxembourg': 'EU', 'Netherlands': 'EU', 'Norway': 'EU', 'Poland': 'EU',
  'Portugal': 'EU', 'Romania': 'EU', 'Russia': 'EU', 'Serbia': 'EU', 'Slovakia': 'EU',
  'Slovenia': 'EU', 'Spain': 'EU', 'Sweden': 'EU', 'Switzerland': 'EU', 'Turkey': 'EU',
  'Ukraine': 'EU', 'United Kingdom': 'EU',
  'Bahrain': 'ME', 'Israel': 'ME', 'Jordan': 'ME', 'Kuwait': 'ME', 'Oman': 'ME',
  'Qatar': 'ME', 'Saudi Arabia': 'ME', 'United Arab Emirates': 'ME', 'Lebanon': 'ME', 'Iran': 'ME',
  'Egypt': 'AF', 'Ethiopia': 'AF', 'Kenya': 'AF', 'Mauritius': 'AF', 'Morocco': 'AF',
  'Rwanda': 'AF', 'South Africa': 'AF', 'Nigeria': 'AF', 'Tanzania': 'AF',
  'Azerbaijan': 'AS', 'Brunei': 'AS', 'China': 'AS', 'Hong Kong': 'AS', 'India': 'AS',
  'Indonesia': 'AS', 'Japan': 'AS', 'Kazakhstan': 'AS', 'Malaysia': 'AS', 'Pakistan': 'AS',
  'Philippines': 'AS', 'Singapore': 'AS', 'South Korea': 'AS', 'Sri Lanka': 'AS',
  'Taiwan': 'AS', 'Thailand': 'AS', 'Uzbekistan': 'AS', 'Vietnam': 'AS', 'Mongolia': 'AS',
  'Cambodia': 'AS', 'Myanmar': 'AS', 'Maldives': 'AS', 'Bangladesh': 'AS',
  'Australia': 'OC', 'New Zealand': 'OC', 'Fiji': 'OC', 'Papua New Guinea': 'OC', 'New Caledonia': 'OC', 'Guam': 'OC',
};

export function regionOf(country: string): Region | undefined {
  return REGION_MAP[country];
}

const REGION_LABEL: Record<Region, string> = {
  NA: 'North America', SA: 'South America', EU: 'Europe',
  ME: 'Middle East', AF: 'Africa', AS: 'Asia', OC: 'Oceania',
};
export function regionLabel(r: Region): string { return REGION_LABEL[r]; }

const TRAFFIC_ORDER: TrafficTier[] = ['Small', 'Mid', 'Large', 'Mega'];
export function trafficTier(pax: number): TrafficTier {
  if (pax >= 60) return 'Mega';
  if (pax >= 30) return 'Large';
  if (pax >= 10) return 'Mid';
  return 'Small';
}

const LAT_ORDER: LatBand[] = ['Tropical', 'Subtropical', 'Temperate', 'Polar'];
export function latBand(lat: number): LatBand {
  const a = Math.abs(lat);
  if (a < 23.5) return 'Tropical';
  if (a < 35) return 'Subtropical';
  if (a < 60) return 'Temperate';
  return 'Polar';
}

const RUNWAY_BUCKETS = ['1', '2', '3', '4+'] as const;
export type RunwayBucket = typeof RUNWAY_BUCKETS[number];
export function runwayBucket(n: number): RunwayBucket {
  if (n <= 1) return '1';
  if (n === 2) return '2';
  if (n === 3) return '3';
  return '4+';
}

const TERMINAL_BUCKETS = ['Single', '2–3', '4+'] as const;
export type TerminalBucket = typeof TERMINAL_BUCKETS[number];
export function terminalBucket(n: number): TerminalBucket {
  if (n <= 1) return 'Single';
  if (n <= 3) return '2–3';
  return '4+';
}

// Difficulty pools.
const EASY_IATAS = new Set([
  'JFK', 'LHR', 'CDG', 'DXB', 'NRT', 'LAX', 'FRA', 'SIN', 'HKG', 'AMS',
  'ORD', 'ATL', 'IST', 'SYD', 'BCN', 'MAD', 'ICN', 'PEK', 'DOH', 'SFO',
]);
// Hard pool: confusables / regional.
const HARD_IATAS = new Set([
  'LGA', 'EWR', 'IAD', 'BWI', 'MDW', 'HND', 'KIX', 'PKX', 'PVG', 'CAN',
  'LGW', 'STN', 'LCY', 'ORY', 'BVA', 'HAM', 'TXL', 'BER', 'MUC', 'DUS',
  'GRU', 'GIG', 'SCL', 'EZE', 'BOG', 'MEX', 'YYZ', 'YVR', 'YUL',
]);

export function airportsForDifficulty(d: AirportDifficulty): AirportEntry[] {
  if (d === 'easy') return airports.filter((a) => EASY_IATAS.has(a.iata));
  if (d === 'hard') return airports.filter((a) => HARD_IATAS.has(a.iata));
  return airports;
}

export function airportEntryByIata(iata: string): AirportEntry | null {
  return airports.find((a) => a.iata === iata) ?? null;
}

// --- Comparison ---------------------------------------------------------

export type AttrMatch = 'hit' | 'close' | 'miss';

export interface AttributeFeedback {
  key: 'country' | 'region' | 'alliance' | 'traffic' | 'runways' | 'terminals' | 'lat';
  label: string;
  guessValue: string;
  match: AttrMatch;
  hint?: 'higher' | 'lower';
}

export function compareAttributes(guess: AirportEntry, answer: AirportEntry): AttributeFeedback[] {
  const out: AttributeFeedback[] = [];

  out.push({
    key: 'country',
    label: 'Country',
    guessValue: guess.country,
    match: guess.country === answer.country ? 'hit' : 'miss',
  });

  const gr = regionOf(guess.country);
  const ar = regionOf(answer.country);
  out.push({
    key: 'region',
    label: 'Region',
    guessValue: gr ? regionLabel(gr) : guess.country,
    match: gr && ar && gr === ar ? 'hit' : 'miss',
  });

  out.push({
    key: 'alliance',
    label: 'Alliance hub',
    guessValue: guess.hubAlliance,
    match: guess.hubAlliance === answer.hubAlliance ? 'hit' : 'miss',
  });

  const gt = trafficTier(guess.paxYearlyM);
  const at = trafficTier(answer.paxYearlyM);
  const tDiff = TRAFFIC_ORDER.indexOf(gt) - TRAFFIC_ORDER.indexOf(at);
  out.push({
    key: 'traffic',
    label: 'Traffic',
    guessValue: gt,
    match: tDiff === 0 ? 'hit' : Math.abs(tDiff) === 1 ? 'close' : 'miss',
    hint: tDiff === 0 ? undefined : tDiff > 0 ? 'lower' : 'higher',
  });

  const gRun = runwayBucket(guess.runways);
  const aRun = runwayBucket(answer.runways);
  const rDiff = RUNWAY_BUCKETS.indexOf(gRun) - RUNWAY_BUCKETS.indexOf(aRun);
  out.push({
    key: 'runways',
    label: 'Runways',
    guessValue: gRun,
    match: rDiff === 0 ? 'hit' : Math.abs(rDiff) === 1 ? 'close' : 'miss',
    hint: rDiff === 0 ? undefined : rDiff > 0 ? 'lower' : 'higher',
  });

  const gTerm = terminalBucket(guess.terminals);
  const aTerm = terminalBucket(answer.terminals);
  out.push({
    key: 'terminals',
    label: 'Terminals',
    guessValue: gTerm,
    match: gTerm === aTerm ? 'hit' : 'miss',
  });

  const gLat = latBand(guess.lat);
  const aLat = latBand(answer.lat);
  const lDiff = LAT_ORDER.indexOf(gLat) - LAT_ORDER.indexOf(aLat);
  out.push({
    key: 'lat',
    label: 'Latitude',
    guessValue: gLat,
    match: lDiff === 0 ? 'hit' : Math.abs(lDiff) === 1 ? 'close' : 'miss',
    hint: lDiff === 0 ? undefined : lDiff > 0 ? 'lower' : 'higher',
  });

  return out;
}

export interface AttributeInfo {
  label: string;
  description: string;
  values: string[];
}

function uniqueSorted<T extends string | number>(values: T[]): T[] {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b))) as T[];
}

export const ATTRIBUTE_INFO: AttributeInfo[] = [
  {
    label: 'Country',
    description: 'Country the airport is in.',
    values: uniqueSorted(airports.map((a) => a.country)),
  },
  {
    label: 'Region',
    description: 'Continental region. Same region = hit.',
    values: ['North America', 'South America', 'Europe', 'Middle East', 'Africa', 'Asia', 'Oceania'],
  },
  {
    label: 'Alliance hub',
    description: 'Alliance of the airport\'s dominant carrier (Independent if none).',
    values: ['Star Alliance', 'SkyTeam', 'oneworld', 'Independent'],
  },
  {
    label: 'Traffic',
    description: 'Annual passenger tier. ▲/▼ on close means one tier off.',
    values: ['Small (<10M)', 'Mid (10–30M)', 'Large (30–60M)', 'Mega (60M+)'],
  },
  {
    label: 'Runways',
    description: 'Operational runway count. ▲/▼ on close means one bucket off.',
    values: ['1', '2', '3', '4+'],
  },
  {
    label: 'Terminals',
    description: 'Passenger terminal count.',
    values: ['Single', '2–3', '4+'],
  },
  {
    label: 'Latitude',
    description: 'Latitude band by absolute degrees. ▲/▼ on close means one band off.',
    values: ['Tropical (<23.5°)', 'Subtropical (23.5–35°)', 'Temperate (35–60°)', 'Polar (60°+)'],
  },
];

// --- Photos -------------------------------------------------------------

const imageListCache = new Map<string, string[]>();
const inFlight = new Map<string, Promise<string[]>>();

interface CommonsImageInfo { url?: string; thumburl?: string }
interface CommonsPage { title?: string; imageinfo?: CommonsImageInfo[] }

const SKIP_KEYWORDS = [
  'cockpit', 'flight_deck', 'lounge', 'gate', 'check-in', 'check_in',
  'boarding', 'baggage', 'security', 'duty', 'shop', 'food', 'restaurant',
  'logo', 'patch', 'emblem', 'diagram', 'map', '.svg', '.pdf',
  'interior', 'cabin', 'seat',
];
function looksUseful(title: string): boolean {
  const t = title.toLowerCase();
  return !SKIP_KEYWORDS.some((k) => t.includes(k));
}

function fetchWithTimeout(url: string, ms = 12000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { signal: ctl.signal }).finally(() => clearTimeout(t));
}

async function fetchFromCommonsCategory(category: string): Promise<string[]> {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json` +
    `&generator=categorymembers&gcmtitle=${encodeURIComponent('Category:' + category)}` +
    `&gcmtype=file&gcmlimit=50` +
    `&prop=imageinfo&iiprop=url&iiurlwidth=1200&origin=*`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = await res.json();
    const pages: Record<string, CommonsPage> = json?.query?.pages ?? {};
    const out: string[] = [];
    for (const k in pages) {
      const p = pages[k];
      const title = p.title ?? '';
      if (!looksUseful(title)) continue;
      const info = p.imageinfo?.[0];
      const src = info?.thumburl ?? info?.url;
      if (src) out.push(src);
    }
    return out;
  } catch { return []; }
}

async function fetchFromWikiMediaList(wikiTitle: string): Promise<string[]> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(wikiTitle)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = await res.json();
    const items: { type: string; title?: string; srcset?: { src: string; scale?: string }[] }[] = json?.items ?? [];
    const out: string[] = [];
    for (const item of items) {
      if (item.type !== 'image') continue;
      const title = item.title ?? '';
      if (!looksUseful(title)) continue;
      if (!item.srcset || item.srcset.length === 0) continue;
      const oneX = item.srcset.find((s) => s.scale === '1x') ?? item.srcset[0];
      const raw = oneX.src;
      out.push(raw.startsWith('//') ? `https:${raw}` : raw);
    }
    return out;
  } catch { return []; }
}

const CURATED = curatedPhotos as Record<string, string[]>;

export async function fetchAirportImages(ap: AirportEntry): Promise<string[]> {
  const curated = CURATED[ap.iata];
  if (curated && curated.length > 0) return curated;

  const cacheKey = ap.iata;
  if (imageListCache.has(cacheKey)) return imageListCache.get(cacheKey) ?? [];
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    const category = ap.commonsCategory ?? ap.wikipedia;
    const [fromCategory, fromArticle] = await Promise.all([
      fetchFromCommonsCategory(category),
      fetchFromWikiMediaList(ap.wikipedia),
    ]);
    const seen = new Set<string>();
    const combined: string[] = [];
    for (const src of [...fromCategory, ...fromArticle]) {
      if (!seen.has(src)) { seen.add(src); combined.push(src); }
    }
    if (combined.length > 0) imageListCache.set(cacheKey, combined);
    inFlight.delete(cacheKey);
    return combined;
  })();
  inFlight.set(cacheKey, promise);
  return promise;
}

// --- Round picking ------------------------------------------------------

export const AIRPORT_ROUND_LENGTH = 5;
export const AIRPORT_WORDLE_MAX_GUESSES = 6;
export const AIRPORT_WORDLE_HARD_MAX_GUESSES = 5;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickRoundAirport(count: number, difficulty: AirportDifficulty = 'medium'): AirportEntry[] {
  const pool = airportsForDifficulty(difficulty);
  return shuffle(pool).slice(0, count);
}
