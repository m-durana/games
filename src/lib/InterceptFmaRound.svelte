<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onDestroy, onMount } from 'svelte';
  import type { Difficulty } from './types';
  import {
    INTERCEPT_FMA_ROUND_LENGTH,
    ALERT_HEIGHT_FT,
    buildInterceptFmaRound,
    type InterceptFmaQuestion,
    type InterceptFmaResult,
  } from './intercept-fma';
  import InstrumentPanel from './InstrumentPanel.svelte';
  import { difficultyLabel } from './engine';
  import { clearProgress, progressKey, recordProgress, sessionKey } from './progress';
  import * as Sound from './sound';
  import RoundBar from './RoundBar.svelte';

  interface Props {
    difficulty: Difficulty;
    onFinish: (results: InterceptFmaResult[]) => void;
    onQuit: () => void;
  }

  let { difficulty, onFinish, onQuit }: Props = $props();

  // svelte-ignore state_referenced_locally
  const SESSION_KEY = sessionKey('interceptFma', difficulty);
  // svelte-ignore state_referenced_locally
  const PKEY = progressKey('interceptFma', difficulty);

  interface SavedSession {
    v: 1; difficulty: Difficulty; questions: InterceptFmaQuestion[]; index: number; results: InterceptFmaResult[];
  }
  function loadSession(): SavedSession | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as SavedSession;
      if (s.v !== 1 || s.difficulty !== difficulty) return null;
      if (!Array.isArray(s.questions) || s.questions.length === 0) return null;
      if (s.index >= s.questions.length) return null;
      return s;
    } catch { return null; }
  }
  // svelte-ignore state_referenced_locally
  const initial = (() => {
    const saved = loadSession();
    if (saved) return { questions: saved.questions, index: saved.index, results: saved.results };
    // svelte-ignore state_referenced_locally
    return { questions: buildInterceptFmaRound(difficulty), index: 0, results: [] as InterceptFmaResult[] };
  })();

  let questions: InterceptFmaQuestion[] = $state(initial.questions);
  let index = $state(initial.index);
  let pickedOption: string | null = $state(null);
  let committed = $state(false);
  let results: InterceptFmaResult[] = $state(initial.results);

  // Tick state
  let tStart = 0;
  let elapsed = $state(0);
  let raf: number | null = null;
  let timedOut = $state(false);

  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    if (index === 0 && results.length === 0) return;
    const session: SavedSession = { v: 1, difficulty, questions, index, results };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    recordProgress({
      key: PKEY, gameKind: 'interceptFma', label: `FMA Watch · ${difficulty}`, category: 'Radar',
      difficulty, currentIndex: index, total: questions.length, savedAt: 0, sessionStorageKey: SESSION_KEY,
    });
  });

  const current = $derived(questions[index]);
  const score = $derived(results.filter((r) => r.correct).length);
  const lastResult = $derived(results[results.length - 1]);

  // Find the active beat (FMA state snaps; AGL interpolates).
  const activeBeat = $derived.by(() => {
    if (!current) return null;
    let beat = current.timeline[0];
    for (const b of current.timeline) {
      if (b.tSec <= elapsed) beat = b;
      else break;
    }
    return beat;
  });

  // Smoothly interpolate AGL between the active beat and the next beat.
  const liveAgl = $derived.by(() => {
    if (!current) return 0;
    const tl = current.timeline;
    if (elapsed <= tl[0].tSec) return tl[0].agl;
    const last = tl[tl.length - 1];
    if (elapsed >= last.tSec) {
      // Extrapolate at the final descent rate so altitude keeps ticking down.
      const prev = tl.length >= 2 ? tl[tl.length - 2] : null;
      if (!prev) return last.agl;
      const rate = (last.agl - prev.agl) / (last.tSec - prev.tSec); // ft/sec, negative
      return Math.max(0, last.agl + rate * (elapsed - last.tSec));
    }
    for (let i = 0; i < tl.length - 1; i++) {
      const a = tl[i];
      const b = tl[i + 1];
      if (elapsed >= a.tSec && elapsed <= b.tSec) {
        const u = (elapsed - a.tSec) / (b.tSec - a.tSec);
        return a.agl + u * (b.agl - a.agl);
      }
    }
    return last.agl;
  });

  // Live FMA-injected scenario.
  const liveScenario = $derived.by(() => {
    if (!current || !activeBeat) return current?.scenario;
    const agl = Math.round(liveAgl);
    return {
      ...current.scenario,
      fma: activeBeat.fma,
      aircraft: { ...current.scenario.aircraft, agl, alt: current.scenario.runway.elevationFt + agl },
    };
  });

  function startTick() {
    timedOut = false;
    elapsed = 0;
    tStart = performance.now();
    const tick = (now: number) => {
      if (committed) return;
      elapsed = (now - tStart) / 1000;
      if (elapsed >= current.windowSec) {
        elapsed = current.windowSec;
        // Auto-commit as missed → goAround if correct, otherwise wrong.
        if (!committed) {
          timedOut = true;
          commitWithPick(null);
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function commitWithPick(opt: 'Continue' | 'Go around' | null) {
    if (committed) return;
    pickedOption = opt;
    let correct = false;
    if (opt !== null) {
      correct = (opt === 'Continue' && current.correctAnswer === 'continue') ||
                (opt === 'Go around' && current.correctAnswer === 'goAround');
    }
    committed = true;
    if (correct) { Sound.correct(); Sound.vibrate(15); } else { Sound.wrong(); Sound.vibrate(35); }
    results = [...results, { question: current, picked: opt ?? '(timeout)', correct, pickedAtSec: Math.round(elapsed * 10) / 10 }];
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
  }

  function next() {
    if (index + 1 >= questions.length) { clearProgress(PKEY); onFinish(results); return; }
    index += 1;
    pickedOption = null;
    committed = false;
    timedOut = false;
    startTick();
  }

  function dotState(i: number): 'todo' | 'current' | 'correct' | 'wrong' {
    if (i < results.length) return results[i].correct ? 'correct' : 'wrong';
    if (i === index) return 'current';
    return 'todo';
  }
  const progressLeds = $derived(questions.map((_, i) => dotState(i)));

  onMount(() => {
    startTick();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onQuit(); return; }
      if (committed && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); next(); return; }
      if (committed) return;
      if (e.key === '1') commitWithPick('Continue');
      if (e.key === '2') commitWithPick('Go around');
    };
    window.addEventListener('keydown', handler);
    const onVisChange = () => {
      // Pause/resume tick when tab loses focus.
      if (document.hidden && raf !== null) { cancelAnimationFrame(raf); raf = null; }
      else if (!document.hidden && !committed) { tStart = performance.now() - elapsed * 1000; startTick(); }
    };
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      window.removeEventListener('keydown', handler);
      document.removeEventListener('visibilitychange', onVisChange);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  });

  onDestroy(() => { if (raf !== null) cancelAnimationFrame(raf); });
</script>

<RoundBar progress={progressLeds} {score} total={INTERCEPT_FMA_ROUND_LENGTH} {onQuit} />

<section class="round">
  {#key index}
    <div class="card" in:fly={{ y: 16, duration: 220 }}>
      <div class="card-head">
        <span class="mode-pill">FMA Watch</span>
        <span class="diff-pill">{difficultyLabel(difficulty)}</span>
        <span class="cat-pill">CAT IIIb</span>
        <span class="timer" class:warn={elapsed > current.windowSec - 4}>{(current.windowSec - elapsed).toFixed(1)}s</span>
      </div>

      <div class="pfd-wrap">
        {#if liveScenario}<InstrumentPanel scenario={liveScenario} />{/if}
      </div>

      <div class="right-col">
        <div class="atc-bubble">
          <h2>{current.prompt}</h2>
          <p class="sub">PM call. Watch the FMA. Alert height is {ALERT_HEIGHT_FT} ft AGL.</p>
        </div>

        <div class="options" class:disabled={committed}>
          {#each current.options as opt}
            {@const isCorrect = (opt === 'Continue' && current.correctAnswer === 'continue') || (opt === 'Go around' && current.correctAnswer === 'goAround')}
            {@const wasPicked = pickedOption === opt}
            <button
              class="option"
              class:correct={committed && isCorrect}
              class:wrong={committed && wasPicked && !isCorrect}
              class:reveal={committed && !wasPicked && !isCorrect}
              disabled={committed}
              onclick={() => commitWithPick(opt)}
            >
              <span class="key">{opt === 'Continue' ? '1' : '2'}</span>
              <span class="opt-text">{opt}</span>
            </button>
          {/each}
        </div>

        {#if committed}
          <div class="feedback" class:good={lastResult?.correct} class:bad={!lastResult?.correct}>
            {#if timedOut}<p class="timeout">Window closed — counted as miss.</p>{/if}
            <p class="explain">{current.explanation}</p>
            <button class="next" onclick={next}>Next →</button>
          </div>
        {/if}
      </div>
    </div>
  {/key}
  <div class="kb-legend" aria-hidden="true">
    {#if committed}<span><kbd>Enter</kbd> next</span>{:else}<span><kbd>1</kbd> continue · <kbd>2</kbd> go around</span>{/if}
    <span><kbd>Esc</kbd> quit</span>
  </div>
</section>

<style>
  .bar { width: 100%; display: flex; align-items: center; gap: 0.625rem; padding: 0 0.25rem; }
  .quit { width: 32px; height: 32px; border-radius: 4px; background: var(--surface); border: 1px solid var(--border); color: var(--muted); font-size: 0.9rem; line-height: 1; }
  .dots { flex: 1; display: flex; gap: 4px; justify-content: center; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--surface-2); }
  .dot-now { background: var(--accent); }
  .dot-correct { background: var(--good); }
  .dot-wrong { background: var(--bad); }
  .meta { font-variant-numeric: tabular-nums; color: var(--muted); font-size: 0.875rem; min-width: 4ch; text-align: right; }
  .round { display: flex; flex-direction: column; gap: 0.625rem; padding: 0.5rem 0; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 0.875rem; display: grid; gap: 0.75rem; grid-template-columns: 1fr; grid-template-areas: "head" "pfd" "right"; }
  @media (min-width: 820px) { .card { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); grid-template-areas: "head head" "pfd right"; align-items: start; } }
  .card-head { grid-area: head; display: flex; gap: 0.4rem; align-items: center; }
  .pfd-wrap { grid-area: pfd; display: flex; justify-content: center; min-width: 0; }
  .right-col { grid-area: right; display: flex; flex-direction: column; gap: 0.75rem; min-width: 0; }
  .mode-pill, .diff-pill, .cat-pill { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.2rem 0.5rem; border-radius: 4px; background: var(--surface-2); color: var(--muted); }
  .mode-pill { background: var(--accent); color: var(--bg); font-weight: 600; }
  .cat-pill { background: rgba(163, 206, 241, 0.4); color: var(--text); font-weight: 600; }
  .timer { margin-left: auto; font-family: var(--font-main); font-size: 0.875rem; font-variant-numeric: tabular-nums; padding: 0.15rem 0.5rem; border: 1px solid var(--border); border-radius: 4px; background: var(--surface-2); color: var(--text); }
  .timer.warn { color: var(--bad); border-color: rgba(239, 68, 68, 0.6); }
  .atc-bubble { background: #18242f; border: 1px solid rgba(96, 150, 186, 0.45); border-radius: 12px; padding: 0.7rem 0.85rem; }
  .atc-bubble h2 { font-size: 1rem; font-weight: 600; line-height: 1.4; margin: 0; }
  .atc-bubble .sub { margin: 0.2rem 0 0; font-size: 0.8125rem; color: var(--muted); }
  .options { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; }
  .options.disabled { pointer-events: none; }
  .option { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 0.7rem 0.875rem; font-size: 0.9375rem; text-align: left; display: flex; align-items: center; gap: 0.625rem; }
  .option .key { width: 22px; height: 22px; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; color: var(--muted); flex-shrink: 0; }
  .option.correct { background: rgba(34, 197, 94, 0.18); border-color: var(--good); }
  .option.wrong { background: rgba(239, 68, 68, 0.18); border-color: var(--bad); }
  .option.reveal { opacity: 0.55; }
  .feedback { background: var(--surface-2); border-left: 3px solid var(--muted); border-radius: 4px; padding: 0.6rem 0.75rem; display: flex; flex-direction: column; gap: 0.4rem; }
  .feedback.good { border-color: var(--good); }
  .feedback.bad { border-color: var(--bad); }
  .timeout { margin: 0; font-size: 0.8125rem; color: var(--bad); }
  .explain { margin: 0; font-size: 0.8125rem; color: var(--muted); line-height: 1.4; }
  .next { align-self: flex-end; background: var(--accent); color: var(--bg); border: 0; border-radius: 6px; padding: 0.45rem 1rem; font-weight: 600; font-size: 0.875rem; cursor: pointer; }
  .kb-legend { display: flex; gap: 0.875rem; justify-content: center; align-items: center; color: var(--muted); font-size: 0.6875rem; }
  .kb-legend kbd { padding: 0 0.3rem; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); font-family: var(--font-main); font-size: 0.6875rem; color: var(--text); }
</style>
