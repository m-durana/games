import militaryData from '../data/military-aircraft.json';
import curatedPhotos from '../data/military-photos.json';
import { EU_COUNTRIES, loadPool } from './engine';

export type MilitaryRole =
  | 'Fighter' | 'Bomber' | 'Attack' | 'Trainer' | 'Transport' | 'Tanker'
  | 'ISR' | 'Helicopter' | 'UAV';
export type Wings = 'Fixed' | 'Swing' | 'Delta' | 'Rotary' | 'Tilt';
export type Speed = 'Subsonic' | 'Supersonic' | 'Hypersonic';

export interface MilitaryIdentification {
  manufacturer: string;
  family: string;
  variant: string;
}

export interface MilitaryAircraft {
  id: string;
  name: string;
  manufacturer: string;
  origin: string;
  role: MilitaryRole;
  introduction: number;
  engines: number;
  wings: Wings;
  speed: Speed;
  wikipedia: string;
  commonsCategory?: string;
  identification: MilitaryIdentification;
  keyTell: string;
}

export type MilitaryDifficulty = 'easy' | 'medium' | 'hard';

export const military = militaryData as MilitaryAircraft[];

// Curated by visual distinctness.
const EASY_IDS = new Set([
  'f16', 'f22', 'f35', 'fa18', 'a10', 'b52', 'b2', 'c130', 'c17',
  'ah64', 'uh60', 'mq9', 'su27', 'mig29', 'typhoon', 'rafale',
  'gripen', 'f14',
  'a400m', 'v22', 'ch47', 'f117', 'e3', 'mi24', 'av8b',
]);
// Variant-confusable / older / less iconic.
const HARD_IDS = new Set([
  'f15c', 'f15e', 'mig21', 'mig23', 'su30', 'su35', 'tornado',
  'mirage2000', 'f4', 'f5', 'j20', 'tu95',
  'b1b', 'kc135', 'su57', 'tu160', 't38',
]);

function applyPool(list: MilitaryAircraft[]): MilitaryAircraft[] {
  const p = loadPool();
  if (p === 'us') return list.filter((a) => a.origin === 'United States');
  if (p === 'us_eu') {
    return list.filter((a) => a.origin === 'United States' || EU_COUNTRIES.has(a.origin));
  }
  return list;
}

export function pooledMilitary(): MilitaryAircraft[] {
  return applyPool(military);
}

export function militaryForDifficulty(difficulty: MilitaryDifficulty): MilitaryAircraft[] {
  if (difficulty === 'easy') return applyPool(military.filter((a) => EASY_IDS.has(a.id)));
  if (difficulty === 'hard') return applyPool(military.filter((a) => HARD_IDS.has(a.id)));
  return applyPool(military);
}

export function militaryById(id: string): MilitaryAircraft | null {
  return military.find((a) => a.id === id) ?? null;
}

// --- Comparison ---------------------------------------------------------

export type AttrMatch = 'hit' | 'close' | 'miss';

// Tighter regional buckets: same region → "close" on Origin.
// US is its own bucket (NATO membership doesn't make it "close" to a UK or
// French jet — different design lineage and procurement). Western European
// designs cluster together. Russia and China are each their own bucket.
const ORIGIN_BLOC: Record<string, string> = {
  'United States': 'North America',
  'Canada': 'North America',
  'United Kingdom': 'Europe',
  'France': 'Europe',
  'Germany': 'Europe',
  'Italy': 'Europe',
  'Spain': 'Europe',
  'Sweden': 'Europe',
  'Russia': 'Russia',
  'Belarus': 'Russia',
  'China': 'China',
  'Japan': 'East Asia',
  'South Korea': 'East Asia',
  'Israel': 'Middle East',
};
function originBloc(c: string): string | undefined { return ORIGIN_BLOC[c]; }

const SPEED_ORDER: Speed[] = ['Subsonic', 'Supersonic', 'Hypersonic'];
function speedDiff(a: Speed, b: Speed): number {
  return SPEED_ORDER.indexOf(a) - SPEED_ORDER.indexOf(b);
}

function decade(year: number): number { return Math.floor(year / 10) * 10; }

export interface AttributeFeedback {
  key: 'manufacturer' | 'origin' | 'role' | 'era' | 'engines' | 'wings' | 'speed';
  label: string;
  guessValue: string;
  match: AttrMatch;
  hint?: 'higher' | 'lower';
}

