import airportData from '../data/airports-canonical.json';
import curatedPhotos from '../data/airport-photos.json';
import curatedAerials from '../data/airport-aerials.json';
import reviewState from '../data/airport-review-state.json';
import { poolCountryFilter } from './engine';

interface ReviewAerialSpec {
  provider: 'arcgis' | 'mapbox' | 'azure';
  lat: number;
  lon: number;
  zoom: number;
}
interface ReviewStateEntry {
  aerial?: ReviewAerialSpec | null;
  approved?: string[];
}
const REVIEW_STATE = reviewState as Record<string, ReviewStateEntry>;

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

export type CanonicalAirportEntry = Partial<AirportEntry> & Pick<AirportEntry, 'iata' | 'name' | 'country'>;

export type AirportDifficulty = 'easy' | 'medium' | 'hard';

export const allAirports = airportData as CanonicalAirportEntry[];

export function hasAirportGameFacts(a: CanonicalAirportEntry): a is AirportEntry {
  return typeof a.city === 'string' &&
    typeof a.runways === 'number' &&
    typeof a.terminals === 'number' &&
    typeof a.paxYearlyM === 'number' &&
    typeof a.hubAlliance === 'string' &&
    typeof a.lat === 'number' &&
    typeof a.wikipedia === 'string';
}

export const airports = allAirports.filter(hasAirportGameFacts);

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

// Sub-national hint (state / province) for large countries where the country
// alone is too broad to be a useful hint. Keyed by IATA. Falls back to country
// when not present.
const ADMIN1_BY_IATA: Record<string, string> = {
  // United States
  ATL: 'Georgia', AUS: 'Texas', BNA: 'Tennessee', BOS: 'Massachusetts',
  BWI: 'Maryland', CLT: 'North Carolina', DAL: 'Texas', DCA: 'Virginia',
  DEN: 'Colorado', DFW: 'Texas', DTW: 'Michigan', EWR: 'New Jersey',
  FLL: 'Florida', HNL: 'Hawaii', HOU: 'Texas', IAD: 'Virginia',
  IAH: 'Texas', JFK: 'New York', LAS: 'Nevada', LAX: 'California',
  LGA: 'New York', MCO: 'Florida', MDW: 'Illinois', MIA: 'Florida',
  MSP: 'Minnesota', OAK: 'California', ORD: 'Illinois', PDX: 'Oregon',
  PHL: 'Pennsylvania', PHX: 'Arizona', PIT: 'Pennsylvania', RDU: 'North Carolina',
  SAN: 'California', SAT: 'Texas', SEA: 'Washington', SFO: 'California',
  SJC: 'California', SLC: 'Utah', STL: 'Missouri', TPA: 'Florida',
  // Canada
  YEG: 'Alberta', YYC: 'Alberta', YHZ: 'Nova Scotia',
  YOW: 'Ontario', YTZ: 'Ontario', YYZ: 'Ontario', YUL: 'Quebec',
  // Australia
  ADL: 'South Australia', BNE: 'Queensland', OOL: 'Queensland',
  CBR: 'ACT', MEL: 'Victoria', PER: 'Western Australia', SYD: 'New South Wales',
  // Brazil
  BSB: 'Distrito Federal', FOR: 'Ceará', GIG: 'Rio de Janeiro',
  GRU: 'São Paulo', VCP: 'São Paulo', REC: 'Pernambuco', SSA: 'Bahia',
  // India
  AMD: 'Gujarat', BLR: 'Karnataka', BOM: 'Maharashtra', PNQ: 'Maharashtra',
  CCU: 'West Bengal', COK: 'Kerala', TRV: 'Kerala', DEL: 'Delhi NCT',
  GOI: 'Goa', HYD: 'Telangana', MAA: 'Tamil Nadu',
  // China
  CAN: 'Guangdong', SZX: 'Guangdong', CKG: 'Chongqing', CTU: 'Sichuan',
  TFU: 'Sichuan', HAK: 'Hainan', HGH: 'Zhejiang', KMG: 'Yunnan',
  PEK: 'Beijing', PKX: 'Beijing', PVG: 'Shanghai', SHA: 'Shanghai',
  TSN: 'Tianjin', XIY: 'Shaanxi',
  // Mexico
  ACA: 'Guerrero', CUN: 'Quintana Roo', GDL: 'Jalisco',
  MEX: 'CDMX', MTY: 'Nuevo León', PVR: 'Jalisco', TIJ: 'Baja California',
  // Japan (a few prefectures help disambiguate non-Tokyo airports)
  CTS: 'Hokkaido', OKA: 'Okinawa',
};
export function admin1Of(iata: string): string | undefined {
  return ADMIN1_BY_IATA[iata];
}

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

// Difficulty is paxYearlyM-based, applied within whatever pool the caller
// chose. A small EASY_FORCE / HARD_FORCE override list exists for airports
// whose recognizability doesn't track passenger volume (e.g. KBP).
const EASY_PAX_THRESHOLD = 50;   // ~mega hubs
const HARD_PAX_THRESHOLD = 25;   // ~Mid/Small tier
const EASY_FORCE = new Set<string>([
  // Iconic enough to be easy regardless of pax tier.
  'SYD', 'ZRH', 'KEF',
]);
const HARD_FORCE = new Set<string>([
  // Pax-large but recognizability is regional - keep them in hard.
  'KBP', 'LED', 'SVO', 'PVG', 'PEK',
  'CGK', 'CAN', 'CTU', 'KMG', 'XIY',
  'JED', 'RUH', 'CMB', 'BLR', 'BOM',
]);

