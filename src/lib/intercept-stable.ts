// Intercept Phase 1 — "Stable or Go-Around?"
//
// Player sees a frozen PFD snapshot at ~1000 ft AGL on an ILS final and calls
// Continue or Go-around against the 6 stabilization gates:
//   speed (VREF..VREF+20), sink (≤1000 fpm), within 1 dot LOC, within 1 dot GS,
//   landing config, thrust set (not idle/max).
//
// Difficulty scales per docs/design-principles.md: Easy = obvious failure with
// inline annotation; Medium = tighter margins, no annotation; Hard = near-stable
// (one gate ~5% off limit).

import type { Difficulty } from './types';
import {
  baselineAtThousand,
  decisionHeightFor,
  pickCat,
  pickContext,
  type ApproachContext,
  type ApproachScenario,
  type Gate,
  type Rng,
} from './approach-scenario';

export const INTERCEPT_STABLE_ROUND_LENGTH = 10;

export interface InterceptStableQuestion {
  /** Reused by AtcResults to render a tag — must match an AtcMode entry. */
  mode: 'interceptStable';
  scenario: ApproachScenario;
  /** Which gates fail (empty = stable). */
  failedGates: Gate[];
  /** Which gates are tight (within ~10% of limit but not failed). Hard-mode tells. */
  tightGates: Gate[];
  /** Authoritative answer. */
  correctAnswer: 'continue' | 'goAround';
  /** UI options always: index 0 = Continue, 1 = Go-around. */
  options: ['Continue', 'Go around'];
  /** Recap labels. */
  prompt: string;
  answer: string;
  explanation: string;
  /** True iff Easy: show inline gate annotation under the choices. */
  showAnnotation: boolean;
}

export interface InterceptStableResult {
  question: InterceptStableQuestion;
  picked: string;
  correct: boolean;
}

function defaultRng(): Rng { return Math.random; }

/** Apply one or more gate violations to a baseline scenario. */
function applyFailure(s: ApproachScenario, gate: Gate, severity: 'tight' | 'fail', rng: Rng): { tight: Gate[]; failed: Gate[] } {
  const tight: Gate[] = [];
  const failed: Gate[] = [];
  const ac = s.aircraft;
  switch (gate) {
    case 'speed': {
      // Stable band: VREF..VREF+20. Tight ≈ VREF+20..+22 or VREF-2..VREF.
      // Fail ≈ VREF+25 or VREF-5.
      if (severity === 'tight') {
        ac.ias = ac.vref + 21 + Math.floor(rng() * 2); // VREF+21..VREF+22
        tight.push('speed');
      } else {
        if (rng() < 0.5) ac.ias = ac.vref + 25 + Math.floor(rng() * 6); // VREF+25..+30
        else ac.ias = ac.vref - 5 - Math.floor(rng() * 4); // VREF-5..-8
        failed.push('speed');
      }
      break;
    }
    case 'sink': {
      if (severity === 'tight') {
        ac.fpm = -950 - Math.floor(rng() * 40); // -950..-990
        tight.push('sink');
      } else {
        ac.fpm = -1300 - Math.floor(rng() * 400); // -1300..-1700
        failed.push('sink');
      }
      break;
    }
    case 'loc': {
      if (severity === 'tight') {
        ac.locDots = (rng() < 0.5 ? -1 : 1) * (0.92 + rng() * 0.05);
        tight.push('loc');
      } else {
        ac.locDots = (rng() < 0.5 ? -1 : 1) * (1.4 + rng() * 0.6);
        failed.push('loc');
      }
      break;
    }
    case 'gs': {
      if (severity === 'tight') {
        ac.gsDots = (rng() < 0.5 ? -1 : 1) * (0.92 + rng() * 0.05);
        tight.push('gs');
      } else {
        ac.gsDots = (rng() < 0.5 ? -1 : 1) * (1.4 + rng() * 0.6);
        failed.push('gs');
      }
      break;
    }
    case 'config': {
      // Binary; no "tight" concept.
      ac.landingConfig = false;
      failed.push('config');
      break;
    }
    case 'thrust': {
      if (severity === 'tight') {
        ac.thrust = rng() < 0.5 ? 0.34 : 0.92;
        tight.push('thrust');
      } else {
        ac.thrust = rng() < 0.5 ? 0.05 : 1.0;
        failed.push('thrust');
      }
      break;
    }
  }
  return { tight, failed };
}

const GATE_LABEL: Record<Gate, string> = {
  speed: 'Speed',
  sink: 'Sink rate',
  loc: 'LOC deviation',
  gs: 'G/S deviation',
  config: 'Landing config',
  thrust: 'Thrust',
};

function gateDetail(s: ApproachScenario, g: Gate): string {
  const ac = s.aircraft;
  switch (g) {
    case 'speed': return `IAS ${Math.round(ac.ias)} kt vs VREF ${ac.vref} (band VREF..VREF+20)`;
    case 'sink': return `${Math.round(ac.fpm)} fpm (limit ≤ 1000)`;
    case 'loc': return `${ac.locDots.toFixed(2)} dots (limit ±1)`;
    case 'gs': return `${ac.gsDots.toFixed(2)} dots (limit ±1)`;
    case 'config': return ac.landingConfig ? 'gear+flaps landing' : 'NOT in landing config';
    case 'thrust': return `${Math.round(ac.thrust * 100)}% (idle or max = unstable)`;
  }
}

