<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onMount } from 'svelte';
  import type { Difficulty } from './types';
  import {
    INTERCEPT_MINIMUMS_ROUND_LENGTH,
    buildInterceptMinimumsRound,
    REFERENCE_LABEL,
    type InterceptMinimumsQuestion,
    type InterceptMinimumsResult,
  } from './intercept-minimums';
  import InstrumentPanel from './InstrumentPanel.svelte';
  import OutsideView from './OutsideView.svelte';
  import { difficultyLabel } from './engine';
  import { clearProgress, progressKey, recordProgress, sessionKey } from './progress';
  import * as Sound from './sound';
  import RoundBar from './RoundBar.svelte';

  interface Props {
    difficulty: Difficulty;
    onFinish: (results: InterceptMinimumsResult[]) => void;
    onQuit: () => void;
  }

  let { difficulty, onFinish, onQuit }: Props = $props();

  // svelte-ignore state_referenced_locally
  const SESSION_KEY = sessionKey('interceptMinimums', difficulty);
  // svelte-ignore state_referenced_locally
  const PKEY = progressKey('interceptMinimums', difficulty);

  interface SavedSession {
    v: 1;
    difficulty: Difficulty;
    questions: InterceptMinimumsQuestion[];
    index: number;
    results: InterceptMinimumsResult[];
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
    return { questions: buildInterceptMinimumsRound(difficulty), index: 0, results: [] as InterceptMinimumsResult[] };
  })();

  let questions: InterceptMinimumsQuestion[] = $state(initial.questions);
  let index = $state(initial.index);
  let pickedOption: string | null = $state(null);
  let committed = $state(false);
  let results: InterceptMinimumsResult[] = $state(initial.results);

  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    if (index === 0 && results.length === 0) return;
    const session: SavedSession = { v: 1, difficulty, questions, index, results };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    recordProgress({
      key: PKEY,
      gameKind: 'interceptMinimums',
      label: `At Minimums · ${difficulty}`,
      category: 'Radar',
      difficulty,
      currentIndex: index,
      total: questions.length,
      savedAt: 0,
      sessionStorageKey: SESSION_KEY,
    });
  });

  const current = $derived(questions[index]);
  const score = $derived(results.filter((r) => r.correct).length);
  const lastResult = $derived(results[results.length - 1]);

  function pickOption(opt: typeof current.options[number]) {
    if (committed) return;
    pickedOption = opt;
    const map = { 'Continue / Landing': 'continue', '100 ft only': 'hundred', 'Go around': 'goAround' } as const;
    const correct = map[opt] === current.correctAnswer;
    committed = true;
    if (correct) { Sound.correct(); Sound.vibrate(15); } else { Sound.wrong(); Sound.vibrate(35); }
    results = [...results, { question: current, picked: opt, correct }];
  }

  function next() {
    if (index + 1 >= questions.length) { clearProgress(PKEY); onFinish(results); return; }
    index += 1;
    pickedOption = null;
    committed = false;
  }

  function dotState(i: number): 'todo' | 'current' | 'correct' | 'wrong' {
    if (i < results.length) return results[i].correct ? 'correct' : 'wrong';
    if (i === index) return 'current';
    return 'todo';
  }
  const progressLeds = $derived(questions.map((_, i) => dotState(i)));

  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onQuit(); return; }
      if (committed && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); next(); return; }
      if (committed) return;
      if (e.key === '1') pickOption('Continue / Landing');
      else if (e.key === '2') pickOption('100 ft only');
      else if (e.key === '3') pickOption('Go around');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
</script>

<RoundBar progress={progressLeds} {score} total={INTERCEPT_MINIMUMS_ROUND_LENGTH} {onQuit} />

<section class="round">
  {#key index}
    <div class="card" in:fly={{ y: 16, duration: 220 }}>
      <div class="card-head">
        <span class="mode-pill">At Minimums</span>
        <span class="diff-pill">{difficultyLabel(difficulty)}</span>
        <span class="cat-pill">CAT {current.scenario.cat}</span>
      </div>

      <div class="pfd-wrap">
        <InstrumentPanel scenario={current.scenario} />
      </div>

      <div class="right-col">
        <OutsideView reference={current.reference} ambiguity={current.ambiguity} rvrM={current.scenario.weather.rvrM} />

        <div class="atc-bubble">
          <h2>{current.prompt}</h2>
          <p class="sub">"Minimums." What do you call?</p>
        </div>

        <div class="options" class:disabled={committed}>
          {#each current.options as opt, i}
            {@const map = { 'Continue / Landing': 'continue', '100 ft only': 'hundred', 'Go around': 'goAround' } as const}
            {@const isCorrect = map[opt] === current.correctAnswer}
            {@const wasPicked = pickedOption === opt}
            <button
              class="option"
              class:correct={committed && isCorrect}
              class:wrong={committed && wasPicked && !isCorrect}
              class:reveal={committed && !wasPicked && !isCorrect}
              disabled={committed}
              onclick={() => pickOption(opt)}
            >
              <span class="key">{i + 1}</span>
              <span class="opt-text">{opt}</span>
            </button>
          {/each}
        </div>

        {#if committed}
          <div class="feedback" class:good={lastResult?.correct} class:bad={!lastResult?.correct}>
            <div class="ref-row"><span class="ref-tag">Visual</span><span>{REFERENCE_LABEL[current.reference]}{current.ambiguity === 'maybe' ? ' (uncertain)' : ''}</span></div>
            <p class="explain">{current.explanation}</p>
            <button class="next" onclick={next}>Next →</button>
          </div>
        {/if}
      </div>
    </div>
  {/key}
  <div class="kb-legend" aria-hidden="true">
    {#if committed}<span><kbd>Enter</kbd> next</span>{:else}<span><kbd>1</kbd>-<kbd>3</kbd> pick</span>{/if}
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
  .explain { font-family: var(--sans); font-size: 0.85rem; color: var(--label-2); line-height: 1.45; }

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
</style>