export function compareAttributes(guess: MilitaryAircraft, answer: MilitaryAircraft): AttributeFeedback[] {
  const out: AttributeFeedback[] = [];

  out.push({
    key: 'manufacturer',
    label: 'Maker',
    guessValue: guess.manufacturer,
    match: guess.manufacturer === answer.manufacturer ? 'hit' : 'miss',
  });

  let originMatch: AttrMatch = 'miss';
  if (guess.origin === answer.origin) originMatch = 'hit';
  else if (
    originBloc(guess.origin) && originBloc(guess.origin) === originBloc(answer.origin)
  ) originMatch = 'close';
  out.push({
    key: 'origin',
    label: 'Origin',
    guessValue: guess.origin,
    match: originMatch,
  });

  out.push({
    key: 'role',
    label: 'Role',
    guessValue: guess.role,
    match: guess.role === answer.role ? 'hit' : 'miss',
  });

  const guessDecade = decade(guess.introduction);
  const answerDecade = decade(answer.introduction);
  const decadeGap = Math.round((guessDecade - answerDecade) / 10);
  out.push({
    key: 'era',
    label: 'Era',
    guessValue: `${guessDecade}s`,
    match: decadeGap === 0 ? 'hit' : Math.abs(decadeGap) === 1 ? 'close' : 'miss',
    hint: decadeGap === 0 ? undefined : decadeGap > 0 ? 'lower' : 'higher',
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
    key: 'wings',
    label: 'Wings',
    guessValue: guess.wings,
    match: guess.wings === answer.wings ? 'hit' : 'miss',
  });

  const sd = speedDiff(guess.speed, answer.speed);
  out.push({
    key: 'speed',
    label: 'Speed',
    guessValue: guess.speed,
    match: sd === 0 ? 'hit' : Math.abs(sd) === 1 ? 'close' : 'miss',
    hint: sd === 0 ? undefined : sd > 0 ? 'lower' : 'higher',
  });

  return out;
}

// Surfaced from the wordle UI when the player taps a column header.
export interface AttributeInfo {
  label: string;
  description: string;
  values: string[];
}

function uniqueSorted<T extends string | number>(values: T[]): T[] {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b))) as T[];
}

const decades = uniqueSorted(military.map((a) => `${Math.floor(a.introduction / 10) * 10}s`));
const engineCounts = uniqueSorted(military.map((a) => a.engines)).map(String);

// Lists are derived from the actual roster so the help panel only shows
// values that can plausibly appear as an answer.
export const ATTRIBUTE_INFO: AttributeInfo[] = [
  {
    label: 'Maker',
    description: 'The aircraft\'s primary manufacturer.',
    values: uniqueSorted(military.map((a) => a.manufacturer)),
  },
  {
    label: 'Origin',
    description: 'Country of design. Same region (North America, Europe, Russia, China, East Asia) counts as a "close" match — Europe and the US are NOT considered close.',
    values: uniqueSorted(military.map((a) => a.origin)),
  },
  {
    label: 'Role',
    description: 'Primary mission category.',
    values: uniqueSorted(military.map((a) => a.role)),
  },
  {
    label: 'Era',
    description: 'Decade of service entry. ▲ / ▼ on a "close" hint mean the answer is one decade off.',
    values: decades,
  },
  {
    label: 'Engines',
    description: 'Number of engines.',
    values: engineCounts,
  },
  {
    label: 'Wings',
    description: 'Wing configuration.',
    values: uniqueSorted(military.map((a) => a.wings)),
  },
  {
    label: 'Speed',
    description: 'Top speed regime. ▲ / ▼ on close means one regime off.',
    values: uniqueSorted(military.map((a) => a.speed)),
  },
];

// --- Image fetcher ------------------------------------------------------

const imageListCache = new Map<string, string[]>();
const inFlight = new Map<string, Promise<string[]>>();

interface CommonsImageInfo { url?: string; thumburl?: string }
interface CommonsPage { title?: string; imageinfo?: CommonsImageInfo[] }

const SKIP_KEYWORDS = ['cockpit', 'engine', 'patch', 'logo', 'pilot', 'crew', 'maintenance', '.svg', '.pdf'];
function looksUseful(title: string): boolean {
  const t = title.toLowerCase();
  return !SKIP_KEYWORDS.some((k) => t.includes(k));
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
      out.push(raw.startsWith('//') ? `https:${raw}` : raw);
    }
    return out;
  } catch { return []; }
}

const CURATED = curatedPhotos as Record<string, string[]>;

export async function fetchMilitaryImages(plane: MilitaryAircraft): Promise<string[]> {
  // Prefer the hand-curated approved photos when we have them. Falls back to
  // live Wikimedia/Wikipedia lookup if the aircraft hasn't been reviewed yet.
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
    const seen = new Set<string>();
    const combined: string[] = [];
    for (const src of [...fromCategory, ...fromArticle]) {
      if (!seen.has(src)) { seen.add(src); combined.push(src); }
    }
    imageListCache.set(cacheKey, combined);
    inFlight.delete(cacheKey);
    return combined;
  })();
  inFlight.set(cacheKey, promise);
  return promise;
}

// --- Round picking ------------------------------------------------------

export const MILITARY_ROUND_LENGTH = 5;
export const MILITARY_WORDLE_MAX_GUESSES = 6;
export const MILITARY_WORDLE_HARD_MAX_GUESSES = 5;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickRoundMilitary(count: number, difficulty: MilitaryDifficulty = 'medium'): MilitaryAircraft[] {
  const pool = militaryForDifficulty(difficulty);
  return shuffle(pool).slice(0, count);
}
