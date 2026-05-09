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
  let showInfo = $state(false);
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
        <button
          class="info-btn"
          aria-label="About this mode"
          aria-expanded={showInfo}
          onclick={() => (showInfo = !showInfo)}
        >i</button>
      
      </div>
      {#if showInfo}
        <p class="mode-info">Read the Flight Mode Annunciator. Pick what is actually engaged across pitch, roll, autothrottle, and the active autoflight mode.</p>
      {/if}

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
  .round { display: flex; flex-direction: column; gap: 0.85rem; align-items: stretch; width: 100%; }

  .card {
    width: 100%;
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 2px;
    padding: 1.4rem 1.2rem 1.2rem;
    display: grid;
    grid-template-columns: 1.25fr 1fr;
    gap: 1rem;
    align-items: start;
  }
  @media (max-width: 880px) { .card { grid-template-columns: 1fr; } }

  .card-head { grid-column: 1 / -1; display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
  .mode-pill, .diff-pill {
    font-family: var(--mono); font-size: 0.62rem; letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--label-dim); border: 1px solid var(--bezel-hi); border-bottom-color: var(--bezel-lo); border-right-color: var(--bezel-lo); background: var(--panel-2); padding: 0.22rem 0.5rem; border-radius: 1px; font-weight: 700;
  }
  .mode-pill { color: var(--label); letter-spacing: 0.22em; }
  .diff-pill { color: var(--led-amber); }

  .pfd-wrap {
    background: var(--panel-2);
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
    padding: 0.5rem;
    overflow: hidden;
  }

  .right-col { display: flex; flex-direction: column; gap: 0.85rem; }

  .atc-call { display: grid; grid-template-columns: 56px 1fr; gap: 0.85rem; align-items: stretch; }
  .atc-bubble {
    grid-column: 1 / -1;
    background: var(--mfd-bg);
    border: 1px solid var(--bezel-lo);
    border-radius: 2px;
    padding: 0.85rem 1rem 0.95rem;
  }
  .atc-bubble h2 { font-family: var(--mono); font-weight: 700; font-size: 0.95rem; color: var(--mfd-text); letter-spacing: 0.05em; line-height: 1.5; text-transform: uppercase; }
  .atc-bubble .sub { font-family: var(--mono); font-size: 0.62rem; letter-spacing: 0.18em; color: var(--mfd-dim); text-transform: uppercase; margin-top: 0.4rem; }

  .annotation, .recap-gates {
    display: flex; flex-direction: column; gap: 0.3rem;
    background: var(--panel-2);
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
    padding: 0.55rem 0.7rem;
  }
  .ann-row { display: grid; grid-template-columns: auto auto 1fr; align-items: baseline; gap: 0.55rem; font-family: var(--sans); font-size: 0.78rem; }
  .ann-tag {
    font-family: var(--mono); font-size: 0.58rem; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 700;
    padding: 0.1rem 0.42rem; border-radius: 1px;
  }
  .ann-row.bad .ann-tag { color: var(--led-red); border: 1px solid var(--led-red); }
  .ann-row.tight .ann-tag { color: var(--led-amber); border: 1px solid var(--led-amber); }
  .ann-label { color: var(--label); font-weight: 700; }
  .ann-detail { color: var(--label-dim); }

  .options {
    display: flex; flex-direction: column; gap: 0.45rem;
  }
  .options.disabled { pointer-events: none; }
  .option {
    display: grid; grid-template-columns: 30px 1fr;
    align-items: center; column-gap: 0.7rem;
    padding: 0.85rem 0.85rem 0.85rem 0.55rem;
    background: var(--panel-2);
    border: 1px solid var(--bezel-hi); border-bottom-color: var(--bezel-lo); border-right-color: var(--bezel-lo);
    border-radius: 1px; cursor: pointer; text-align: left;
  }
  .option:hover .opt-text { color: #fff; }
  .option:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
  .option[disabled] { cursor: default; }
  .key {
    display: inline-flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; font-family: var(--mono); font-size: 0.7rem; color: var(--label-dim);
    border: 1px solid var(--bezel-hi); border-bottom-color: var(--bezel-lo); border-right-color: var(--bezel-lo);
    background: var(--bg); border-radius: 1px; font-weight: 700;
  }
  .opt-text { font-family: var(--sans); font-weight: 700; font-size: 0.95rem; color: var(--label); letter-spacing: -0.005em; }

  .option.correct { border-color: var(--led-green); background: rgba(74, 222, 128, 0.08); }
  .option.correct .opt-text { color: var(--led-green); }
  .option.correct .key { color: var(--led-green); border-color: var(--led-green); }
  .option.wrong { border-color: var(--led-red); background: rgba(248, 113, 113, 0.06); }
  .option.wrong .opt-text { color: var(--led-red); }
  .option.wrong .key { color: var(--led-red); border-color: var(--led-red); }

  .feedback {
    background: var(--panel-2);
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
    padding: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .feedback.good { border-color: rgba(74, 222, 128, 0.4); background: rgba(74, 222, 128, 0.06); }
  .feedback.bad { border-color: rgba(248, 113, 113, 0.4); background: rgba(248, 113, 113, 0.06); }
  .explain { font-family: var(--sans); font-size: 0.85rem; color: var(--label-2); line-height: 1.45; white-space: pre-line; }

  .next {
    align-self: flex-end;
    font-family: var(--mono); font-weight: 700; font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--led-cyan); padding: 0.5rem 0.95rem;
    border: 1px solid var(--bezel-hi); border-bottom-color: var(--bezel-lo); border-right-color: var(--bezel-lo);
    background: var(--panel); border-radius: 1px; cursor: pointer;
  }
  .next:hover { color: #b0ecf6; }
  .next:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }

  .kb-legend { display: flex; justify-content: center; gap: 1.1rem; font-family: var(--mono); font-size: 0.6rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--label-faint); padding: 0.4rem 0; }
  .kb-legend kbd { font-family: var(--mono); background: var(--panel-2); border: 1px solid var(--bezel-hi); border-bottom-color: var(--bezel-lo); border-right-color: var(--bezel-lo); border-radius: 1px; padding: 0.05rem 0.32rem; color: var(--label-dim); font-weight: 700; margin: 0 0.1rem; }

  .info-btn { margin-left: auto; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-family: var(--mono); font-weight: 700; font-style: italic; font-size: 0.72rem; color: var(--label-dim); background: var(--panel-2); border: 1px solid var(--bezel-hi); border-bottom-color: var(--bezel-lo); border-right-color: var(--bezel-lo); border-radius: 1px; cursor: pointer; }
  .info-btn:hover { color: var(--led-cyan); border-color: var(--led-cyan); }
  .info-btn:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
  .info-btn[aria-expanded="true"] { color: var(--led-cyan); border-color: var(--led-cyan); }
  .mode-info { grid-column: 1 / -1; font-family: var(--sans); font-size: 0.82rem; line-height: 1.5; color: var(--label-2); background: var(--panel-2); border: 1px solid var(--bezel-lo); border-radius: 1px; padding: 0.7rem 0.85rem; margin: 0; }
</style>
