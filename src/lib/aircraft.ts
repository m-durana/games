import aircraftData from '../data/aircraft.json';
import curatedPhotos from '../data/aircraft-photos.json';
import { loadPool } from './engine';

const CURATED = curatedPhotos as Record<string, string[]>;

export interface AircraftIdentification {
  manufacturer: string;
  family: string;
  variant: string;
}

export interface Aircraft {
  id: string;
  name: string;
  manufacturer: string;
  family: string;
  body: 'Narrow' | 'Wide';
  engines: number;
  engineType: 'Turbofan' | 'Turboprop';
  length: number; // overall length in meters
  tail: 'Conventional' | 'T-tail';
  generation: number;
  wikipedia: string;
  commonsCategory?: string;
  identification: AircraftIdentification;
  keyTell: string;
}

export type LengthBucket = 'Short' | 'Medium' | 'Long' | 'XL';
const LENGTH_ORDER: LengthBucket[] = ['Short', 'Medium', 'Long', 'XL'];

export function lengthBucket(meters: number): LengthBucket {
  if (meters < 35) return 'Short';
  if (meters < 45) return 'Medium';
  if (meters < 60) return 'Long';
  return 'XL';
}

export type AircraftDifficulty = 'easy' | 'medium' | 'hard';

export const aircraft = aircraftData as Aircraft[];

// Easy: visually distinct, no confusable variants. The classic widebodies +
// the dominant single-aisle families.
const EASY_IDS = new Set([
  'a320', 'a330', 'a350', 'a380',
  'b737ng', 'b747', 'b757', 'b767', 'b777', 'b787',
  'e190', 'atr72',
]);

// Hard: only the confusable variants — same family or near-twin to something
// in Easy. Forces the player to actually distinguish A319 vs A320 vs A321,
// 737 Classic vs NG vs MAX, CRJ200 vs 700 vs 900, E170 vs E175, etc. Cuts
// out the easy iconic aircraft so Hard isn't just "Medium + a few extras".
const HARD_IDS = new Set([
  // Airbus narrow-body variants and older widebody
  'a318', 'a319', 'a321', 'a220', 'a300', 'a310', 'a340-600',
  // Airbus widebody variants
  'a330-200', 'a330neo', 'a350-1000',
  // 737 family + close cousins + retired
  'b737classic', 'b737-700', 'b737-900', 'b737max', 'b717', 'b727', 'md83', 'md90',
  // 777 variants
  'b777-200', 'b777-9',
  // Embraer regional family
  'e170', 'e175', 'e195e2',
  // CRJ family
  'crj200', 'crj700', 'crj900', 'crj1000',
  // Turboprops
  'dash8q400', 'dash8classic', 'atr42',
  // Other / international
  'ssj100', 'c919',
]);

const US_AIRCRAFT_MAKERS = new Set(['Boeing', 'McDonnell Douglas']);
function applyPool(list: Aircraft[]): Aircraft[] {
  return loadPool() === 'us' ? list.filter((a) => US_AIRCRAFT_MAKERS.has(a.manufacturer)) : list;
}

export function pooledAircraft(): Aircraft[] {
  return applyPool(aircraft);
}

export function aircraftForDifficulty(difficulty: AircraftDifficulty): Aircraft[] {
  if (difficulty === 'easy') return applyPool(aircraft.filter((a) => EASY_IDS.has(a.id)));
  if (difficulty === 'hard') return applyPool(aircraft.filter((a) => HARD_IDS.has(a.id)));
  return applyPool(aircraft);
}

// Human-readable explanation of each Wordle attribute and the values it can
// take. Surfaced from the wordle UI when the player taps a column header.
export interface AttributeInfo {
  label: string;
  description: string;
  values: string[];
}

