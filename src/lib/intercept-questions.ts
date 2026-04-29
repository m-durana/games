// Curated bank of judgment-question templates for Radar Intercepts. Each
// template produces a self-contained question with a defensible "correct"
// answer based on real IFR practice. Add templates here over time.

import type { InterceptQuestion, InterceptTemplate } from './intercepts-types';
import { buildScenario } from './intercept-scenario';

function fmtHeading(h: number): string {
  const r = Math.round(((h % 360) + 360) % 360);
  return r.toString().padStart(3, '0');
}

function tailwindFor(finalCourse: number): number {
  return (finalCourse + 180) % 360;
}

function crosswindFor(finalCourse: number, side: 'left' | 'right'): number {
  return ((finalCourse + (side === 'right' ? 90 : -90)) + 360) % 360;
}

const T_HIGH_AND_CLOSE: InterceptTemplate = {
  id: 'high-and-close',
  difficulty: ['easy', 'medium', 'hard'],
  build(ctx, rng): InterceptQuestion {
    const range = 3;
    const gsAlt = range * 6076.12 * Math.tan(3 * Math.PI / 180);
    const altitude = Math.round((ctx.airport.elevationFt ?? 0) + gsAlt + 800);
    const scenario = buildScenario(ctx, { range, altitude, speed: 160, windFrom: 0, windKt: 0 }, rng);
    const options = ['Continue and try to descend', 'S-turn to lose altitude', 'Go missed'];
    return {
      mode: 'intercept',
      templateId: 'high-and-close',
      prompt: `${scenario.state.callsign}, ${scenario.airportIata} ${scenario.approachName}. You're 3 nm from the runway, 800 ft above glideslope at 160 kt. What's your call?`,
      options,
      correctIndex: 2,
      answer: options[2],
      explanation: 'Inside 5 nm, 800 ft high is unsalvageable on a stabilized approach - going missed is the right call. S-turning that close to the threshold compounds the problem; continuing busts stabilized-approach criteria.',
      scenario,
    };
  },
};

const T_HIGH_BUT_FAR: InterceptTemplate = {
  id: 'high-but-far',
  difficulty: ['medium', 'hard'],
  build(ctx, rng): InterceptQuestion {
    const range = 9;
    const gsAlt = range * 6076.12 * Math.tan(3 * Math.PI / 180);
    const altitude = Math.round((ctx.airport.elevationFt ?? 0) + gsAlt + 700);
    const scenario = buildScenario(ctx, { range, altitude, speed: 200, windFrom: 0, windKt: 0 }, rng);
    const options = ['Continue and capture from above', 'S-turn to lose altitude', 'Go missed'];
    return {
      mode: 'intercept',
      templateId: 'high-but-far',
      prompt: `${scenario.state.callsign}, ${scenario.airportIata} ${scenario.approachName}. You're 9 nm out, 700 ft above glideslope at 200 kt. What's your call?`,
      options,
      correctIndex: 0,
      answer: options[0],
      explanation: 'At 9 nm a 700-ft height excess is recoverable with a steeper descent (~4°) before the FAF. S-turns waste track miles and aren\'t needed; missed is overkill.',
      scenario,
    };
  },
};

const T_TAILWIND: InterceptTemplate = {
  id: 'tailwind-on-runway',
  difficulty: ['easy', 'medium', 'hard'],
  build(ctx, rng): InterceptQuestion {
    if (!ctx.reciprocalDesignator) throw new Error('needs reciprocal');
    const range = 8;
    const altitude = (ctx.airport.elevationFt ?? 0) + 3000;
    const finalCourse = ctx.approach.finalCourseT;
    const windFrom = tailwindFor(finalCourse);
    const windKt = 18 + Math.floor(rng() * 8);
    const scenario = buildScenario(ctx, { range, altitude, speed: 180, windFrom, windKt }, rng);
    const options = [
      `Continue ILS RWY ${ctx.approach.runway}`,
      `Request ILS RWY ${ctx.reciprocalDesignator}`,
      'Hold for wind to drop',
    ];
    return {
      mode: 'intercept',
      templateId: 'tailwind-on-runway',
      prompt: `${scenario.state.callsign}, ${scenario.airportIata}. Cleared ${scenario.approachName}. Wind ${fmtHeading(windFrom)}/${windKt} - that's a ${windKt}-kt tailwind on RWY ${ctx.approach.runway}. What now?`,
      options,
      correctIndex: 1,
      answer: options[1],
      explanation: `Tailwind > 10 kt is outside most operators' landing limits. RWY ${ctx.reciprocalDesignator} faces into wind - request the reciprocal.`,
      scenario,
    };
  },
};

