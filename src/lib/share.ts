import type { Difficulty, Mode, RoundResult } from './types';

interface PackedQuestion {
  i: string;
  md: Mode;
  a: string;
  p: string;
}

export interface SharedRound {
  v: 1;
  m: Mode;
  d: Difficulty;
  daily: boolean;
  date: string;
  qs: PackedQuestion[];
}

function toB64Url(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromB64Url(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(b64)));
}

export function encodeRound(opts: {
  mode: Mode;
  difficulty: Difficulty;
  daily: boolean;
  date: string;
  results: RoundResult[];
}): string {
  const payload: SharedRound = {
    v: 1,
    m: opts.mode,
    d: opts.difficulty,
    daily: opts.daily,
    date: opts.date,
    qs: opts.results.map((r) => ({
      i: r.question.airline.iata,
      md: r.question.mode,
      a: r.question.answer,
      p: r.picked,
    })),
  };
  return toB64Url(JSON.stringify(payload));
}

export function decodeRound(blob: string): SharedRound | null {
  try {
    const obj = JSON.parse(fromB64Url(blob));
    if (obj && obj.v === 1 && Array.isArray(obj.qs)) return obj as SharedRound;
    return null;
  } catch {
    return null;
  }
}

export function readSharedFromUrl(): SharedRound | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const r = params.get('r');
  if (!r) return null;
  return decodeRound(r);
}

export function buildShareUrl(blob: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?r=${blob}`;
}