export const ATTRIBUTE_INFO: AttributeInfo[] = [
  {
    label: 'Maker',
    description: 'The aircraft manufacturer.',
    values: ['Airbus', 'Boeing', 'Embraer', 'Bombardier', 'McDonnell Douglas', 'ATR', 'De Havilland', 'Sukhoi', 'COMAC'],
  },
  {
    label: 'Body',
    description: 'Single-aisle (narrow) or twin-aisle (wide) cabin.',
    values: ['Narrow', 'Wide'],
  },
  {
    label: 'Length',
    description: 'Overall length, bucketed. ▲ / ▼ on a "close" hint mean the answer is one bucket up or down.',
    values: ['Short (<35 m)', 'Medium (35–45 m)', 'Long (45–60 m)', 'XL (60 m+)'],
  },
  {
    label: 'Engines',
    description: 'Number of engines on the aircraft.',
    values: ['2', '3', '4'],
  },
  {
    label: 'Engine',
    description: 'Engine type — turbofan jets vs turboprops.',
    values: ['Turbofan', 'Turboprop'],
  },
  {
    label: 'Tail',
    description: 'Tail configuration.',
    values: ['Conventional', 'T-tail'],
  },
  {
    label: 'Era',
    description: 'Decade of service entry. ▲ / ▼ on a "close" hint mean the answer is within ~10 years.',
    values: ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'],
  },
];

export function aircraftById(id: string): Aircraft | null {
  return aircraft.find((a) => a.id === id) ?? null;
}

export type AttrMatch = 'hit' | 'close' | 'miss';

export interface AttributeFeedback {
  key: 'manufacturer' | 'body' | 'length' | 'engines' | 'engineType' | 'tail' | 'generation';
  label: string;
  guessValue: string;
  match: AttrMatch;
  hint?: 'higher' | 'lower';
}

export function compareAttributes(guess: Aircraft, answer: Aircraft): AttributeFeedback[] {
  const out: AttributeFeedback[] = [];

  out.push({
    key: 'manufacturer',
    label: 'Maker',
    guessValue: guess.manufacturer,
    match: guess.manufacturer === answer.manufacturer ? 'hit' : 'miss',
  });

  out.push({
    key: 'body',
    label: 'Body',
    guessValue: guess.body,
    match: guess.body === answer.body ? 'hit' : 'miss',
  });

  const guessBucket = lengthBucket(guess.length);
  const answerBucket = lengthBucket(answer.length);
  const lenDiff = LENGTH_ORDER.indexOf(guessBucket) - LENGTH_ORDER.indexOf(answerBucket);
  out.push({
    key: 'length',
    label: 'Length',
    guessValue: guessBucket,
    match: lenDiff === 0 ? 'hit' : Math.abs(lenDiff) === 1 ? 'close' : 'miss',
    hint: lenDiff === 0 ? undefined : lenDiff > 0 ? 'lower' : 'higher',
  });

  const engineDiff = guess.engines - answer.engines;
  out.push({
    key: 'engines',
    label: 'Engines',
    guessValue: String(guess.engines),
    match: engineDiff === 0 ? 'hit' : Math.abs(engineDiff) === 1 ? 'close' : 'miss',
    hint: engineDiff === 0 ? undefined : engineDiff > 0 ? 'lower' : 'higher',
  });

  out.push({
    key: 'engineType',
    label: 'Engine',
    guessValue: guess.engineType,
    match: guess.engineType === answer.engineType ? 'hit' : 'miss',
  });

  out.push({
    key: 'tail',
    label: 'Tail',
    guessValue: guess.tail === 'T-tail' ? 'T-tail' : 'Conv.',
    match: guess.tail === answer.tail ? 'hit' : 'miss',
  });

  const genDiff = guess.generation - answer.generation;
  const genGap = Math.abs(genDiff);
  out.push({
    key: 'generation',
    label: 'Era',
    guessValue: `${guess.generation}s`,
    match: genGap === 0 ? 'hit' : genGap <= 10 ? 'close' : 'miss',
    hint: genDiff === 0 ? undefined : genDiff > 0 ? 'lower' : 'higher',
  });

  return out;
}

// --- Image fetching ---------------------------------------------------

const SKIP_PATTERNS = [
  'cockpit', 'flight_deck', 'flightdeck', 'interior', 'cabin', 'seat',
  'galley', 'lavatory', 'cargo_hold', 'cutaway', 'cross_section', 'crosssection',
  'diagram', 'schematic', 'drawing', 'blueprint', 'plan_view', 'planview',
  'three_view', 'threeview', '3-view', '3view', 'silhouette',
  'engine_test', 'rollout', 'assembly', 'factory', 'production_line',
  'logo', 'emblem', 'patch', 'insignia',
  'route_map', 'orders', 'delivery_chart', 'orderchart', 'deliveries',
  'wing_root', 'landing_gear_close',
];

function looksUseful(filename: string): boolean {
  const f = filename.toLowerCase();
  if (!/\.(jpe?g|png|webp)$/.test(f)) return false;
  for (const p of SKIP_PATTERNS) {
    if (f.includes(p)) return false;
  }
  return true;
}

