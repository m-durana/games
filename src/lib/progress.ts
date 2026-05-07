// Cross-game "in progress" registry. Each game writes its own session blob to
// its own localStorage key; this registry just tracks which sessions exist so
// Home can list them and the App can prompt resume-vs-restart.

const REGISTRY_KEY = 'progress:registry:v1';

export type GameKind =
  | 'standard'
  | 'aircraftIdentify'
  | 'militaryIdentify'
  | 'airportIdentify'
  | 'atc'
  | 'radar'
  | 'cleared'
  | 'intercept'
  | 'sequence';

export interface ProgressEntry {
  key: string;
  gameKind: GameKind;
  label: string;
  category: string;
  mode?: string;
  difficulty?: string;
  currentIndex: number;
  total: number;
  savedAt: number;
  sessionStorageKey: string;
}

function read(): Record<string, ProgressEntry> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function write(map: Record<string, ProgressEntry>): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(map));
}

export function recordProgress(entry: ProgressEntry): void {
  const map = read();
  map[entry.key] = { ...entry, savedAt: Date.now() };
  write(map);
}

export function getProgress(key: string): ProgressEntry | null {
  return read()[key] ?? null;
}

export function listProgress(): ProgressEntry[] {
  return Object.values(read()).sort((a, b) => b.savedAt - a.savedAt);
}

export function clearProgress(key: string): void {
  const map = read();
  const entry = map[key];
  if (entry && typeof localStorage !== 'undefined') {
    localStorage.removeItem(entry.sessionStorageKey);
  }
  delete map[key];
  write(map);
}

export function clearAllProgress(): void {
  const map = read();
  if (typeof localStorage !== 'undefined') {
    for (const e of Object.values(map)) localStorage.removeItem(e.sessionStorageKey);
  }
  write({});
}

// Helpers for building stable keys per game.
export function progressKey(
  kind: GameKind,
  difficulty?: string,
  mode?: string,
): string {
  return `${kind}:${mode ?? ''}:${difficulty ?? ''}`;
}

export function sessionKey(
  kind: GameKind,
  difficulty?: string,
  mode?: string,
): string {
  return `session:${kind}:${mode ?? ''}:${difficulty ?? ''}`;
}