function applyPool(list: AirportEntry[]): AirportEntry[] {
  return list.filter((a) => poolCountryFilter(a.country));
}

export function pooledAirports(): AirportEntry[] {
  return applyPool(airports);
}

// Source of truth for "this airport has been reviewed and is playable in the
// Identify game" - requires both an approved aerial spec and at least one
// approved ground photo in the bundled review state.
export function isReviewedAirport(iata: string): boolean {
  const e = REVIEW_STATE[iata];
  return !!(e && e.aerial && e.approved && e.approved.length > 0);
}

export function reviewedAirports(): AirportEntry[] {
  return applyPool(airports.filter((a) => isReviewedAirport(a.iata)));
}

export function airportsForDifficulty(d: AirportDifficulty): AirportEntry[] {
  const pool = reviewedAirports();
  if (d === 'easy') {
    return pool.filter(
      (a) => !HARD_FORCE.has(a.iata) && (a.paxYearlyM >= EASY_PAX_THRESHOLD || EASY_FORCE.has(a.iata)),
    );
  }
  if (d === 'hard') {
    return pool.filter((a) => (a.paxYearlyM < HARD_PAX_THRESHOLD || HARD_FORCE.has(a.iata)) && !EASY_FORCE.has(a.iata));
  }
  return pool;
}

export function airportWordleAirportsForDifficulty(d: AirportDifficulty): AirportEntry[] {
  const pool = pooledAirports();
  if (d === 'easy') {
    return pool.filter(
      (a) => !HARD_FORCE.has(a.iata) && (a.paxYearlyM >= EASY_PAX_THRESHOLD || EASY_FORCE.has(a.iata)),
    );
  }
  if (d === 'hard') {
    return pool.filter((a) => (a.paxYearlyM < HARD_PAX_THRESHOLD || HARD_FORCE.has(a.iata)) && !EASY_FORCE.has(a.iata));
  }
  return pool;
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
const AERIALS = curatedAerials as Record<string, string>;

// Build the ArcGIS export URL from a review-state spec. Mirrors the
// AirportReview tool's `buildAerialUrl` for arcgis (the only provider used by
// review state today). Country-aware closest-span keeps US frames tighter.
function buildArcgisAerialUrl(spec: ReviewAerialSpec, country: string): string {
  const closest = country === 'United States' ? 0.006 : 0.008;
  const span = closest * Math.pow(2, Math.max(0, spec.zoom));
  const half = span / 2;
  const west = spec.lon - half, east = spec.lon + half;
  const south = spec.lat - half, north = spec.lat + half;
  const endpoint = country === 'United States'
    ? 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage'
    : 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export';
  const params = new URLSearchParams({
    bbox: `${west},${south},${east},${north}`,
    bboxSR: '4326', imageSR: '4326', size: '1024,1024',
    format: country === 'United States' ? 'jpgpng' : 'jpg', f: 'image',
  });
  return `${endpoint}?${params.toString()}`;
}

export function airportAerialUrl(iata: string): string | null {
  const spec = REVIEW_STATE[iata]?.aerial;
  if (spec && spec.provider === 'arcgis') {
    const ap = airports.find((a) => a.iata === iata);
    if (ap) return buildArcgisAerialUrl(spec, ap.country);
  }
  return AERIALS[iata] ?? null;
}

export function airportApprovedPhotos(iata: string): string[] {
  const e = REVIEW_STATE[iata];
  return e?.approved ?? [];
}

// Canonical key for a Wikimedia Commons image: the underlying filename.
// Necessary because the same file can surface from category and article
// endpoints with different thumb widths and `/thumb/` prefixes, defeating a
// raw URL Set.
export function commonsFileKey(url: string): string {
  // matches .../commons/<x>/<xx>/<File> and .../commons/thumb/<x>/<xx>/<File>/<size>px-<File>
  const m = url.match(/\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+?)(?:\/\d+px-[^/?#]+)?(?:[?#].*)?$/i);
  return m ? decodeURIComponent(m[1]).toLowerCase() : url.toLowerCase();
}

export function dedupeByCommonsFile(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const k = commonsFileKey(u);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(u);
  }
  return out;
}

// Wikipedia/Commons fetch - always live, used by the review tool which needs
// the full candidate set regardless of what's already curated.
export async function fetchAirportCandidates(ap: AirportEntry): Promise<string[]> {
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
    const combined = dedupeByCommonsFile([...fromCategory, ...fromArticle]);
    if (combined.length > 0) imageListCache.set(cacheKey, combined);
    inFlight.delete(cacheKey);
    return combined;
  })();
  inFlight.set(cacheKey, promise);
  return promise;
}

export async function fetchAirportImages(ap: AirportEntry): Promise<string[]> {
  const aerial = airportAerialUrl(ap.iata);
  // Approved photos from review state win over the legacy curated list -
  // they're the explicit "I checked these and they're good" set.
  const approved = airportApprovedPhotos(ap.iata);
  const curated = approved.length > 0 ? approved : (CURATED[ap.iata] ?? []);
  if (curated.length > 0) {
    return aerial ? [aerial, ...curated] : curated;
  }
  const live = await fetchAirportCandidates(ap);
  if (aerial && !live.includes(aerial)) return [aerial, ...live];
  return live;
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

export function pickAirportWordleRound(count: number, difficulty: AirportDifficulty = 'medium'): AirportEntry[] {
  const pool = airportWordleAirportsForDifficulty(difficulty);
  return shuffle(pool).slice(0, count);
}