const imageListCache = new Map<string, string[]>();
const inFlight = new Map<string, Promise<string[]>>();

interface CommonsImageInfo {
  url?: string;
  thumburl?: string;
}
interface CommonsPage {
  title?: string;
  imageinfo?: CommonsImageInfo[];
}

function fetchWithTimeout(url: string, ms = 12000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { signal: ctl.signal }).finally(() => clearTimeout(t));
}

async function fetchCategoryFiles(category: string, limit = 50): Promise<string[]> {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json` +
    `&generator=categorymembers&gcmtitle=${encodeURIComponent('Category:' + category)}` +
    `&gcmtype=file&gcmlimit=${limit}` +
    `&prop=imageinfo&iiprop=url&iiurlwidth=800&origin=*`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = await res.json();
    const pages: Record<string, CommonsPage> = json?.query?.pages ?? {};
    const out: string[] = [];
    for (const key in pages) {
      const p = pages[key];
      const title = p.title ?? '';
      if (!looksUseful(title)) continue;
      const info = p.imageinfo?.[0];
      const src = info?.thumburl ?? info?.url;
      if (src) out.push(src);
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchSubcategoryNames(category: string, limit = 25): Promise<string[]> {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json` +
    `&list=categorymembers&cmtitle=${encodeURIComponent('Category:' + category)}` +
    `&cmtype=subcat&cmlimit=${limit}&origin=*`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = await res.json();
    const items: { title?: string }[] = json?.query?.categorymembers ?? [];
    return items
      .map((i) => (i.title ?? '').replace(/^Category:/, ''))
      .filter((t) => t.length > 0);
  } catch {
    return [];
  }
}

async function fetchFromCommonsCategory(category: string): Promise<string[]> {
  // Pull files directly under the category, plus files from up to 25 first-level
  // subcategories. Wikimedia Commons usually nests photos under per-airline /
  // per-registration subcats, so a one-level crawl is needed to find more than
  // a handful of images for many aircraft types.
  const [direct, subs] = await Promise.all([
    fetchCategoryFiles(category, 50),
    fetchSubcategoryNames(category, 25),
  ]);
  const seen = new Set<string>(direct);
  const out: string[] = [...direct];
  const subResults = await Promise.all(subs.map((s) => fetchCategoryFiles(s, 20)));
  for (const list of subResults) {
    for (const u of list) {
      if (!seen.has(u)) {
        seen.add(u);
        out.push(u);
        if (out.length >= 250) return out;
      }
    }
  }
  return out;
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
      const full = raw.startsWith('//') ? `https:${raw}` : raw;
      // Wikimedia thumb URLs look like .../thumb/x/yy/FILE.jpg/1280px-FILE.jpg
      // Rewrite to 800px so the review UI doesn't pull oversized images.
      const small = full.replace(/\/\d{3,4}px-/, '/800px-');
      out.push(small);
    }
    return out;
  } catch {
    return [];
  }
}

export async function fetchAircraftImages(plane: Aircraft): Promise<string[]> {
  const curated = CURATED[plane.id];
  if (curated && curated.length > 0) return curated;

  const cacheKey = plane.id;
  if (imageListCache.has(cacheKey)) return imageListCache.get(cacheKey) ?? [];
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    const category = plane.commonsCategory ?? plane.wikipedia;
    const [fromCategory, fromArticle] = await Promise.all([
      fetchFromCommonsCategory(category),
      fetchFromWikiMediaList(plane.wikipedia),
    ]);
    // Combine, deduplicate by URL.
    const seen = new Set<string>();
    const combined: string[] = [];
    for (const src of [...fromCategory, ...fromArticle]) {
      if (!seen.has(src)) {
        seen.add(src);
        combined.push(src);
      }
    }
    // Don't cache empty results — likely a transient timeout / rate-limit.
    if (combined.length > 0) imageListCache.set(cacheKey, combined);
    inFlight.delete(cacheKey);
    return combined;
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}

// --- Round picking ----------------------------------------------------

export const AIRCRAFT_ROUND_LENGTH = 5;
export const WORDLE_MAX_GUESSES = 6;
export const WORDLE_HARD_MAX_GUESSES = 5;

export function pickRoundAircraft(count: number, difficulty: AircraftDifficulty = 'medium'): Aircraft[] {
  const pool = aircraftForDifficulty(difficulty);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