const T_LIGHT_TAILWIND: InterceptTemplate = {
  id: 'light-tailwind',
  difficulty: ['medium', 'hard'],
  build(ctx, rng): InterceptQuestion {
    if (!ctx.reciprocalDesignator) throw new Error('needs reciprocal');
    const range = 7;
    const altitude = (ctx.airport.elevationFt ?? 0) + 2800;
    const windFrom = tailwindFor(ctx.approach.finalCourseT);
    const windKt = 4 + Math.floor(rng() * 4);
    const scenario = buildScenario(ctx, { range, altitude, speed: 170, windFrom, windKt }, rng);
    const options = [
      `Continue ILS RWY ${ctx.approach.runway}`,
      `Request ILS RWY ${ctx.reciprocalDesignator}`,
      'Hold and ask for new winds',
    ];
    return {
      mode: 'intercept',
      templateId: 'light-tailwind',
      prompt: `${scenario.state.callsign}, ${scenario.airportIata} ${scenario.approachName}. Wind ${fmtHeading(windFrom)}/${windKt} - light tailwind on RWY ${ctx.approach.runway}. What's your call?`,
      options,
      correctIndex: 0,
      answer: options[0],
      explanation: `Most operators allow up to 10 kt tailwind for landing; ${windKt} kt is within tolerance - continue.`,
      scenario,
    };
  },
};

const T_FAST_VECTOR: InterceptTemplate = {
  id: 'fast-vector',
  difficulty: ['medium', 'hard'],
  build(ctx, rng): InterceptQuestion {
    const range = 6;
    const altitude = (ctx.airport.elevationFt ?? 0) + 5000;
    const scenario = buildScenario(ctx, { range, altitude, speed: 250, windFrom: 0, windKt: 0 }, rng);
    const options = [
      'Accept - start descent now',
      'Request delay vectors',
      'Request lower for the intercept',
    ];
    return {
      mode: 'intercept',
      templateId: 'fast-vector',
      prompt: `${scenario.state.callsign}, vectors to ${scenario.approachName}, intercept final at 6 nm. You're 250 kt at 5000 ft AGL. What's your call?`,
      options,
      correctIndex: 1,
      answer: options[1],
      explanation: '5000 ft and 250 kt at 6 nm is unstable: ~830 ft/nm to lose plus a speed reduction to ref. Ask for delay vectors so you can reach final at a sane energy state.',
      scenario,
    };
  },
};

const T_REASONABLE_VECTOR: InterceptTemplate = {
  id: 'reasonable-vector',
  difficulty: ['easy', 'medium'],
  build(ctx, rng): InterceptQuestion {
    const range = 10;
    const altitude = (ctx.airport.elevationFt ?? 0) + 3500;
    const scenario = buildScenario(ctx, { range, altitude, speed: 180, windFrom: 0, windKt: 0 }, rng);
    const options = [
      'Accept the vector',
      'Request delay vectors',
      'Request lower',
    ];
    return {
      mode: 'intercept',
      templateId: 'reasonable-vector',
      prompt: `${scenario.state.callsign}, vectors to ${scenario.approachName}, intercept at 10 nm. You're 180 kt at 3500 ft AGL. Your call?`,
      options,
      correctIndex: 0,
      answer: options[0],
      explanation: '180 kt at 3500 ft AGL with 10 nm to run is well-positioned for a stabilized intercept - accept.',
      scenario,
    };
  },
};

const T_CROSSWIND_VISUAL: InterceptTemplate = {
  id: 'crosswind-visual',
  difficulty: ['medium', 'hard'],
  build(ctx, rng): InterceptQuestion {
    const range = 8;
    const altitude = (ctx.airport.elevationFt ?? 0) + 2500;
    const finalCourse = ctx.approach.finalCourseT;
    const windFrom = crosswindFor(finalCourse, rng() < 0.5 ? 'left' : 'right');
    const windKt = 22 + Math.floor(rng() * 8);
    const scenario = buildScenario(ctx, { range, altitude, speed: 170, windFrom, windKt }, rng);
    const options = [
      'Accept the visual',
      'Decline - stay on the ILS',
      'Ask for vectors away from the wind',
    ];
    return {
      mode: 'intercept',
      templateId: 'crosswind-visual',
      prompt: `${scenario.state.callsign}, ${scenario.airportIata}. Tower offers visual to RWY ${ctx.approach.runway}. Wind ${fmtHeading(windFrom)}/${windKt} - ~${windKt}-kt crosswind. ILS already loaded. What's your call?`,
      options,
      correctIndex: 1,
      answer: options[1],
      explanation: 'A 22–30 kt crosswind on a visual is at or beyond demonstrated values for most types. The ILS gives you a stabilized lateral reference all the way down - keep it.',
      scenario,
    };
  },
};

