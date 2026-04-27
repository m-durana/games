import aircraftData from '../data/aircraft.json';

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

// Curated iconic types for Easy mode — visually distinct, no confusable variants.
const EASY_IDS = new Set([
  'a320', 'a321', 'a330', 'a350', 'a380',
  'b737ng', 'b747', 'b777', 'b787',
  'e190', 'atr72', 'crj900',
]);

export function aircraftForDifficulty(difficulty: AircraftDifficulty): Aircraft[] {
  if (difficulty === 'easy') return aircraft.filter((a) => EASY_IDS.has(a.id));
  return aircraft;
}

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

async function fetchFromCommonsCategory(category: string): Promise<string[]> {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json` +
    `&generator=categorymembers&gcmtitle=${encodeURIComponent('Category:' + category)}` +
    `&gcmtype=file&gcmlimit=50` +
    `&prop=imageinfo&iiprop=url&iiurlwidth=1200&origin=*`;
  try {
    const res = await fetch(url);
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

async function fetchFromWikiMediaList(wikiTitle: string): Promise<string[]> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(wikiTitle)}`;
    const res = await fetch(url);
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
      out.push(full);
    }
    return out;
  } catch {
    return [];
  }
}

export async function fetchAircraftImages(plane: Aircraft): Promise<string[]> {
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
    imageListCache.set(cacheKey, combined);
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
