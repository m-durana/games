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

  function dotState(i: number): 'todo' | 'now' | 'correct' | 'wrong' {
    if (i < results.length) return results[i].correct ? 'correct' : 'wrong';
    if (i === index) return 'now';
    return 'todo';
  }

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

<header class="bar">
  <button class="quit" onclick={onQuit} aria-label="Quit">✕</button>
  <div class="dots" aria-label="Progress">
    {#each questions as _, i}
      {@const s = dotState(i)}
      <span class="dot dot-{s}"></span>
    {/each}
  </div>
  <span class="meta">{score}/{INTERCEPT_MINIMUMS_ROUND_LENGTH}</span>
</header>

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
  .atc-bubble { background: #18242f; border: 1px solid rgba(96, 150, 186, 0.45); border-radius: 12px; padding: 0.7rem 0.85rem; }
  .atc-bubble h2 { font-size: 1rem; font-weight: 600; line-height: 1.4; margin: 0; }
  .atc-bubble .sub { margin: 0.2rem 0 0; font-size: 0.8125rem; color: var(--muted); }
  .options { display: grid; grid-template-columns: 1fr; gap: 0.4rem; }
  .options.disabled { pointer-events: none; }
  .option { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 0.7rem 0.875rem; font-size: 0.9375rem; text-align: left; display: flex; align-items: center; gap: 0.625rem; }
  .option .key { width: 22px; height: 22px; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; color: var(--muted); flex-shrink: 0; }
  .option.correct { background: rgba(34, 197, 94, 0.18); border-color: var(--good); }
  .option.wrong { background: rgba(239, 68, 68, 0.18); border-color: var(--bad); }
  .option.reveal { opacity: 0.55; }
  .feedback { background: var(--surface-2); border-left: 3px solid var(--muted); border-radius: 4px; padding: 0.6rem 0.75rem; display: flex; flex-direction: column; gap: 0.4rem; }
  .feedback.good { border-color: var(--good); }
  .feedback.bad { border-color: var(--bad); }
  .ref-row { display: flex; gap: 0.5rem; align-items: baseline; font-size: 0.8125rem; color: var(--muted); }
  .ref-tag { font-size: 0.6875rem; text-transform: uppercase; padding: 0.1rem 0.4rem; border-radius: 3px; background: var(--surface); color: var(--accent); }
  .explain { margin: 0; font-size: 0.8125rem; color: var(--muted); line-height: 1.4; }
  .next { align-self: flex-end; background: var(--accent); color: var(--bg); border: 0; border-radius: 6px; padding: 0.45rem 1rem; font-weight: 600; font-size: 0.875rem; cursor: pointer; }
  .kb-legend { display: flex; gap: 0.875rem; justify-content: center; align-items: center; color: var(--muted); font-size: 0.6875rem; }
  .kb-legend kbd { padding: 0 0.3rem; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); font-family: var(--font-main); font-size: 0.6875rem; color: var(--text); }
</style>
