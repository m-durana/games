import { loadAirlineStats, loadBest, loadBestStreak, loadHistory } from './engine';
import type { Difficulty, Mode } from './types';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-flight', name: 'First flight', desc: 'Play your first round.', icon: '✈️' },
  { id: 'frequent-flyer', name: 'Frequent flyer', desc: 'Play 10 rounds.', icon: '🛫' },
  { id: 'mileage-maven', name: 'Mileage maven', desc: 'Play 50 rounds.', icon: '🌐' },
  { id: 'mile-high', name: 'Mile-high score', desc: 'Score 10/10 in any round.', icon: '🎯' },
  { id: 'captain', name: 'Captain', desc: 'Score 10/10 on Hard.', icon: '🧑‍✈️' },
  { id: 'on-fire', name: 'On fire', desc: 'Get a 5-question streak.', icon: '🔥' },
  { id: 'unstoppable', name: 'Unstoppable', desc: 'Get a 10-question streak.', icon: '⚡' },
  { id: 'renaissance', name: 'Renaissance', desc: 'Play all 6 standard modes.', icon: '🎓' },
  { id: 'caffeinated', name: 'Caffeinated', desc: 'Score 30+ in a Speed Round.', icon: '☕' },
  { id: 'globetrotter', name: 'Globetrotter', desc: 'See 50 unique airlines.', icon: '🗺️' },
];

const KEY = 'achievements';
const ALL_MODES_KEY = 'modes-played';
const SPEED_BEST_KEY = 'speed-best';

export function loadUnlocked(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveUnlocked(map: Record<string, number>) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function recordModePlayed(mode: Mode) {
  try {
    const raw = localStorage.getItem(ALL_MODES_KEY);
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    set.add(mode);
    localStorage.setItem(ALL_MODES_KEY, JSON.stringify([...set]));
  } catch {
    /* noop */
  }
}

function loadModesPlayed(): Set<string> {
  try {
    const raw = localStorage.getItem(ALL_MODES_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function loadSpeedBest(): number {
  return Number(localStorage.getItem(SPEED_BEST_KEY) ?? 0);
}

export function saveSpeedBest(score: number): boolean {
  const prev = loadSpeedBest();
  if (score > prev) {
    localStorage.setItem(SPEED_BEST_KEY, String(score));
    return true;
  }
  return false;
}

export function evaluateAchievements(): Achievement[] {
  const history = loadHistory();
  const stats = loadAirlineStats();
  const modes = loadModesPlayed();
  const speedBest = loadSpeedBest();
  const unlocked = loadUnlocked();

  // Note: 'renaissance' still gates on the original 6 standard modes so existing
  // unlocks don't regress. New modes (tail, airportAirline, airlineDest, airportConn)
  // are tracked elsewhere for streaks/best stats but don't affect this achievement.
  const allMissions: Mode[] = ['group', 'alliance', 'hub', 'logo', 'country', 'reverseGroup'];
  const trackedModes: Mode[] = ['group', 'alliance', 'hub', 'logo', 'country', 'reverseGroup', 'tail', 'airportAirline', 'airlineDest', 'airportConn'];
  const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];
  const maxScoreAny = history.reduce((m, h) => Math.max(m, h.score), 0);
  const maxScoreHard = history.filter((h) => h.difficulty === 'hard').reduce((m, h) => Math.max(m, h.score), 0);
  const bestStreak = Math.max(
    ...trackedModes.map((m) => loadBestStreak(m)),
    loadBestStreak('daily'),
    0,
  );
  const seenAirlines = Object.keys(stats).length;
  const _ = difficulties.map((d) => trackedModes.map((m) => loadBest(m, d))); // touch loadBest
  void _;

  const tests: Record<string, () => boolean> = {
    'first-flight': () => history.length >= 1,
    'frequent-flyer': () => history.length >= 10,
    'mileage-maven': () => history.length >= 50,
    'mile-high': () => maxScoreAny >= 10,
    'captain': () => maxScoreHard >= 10,
    'on-fire': () => bestStreak >= 5,
    'unstoppable': () => bestStreak >= 10,
    'renaissance': () => allMissions.every((m) => modes.has(m)),
    'caffeinated': () => speedBest >= 30,
    'globetrotter': () => seenAirlines >= 50,
  };

  const newlyUnlocked: Achievement[] = [];
  const now = Date.now();
  for (const a of ACHIEVEMENTS) {
    if (unlocked[a.id]) continue;
    if (tests[a.id]?.()) {
      unlocked[a.id] = now;
      newlyUnlocked.push(a);
    }
  }
  if (newlyUnlocked.length > 0) saveUnlocked(unlocked);
  return newlyUnlocked;
}
