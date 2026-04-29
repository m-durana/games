// Type-only module — keeps the import graph clean for the intercepts mode.
// `intercepts.ts`, `intercept-scenario.ts`, and `intercept-questions.ts` all
// import from here; nothing imports back the other way.

import type { Scenario } from 'radarscope';
import type { Difficulty } from './types';
import type { ApproachContext } from './intercept-scenario';

export interface InterceptScenario extends Scenario {
  airportName: string;
  airportIata: string;
  airportIcao: string;
  approachName: string;
  state: InterceptState;
}

export interface InterceptState {
  callsign: string;
  rangeNm: number;
  altitudeFt: number;
  speedKt: number;
  windFrom: number;
  windKt: number;
  finalCourseT: number;
  runwayDesignator: string;
  reciprocalRunway?: string;
}

export interface InterceptQuestion {
  mode: 'intercept';
  templateId: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  answer: string;
  explanation: string;
  scenario: InterceptScenario;
}

export interface InterceptRoundResult {
  question: InterceptQuestion;
  picked: string;
  correct: boolean;
}

export interface InterceptTemplate {
  id: string;
  difficulty: ReadonlyArray<Difficulty>;
  build: (ctx: ApproachContext, rng: () => number) => InterceptQuestion;
}
