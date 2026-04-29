// Radar Intercepts: judgment-question mode powered by `radarscope`. Templates
// live in `intercept-questions.ts`; shared scenario plumbing is in
// `intercept-scenario.ts`; types are in `intercepts-types.ts` (no cycles).

import { allApproaches, findAirportByIcao, type RealRunwayEnd } from 'radarscope/data';
import type { Difficulty } from './types';
import type { ApproachContext } from './intercept-scenario';
import { INTERCEPT_TEMPLATES } from './intercept-questions';
import type { InterceptQuestion } from './intercepts-types';

export const INTERCEPT_ROUND_LENGTH = 10;

export type {
  InterceptScenario,
  InterceptState,
  InterceptQuestion,
  InterceptRoundResult,
  InterceptTemplate,
} from './intercepts-types';

type Rng = () => number;

function defaultRng(): Rng {
  return Math.random;
}

function pick<T>(arr: T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)];
}

let cachedContexts: ApproachContext[] | null = null;

function approachContexts(): ApproachContext[] {
  if (cachedContexts) return cachedContexts;
  const out: ApproachContext[] = [];
  for (const ap of allApproaches()) {
    const airport = findAirportByIcao(ap.airport);
    if (!airport) continue;
    let end: RealRunwayEnd | null = null;
    let parent = airport.runways[0];
    let reciprocal: string | undefined;
    for (const rw of airport.runways) {
      if (rw.le.ident === ap.runway) { end = rw.le; parent = rw; reciprocal = rw.he.ident; break; }
      if (rw.he.ident === ap.runway) { end = rw.he; parent = rw; reciprocal = rw.le.ident; break; }
    }
    if (!end) continue;
    out.push({ approach: ap, airport, runway: parent, runwayEnd: end, reciprocalDesignator: reciprocal });
  }
  cachedContexts = out;
  return out;
}

export function buildInterceptRound(difficulty: Difficulty, rng: Rng = defaultRng()): InterceptQuestion[] {
  const eligible = INTERCEPT_TEMPLATES.filter((t) => t.difficulty.includes(difficulty));
  if (eligible.length === 0) {
    throw new Error(`No intercept templates for difficulty=${difficulty}`);
  }
  const ctxs = approachContexts();
  if (ctxs.length === 0) {
    throw new Error('No approach contexts available - intercepts mode needs radarscope/data approaches.');
  }

  const out: InterceptQuestion[] = [];
  const usedTemplates = new Set<string>();
  let safety = 0;
  while (out.length < INTERCEPT_ROUND_LENGTH && safety < 200) {
    safety++;
    const fresh = eligible.filter((t) => !usedTemplates.has(t.id));
    const template = fresh.length > 0 ? pick(fresh, rng) : pick(eligible, rng);
    const ctx = pick(ctxs, rng);
    try {
      out.push(template.build(ctx, rng));
      usedTemplates.add(template.id);
    } catch {
      // Skip a template that errors on this approach context (e.g. needs reciprocal).
      continue;
    }
  }
  return out;
}