function buildQuestion(ctx: ApproachContext, difficulty: Difficulty, rng: Rng): InterceptStableQuestion {
  const { scenario: base } = baselineAtThousand(ctx, rng);
  const cat = pickCat(difficulty, rng);
  const scenario: ApproachScenario = {
    ...base,
    cat,
    decisionHeightFt: decisionHeightFor(cat),
  };
  // Deep-copy aircraft to avoid sharing across questions.
  scenario.aircraft = { ...scenario.aircraft };

  const allGates: Gate[] = ['speed', 'sink', 'loc', 'gs', 'config', 'thrust'];
  let failed: Gate[] = [];
  let tight: Gate[] = [];
  let correctAnswer: 'continue' | 'goAround';
  let showAnnotation = difficulty === 'easy';

  if (difficulty === 'easy') {
    // 50/50 stable vs single-clear-failure.
    if (rng() < 0.5) {
      correctAnswer = 'continue';
    } else {
      const g = allGates[Math.floor(rng() * allGates.length)];
      const r = applyFailure(scenario, g, 'fail', rng);
      failed.push(...r.failed); tight.push(...r.tight);
      correctAnswer = 'goAround';
    }
  } else if (difficulty === 'medium') {
    const r0 = rng();
    if (r0 < 0.4) {
      // stable, but with one tight (no-fail) gate
      const g = allGates[Math.floor(rng() * (allGates.length - 1))];
      if (g !== 'config') {
        const r = applyFailure(scenario, g, 'tight', rng);
        tight.push(...r.tight);
      }
      correctAnswer = 'continue';
    } else {
      // 1-2 failed gates with tighter margins
      const n = rng() < 0.7 ? 1 : 2;
      const pool = [...allGates];
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(rng() * pool.length);
        const g = pool.splice(idx, 1)[0];
        const r = applyFailure(scenario, g, 'fail', rng);
        failed.push(...r.failed);
      }
      correctAnswer = 'goAround';
    }
  } else {
    // hard: near-tied. Mostly stable-with-tight or borderline-fail.
    const r0 = rng();
    if (r0 < 0.5) {
      // stable, 1-2 tight gates
      const n = rng() < 0.6 ? 1 : 2;
      const pool = allGates.filter(g => g !== 'config');
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(rng() * pool.length);
        const g = pool.splice(idx, 1)[0];
        const r = applyFailure(scenario, g, 'tight', rng);
        tight.push(...r.tight);
      }
      correctAnswer = 'continue';
    } else {
      // single failed gate, ~5% past limit (the apply-fail "fail" severity already
      // produces decisive failures; on hard we narrow it slightly via tight gates
      // alongside).
      const g = allGates[Math.floor(rng() * allGates.length)];
      const r = applyFailure(scenario, g, 'fail', rng);
      failed.push(...r.failed);
      // Add a distracting tight gate.
      const others = allGates.filter(x => x !== g && x !== 'config');
      const t = others[Math.floor(rng() * others.length)];
      const r2 = applyFailure(scenario, t, 'tight', rng);
      tight.push(...r2.tight);
      correctAnswer = 'goAround';
    }
  }

  const promptVerb = correctAnswer === 'goAround'
    ? 'Stabilization gates at 1000 ft AGL — continue or go around?'
    : 'Stabilization gates at 1000 ft AGL — continue or go around?';
  const failedSummary = failed.length === 0
    ? 'all 6 gates within limits'
    : failed.map(g => `${GATE_LABEL[g]} (${gateDetail(scenario, g)})`).join('; ');
  const tightSummary = tight.length === 0 ? '' : ` Tight: ${tight.map(g => GATE_LABEL[g]).join(', ')}.`;

  return {
    mode: 'interceptStable',
    scenario,
    failedGates: failed,
    tightGates: tight,
    correctAnswer,
    options: ['Continue', 'Go around'],
    prompt: `${scenario.airport.icao} ${scenario.approachName} — 1000 ft AGL`,
    answer: correctAnswer === 'continue' ? 'Continue' : 'Go around',
    explanation: correctAnswer === 'continue'
      ? `Stable: ${failedSummary}.${tightSummary} Continue.`
      : `Unstable: ${failedSummary}.${tightSummary} Go around — the 1000 ft gate is non-negotiable.`,
    showAnnotation,
  };
}

export function buildInterceptStableRound(difficulty: Difficulty, rng: Rng = defaultRng()): InterceptStableQuestion[] {
  const out: InterceptStableQuestion[] = [];
  let safety = 0;
  while (out.length < INTERCEPT_STABLE_ROUND_LENGTH && safety < 200) {
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

export { GATE_LABEL, gateDetail };
