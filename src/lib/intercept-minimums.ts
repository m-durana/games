// Intercept Phase 2 — "At Minimums".
//
// At the DA call the pilot sees the PFD plus a small "outside view" strip and
// picks Continue/Landing, Go-around, or "100 ft only" (FAR 91.175(c) approach-
// lights-only continuation).

import type { Difficulty } from './types';
import {
  baselineAtThousand,
  decisionHeightFor,
  pickCat,
  pickContext,
  type ApproachContext,
  type ApproachScenario,
  type Rng,
} from './approach-scenario';

export const INTERCEPT_MINIMUMS_ROUND_LENGTH = 10;

/** Visual-reference categories per FAR 91.175(c). Ordered roughly by usefulness. */
export type VisualReference =
  | 'none'
  | 'approachLights'
  | 'approachLightsRedBars'
  | 'tdz'
  | 'runwayLights'
  | 'threshold';

export type OutsideAmbiguity = 'clear' | 'maybe';

export interface InterceptMinimumsQuestion {
  mode: 'interceptMinimums';
  scenario: ApproachScenario;
  reference: VisualReference;
  /** Hard-mode flag: the visual is uncertain. Per the rule, uncertainty = miss → GA. */
  ambiguity: OutsideAmbiguity;
  options: ['Continue / Landing', '100 ft only', 'Go around'];
  correctAnswer: 'continue' | 'hundred' | 'goAround';
  prompt: string;
  answer: string;
  explanation: string;
}

export interface InterceptMinimumsResult {
  question: InterceptMinimumsQuestion;
  picked: string;
  correct: boolean;
}

function defaultRng(): Rng { return Math.random; }

const REFERENCE_LABEL: Record<VisualReference, string> = {
  none: 'Nothing visible (RVR below mins)',
  approachLights: 'Approach lights only',
  approachLightsRedBars: 'Approach lights + red side row bars',
  tdz: 'Touchdown zone markings',
  runwayLights: 'Runway lights',
  threshold: 'Threshold visible',
};

function buildQuestion(ctx: ApproachContext, difficulty: Difficulty, rng: Rng): InterceptMinimumsQuestion {
  const cat = pickCat(difficulty, rng);
  const dh = decisionHeightFor(cat);
  const { scenario: base } = baselineAtThousand(ctx, rng);
  // Place the aircraft at DA exactly.
  const elev = base.runway.elevationFt;
  const aircraft = {
    ...base.aircraft,
    alt: elev + dh,
    agl: dh,
    fpm: -650 - Math.floor(rng() * 80),
  };

  const scenario: ApproachScenario = { ...base, aircraft, cat, decisionHeightFt: dh };

  let reference: VisualReference;
  let ambiguity: OutsideAmbiguity = 'clear';
  let correct: 'continue' | 'hundred' | 'goAround';

  if (difficulty === 'easy') {
    // Binary: TDZ visible (continue) or none (GA). 50/50.
    if (rng() < 0.5) { reference = 'tdz'; correct = 'continue'; }
    else { reference = 'none'; correct = 'goAround'; }
  } else if (difficulty === 'medium') {
    // Add the "approach lights only" case: continuable to 100 ft AGL but not lower without red bars.
    const r = rng();
    if (r < 0.33) { reference = 'tdz'; correct = 'continue'; }
    else if (r < 0.66) { reference = 'approachLights'; correct = 'hundred'; }
    else { reference = 'none'; correct = 'goAround'; }
  } else {
    // Hard: include ambiguity. "Maybe see runway lights through fog" → GA (uncertainty = miss).
    const r = rng();
    if (r < 0.2) { reference = 'tdz'; correct = 'continue'; }
    else if (r < 0.4) { reference = 'approachLightsRedBars'; correct = 'continue'; }
    else if (r < 0.6) { reference = 'approachLights'; correct = 'hundred'; }
    else if (r < 0.8) { reference = 'runwayLights'; ambiguity = 'maybe'; correct = 'goAround'; }
    else { reference = 'none'; correct = 'goAround'; }
  }

  let explanation = '';
  switch (correct) {
    case 'continue':
      explanation = `${REFERENCE_LABEL[reference]} — meets FAR 91.175(c) for descent below DA. Continue.`;
      break;
    case 'hundred':
      explanation = 'Approach lights only let you continue to 100 ft AGL. Below that needs the red side row bars or threshold.';
      break;
    case 'goAround':
      explanation = ambiguity === 'maybe'
        ? 'Uncertainty about the visual reference = miss it. The DA call is binary; if you can\'t identify the required reference, go around.'
        : `${REFERENCE_LABEL[reference]} — no required visual reference. Go around.`;
      break;
  }

  return {
    mode: 'interceptMinimums',
    scenario,
    reference,
    ambiguity,
    options: ['Continue / Landing', '100 ft only', 'Go around'],
    correctAnswer: correct,
    prompt: `${scenario.airport.icao} ${scenario.approachName} — CAT ${cat} · DH ${dh} ft`,
    answer: correct === 'continue' ? 'Continue / Landing' : correct === 'hundred' ? '100 ft only' : 'Go around',
    explanation,
  };
}

export function buildInterceptMinimumsRound(difficulty: Difficulty, rng: Rng = defaultRng()): InterceptMinimumsQuestion[] {
  const out: InterceptMinimumsQuestion[] = [];
  let safety = 0;
  while (out.length < INTERCEPT_MINIMUMS_ROUND_LENGTH && safety < 200) {
    safety++;
    try {
      const ctx = pickContext(rng);
      out.push(buildQuestion(ctx, difficulty, rng));
    } catch {
      continue;
    }
  }
  return out;
}

export { REFERENCE_LABEL };
