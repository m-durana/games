// Intercept Phase 3 — "FMA Watch" (CAT IIIb autoland).
//
// Player monitors the FMA strip during a scripted ~10–15 s autoland window.
// If the FMA degrades past an alert-height-relative limit, the correct call
// is GO AROUND. The question carries a timeline of FMA snapshots and the
// player commits Continue or Go-around at the first beat they think the
// answer is settled.

import type { Difficulty } from './types';
import {
  baselineAtThousand,
  decisionHeightFor,
  pickContext,
  type ApproachContext,
  type ApproachScenario,
  type FmaState,
  type Rng,
} from './approach-scenario';

export const INTERCEPT_FMA_ROUND_LENGTH = 10;

export interface FmaTimelineBeat {
  /** Seconds since timeline start. */
  tSec: number;
  /** AGL at this beat. */
  agl: number;
  fma: FmaState;
}

export interface InterceptFmaQuestion {
  mode: 'interceptFma';
  scenario: ApproachScenario;
  /** Strict-monotonic timeline (ascending tSec). */
  timeline: FmaTimelineBeat[];
  /** Total window the player has to act, seconds. */
  windowSec: number;
  /** Authoritative call. */
  correctAnswer: 'continue' | 'goAround';
  options: ['Continue', 'Go around'];
  prompt: string;
  answer: string;
  explanation: string;
}

export interface InterceptFmaResult {
  question: InterceptFmaQuestion;
  picked: string;
  correct: boolean;
  /** Seconds elapsed at the moment of pick (for recap). */
  pickedAtSec: number;
}

function defaultRng(): Rng { return Math.random; }

const ALERT_HEIGHT_FT = 200;

function buildQuestion(ctx: ApproachContext, difficulty: Difficulty, rng: Rng): InterceptFmaQuestion {
  const cat = 'IIIb' as const;
  const dh = decisionHeightFor(cat);
  const { scenario: base } = baselineAtThousand(ctx, rng);
  const scenario: ApproachScenario = { ...base, cat, decisionHeightFt: dh };
  // Stage at 400 ft AGL.
  const elev = scenario.runway.elevationFt;
  scenario.aircraft = { ...scenario.aircraft, alt: elev + 400, agl: 400, fpm: -650 };
  scenario.fma = { at: 'RETARD', lat: 'ROLLOUT', vert: 'FLARE', app: 'LAND 3' };

  // Build a timeline:
  //   t=0  agl 400, LAND 3
  //   t=4  agl 250, possibly degrades to LAND 2
  //   t=7  agl 150, may degrade to NO AUTOLAND
  //   t=10 agl 50, FLARE
  //   t=13 agl 5,  ROLLOUT
  const beats: FmaTimelineBeat[] = [];
  const baseFma: FmaState = { at: 'RETARD', lat: 'ROLLOUT', vert: 'FLARE', app: 'LAND 3' };
  beats.push({ tSec: 0, agl: 400, fma: { ...baseFma } });

  let scenarioPath: 'clean' | 'soft-degrade' | 'hard-degrade' | 'rapid-double';
  if (difficulty === 'easy') {
    scenarioPath = rng() < 0.5 ? 'clean' : 'hard-degrade';
  } else if (difficulty === 'medium') {
    const r = rng();
    scenarioPath = r < 0.4 ? 'clean' : r < 0.75 ? 'soft-degrade' : 'hard-degrade';
  } else {
    const r = rng();
    scenarioPath = r < 0.3 ? 'clean' : r < 0.55 ? 'soft-degrade' : r < 0.85 ? 'hard-degrade' : 'rapid-double';
  }

  let correct: 'continue' | 'goAround' = 'continue';
  let explanation = '';
  switch (scenarioPath) {
    case 'clean':
      beats.push({ tSec: 4, agl: 250, fma: { ...baseFma } });
      beats.push({ tSec: 7, agl: 150, fma: { ...baseFma } });
      beats.push({ tSec: 10, agl: 50, fma: { ...baseFma, vert: 'FLARE' } });
      beats.push({ tSec: 13, agl: 5, fma: { ...baseFma, lat: 'ROLLOUT' } });
      correct = 'continue';
      explanation = 'LAND 3 held all the way through FLARE/ROLLOUT. Autoland.';
      break;
    case 'soft-degrade':
      beats.push({ tSec: 4, agl: 250, fma: { ...baseFma, app: 'LAND 2' } });
      beats.push({ tSec: 7, agl: 150, fma: { ...baseFma, app: 'LAND 2' } });
      beats.push({ tSec: 10, agl: 50, fma: { ...baseFma, app: 'LAND 2', vert: 'FLARE' } });
      beats.push({ tSec: 13, agl: 5, fma: { ...baseFma, app: 'LAND 2', lat: 'ROLLOUT' } });
      correct = 'continue';
      explanation = 'LAND 3 → LAND 2 above alert height (200 ft) is a permitted degrade. Continue.';
      break;
    case 'hard-degrade':
      beats.push({ tSec: 4, agl: 250, fma: { ...baseFma, app: 'LAND 2' } });
      beats.push({ tSec: 7, agl: 150, fma: { ...baseFma, app: 'NO AUTOLAND' } });
      correct = 'goAround';
      explanation = 'NO AUTOLAND below alert height (200 ft) is a mandatory go-around.';
      break;
    case 'rapid-double':
      beats.push({ tSec: 3, agl: 280, fma: { ...baseFma, app: 'LAND 2' } });
      beats.push({ tSec: 5, agl: 180, fma: { ...baseFma, app: 'NO AUTOLAND' } });
      correct = 'goAround';
      explanation = 'Rapid LAND 3 → LAND 2 → NO AUTOLAND below alert height. Don\'t hesitate; go around.';
      break;
  }

  return {
    mode: 'interceptFma',
    scenario,
    timeline: beats,
    windowSec: 14,
    correctAnswer: correct,
    options: ['Continue', 'Go around'],
    prompt: `${scenario.airport.icao} ${scenario.approachName} — autoland CAT IIIb`,
    answer: correct === 'continue' ? 'Continue' : 'Go around',
    explanation,
  };
}

export function buildInterceptFmaRound(difficulty: Difficulty, rng: Rng = defaultRng()): InterceptFmaQuestion[] {
  const out: InterceptFmaQuestion[] = [];
  let safety = 0;
  while (out.length < INTERCEPT_FMA_ROUND_LENGTH && safety < 200) {
    safety++;
    try {
      const ctx = pickContext(rng);
      out.push(buildQuestion(ctx, difficulty, rng));
    } catch { continue; }
  }
  return out;
}

export { ALERT_HEIGHT_FT };