const T_SPACING_REDUCE: InterceptTemplate = {
  id: 'spacing-reduce',
  difficulty: ['easy', 'medium'],
  build(ctx, rng): InterceptQuestion {
    const range = 9;
    const altitude = (ctx.airport.elevationFt ?? 0) + 3000;
    const scenario = buildScenario(ctx, { range, altitude, speed: 200, windFrom: 0, windKt: 0 }, rng);
    const options = [
      'Reduce to final approach speed now',
      'Break off and request re-sequence',
      'Negotiate a higher speed',
    ];
    return {
      mode: 'intercept',
      templateId: 'spacing-reduce',
      prompt: `${scenario.state.callsign}, three on final, you're #2. Tower: "reduce to final approach speed now or break off." 9 nm out, 200 kt. Your call?`,
      options,
      correctIndex: 0,
      answer: options[0],
      explanation: 'You\'re close enough to slow down without disturbing the sequence. Breaking off is the fallback if you can\'t comply; negotiating wastes time the controller doesn\'t have.',
      scenario,
    };
  },
};

const T_LOW_AND_FAST: InterceptTemplate = {
  id: 'low-and-fast',
  difficulty: ['hard'],
  build(ctx, rng): InterceptQuestion {
    const range = 5;
    const altitude = (ctx.airport.elevationFt ?? 0) + 1200;
    const scenario = buildScenario(ctx, { range, altitude, speed: 220, windFrom: 0, windKt: 0 }, rng);
    const options = [
      'Continue - slow down on the way',
      'Go missed and request re-sequence',
      'S-turn to bleed energy',
    ];
    return {
      mode: 'intercept',
      templateId: 'low-and-fast',
      prompt: `${scenario.state.callsign}, ${scenario.approachName}. 5 nm to threshold, 1200 ft AGL, 220 kt. What's your call?`,
      options,
      correctIndex: 1,
      answer: options[1],
      explanation: 'You\'re 100+ kt above target speed inside 5 nm and below glideslope - no clean stabilization possible. Go missed.',
      scenario,
    };
  },
};

const T_LOC_CAPTURED_HIGH: InterceptTemplate = {
  id: 'localizer-captured-high',
  difficulty: ['hard'],
  build(ctx, rng): InterceptQuestion {
    const range = 7;
    const gsAlt = range * 6076.12 * Math.tan(3 * Math.PI / 180);
    const altitude = Math.round((ctx.airport.elevationFt ?? 0) + gsAlt + 400);
    const scenario = buildScenario(ctx, { range, altitude, speed: 190, windFrom: 0, windKt: 0 }, rng);
    const options = [
      'Capture from above - increase descent rate',
      'S-turn to drop below glideslope',
      'Go missed',
    ];
    return {
      mode: 'intercept',
      templateId: 'localizer-captured-high',
      prompt: `${scenario.state.callsign}, ${scenario.approachName}. Localizer captured at 7 nm, 400 ft above glideslope at 190 kt. Your call?`,
      options,
      correctIndex: 0,
      answer: options[0],
      explanation: '400 ft high at 7 nm is recoverable with a slightly steeper descent (~3.5°). S-turning the localizer breaks lateral capture; missed is unnecessary.',
      scenario,
    };
  },
};

export const INTERCEPT_TEMPLATES: InterceptTemplate[] = [
  T_HIGH_AND_CLOSE,
  T_HIGH_BUT_FAR,
  T_TAILWIND,
  T_LIGHT_TAILWIND,
  T_FAST_VECTOR,
  T_REASONABLE_VECTOR,
  T_CROSSWIND_VISUAL,
  T_SPACING_REDUCE,
  T_LOW_AND_FAST,
  T_LOC_CAPTURED_HIGH,
];
