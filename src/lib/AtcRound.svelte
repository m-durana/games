<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onDestroy, onMount } from 'svelte';
  import type { Difficulty } from './types';
  import {
    ATC_ROUND_LENGTH,
    atcModeDescription,
    atcModeTitle,
    atcPromptLabel,
    buildAtcRound,
    type AtcMode,
    type AtcQuestion,
    type AtcRoundResult,
  } from './atc';
  import { difficultyLabel, loadSettings } from './engine';
  import * as Sound from './sound';

  interface Props {
    mode: AtcMode;
    difficulty: Difficulty;
    onFinish: (results: AtcRoundResult[]) => void;
    onQuit: () => void;
  }

  let { mode, difficulty, onFinish, onQuit }: Props = $props();

  // svelte-ignore state_referenced_locally
  let questions: AtcQuestion[] = $state(buildAtcRound(mode, difficulty));
  let index = $state(0);
  let picked: string | null = $state(null);
  let results: AtcRoundResult[] = $state([]);
  let showInfo = $state(false);
  let advanceTimer: number | null = null;

  const current = $derived(questions[index]);
  const score = $derived(results.filter((r) => r.correct).length);
  // svelte-ignore state_referenced_locally
  const showKeys = loadSettings().keyboardHints;

  function choose(option: string) {
    if (picked !== null) return;
    picked = option;
    const correct = option === current.answer;
    if (correct) {
      Sound.correct();
      Sound.vibrate(15);
    } else {
      Sound.wrong();
      Sound.vibrate(35);
    }
    const nextResults = [...results, { question: current, picked: option, correct }];
    results = nextResults;
    advanceTimer = window.setTimeout(() => advance(nextResults), 1400);
  }

  function advance(finalResults = results) {
    if (index + 1 >= questions.length) {
      onFinish(finalResults);
      return;
    }
    index += 1;
    picked = null;
  }

  function statusFor(option: string): 'idle' | 'correct' | 'wrong' | 'reveal' {
    if (picked === null) return 'idle';
    if (option === current.answer) return 'correct';
    if (option === picked) return 'wrong';
    return 'reveal';
  }

  function dotState(i: number): 'todo' | 'now' | 'correct' | 'wrong' {
    if (i < results.length) return results[i].correct ? 'correct' : 'wrong';
    if (i === index) return 'now';
    return 'todo';
  }

  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onQuit();
        return;
      }
      if (picked !== null) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= current.options.length) choose(current.options[n - 1]);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  onDestroy(() => {
    if (advanceTimer !== null) clearTimeout(advanceTimer);
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
  <span class="meta">{score}/{ATC_ROUND_LENGTH}</span>
</header>

<section class="round">
  {#key index}
    <div class="card" in:fly={{ y: 16, duration: 220 }}>
      <div class="card-head">
        <span class="mode-pill">{atcModeTitle(current.mode)}</span>
        <span class="diff-pill">{difficultyLabel(difficulty)}</span>
        {#if mode === 'atcMix'}
          <span class="mix-pill">Mix</span>
        {/if}
        <button
          class="info-btn"
          aria-label="About this mode"
          aria-expanded={showInfo}
          onclick={() => (showInfo = !showInfo)}
        >ⓘ</button>
      </div>
      {#if showInfo}
        <p class="mode-info">{atcModeDescription(mode === 'atcMix' ? current.mode : mode)}</p>
      {/if}

      <div class="prompt-block">
        <span class="prompt-label">{atcPromptLabel(current.mode)}</span>
        <h2>{current.prompt}</h2>
      </div>

      <div class="options" class:disabled={picked !== null}>
        {#each current.options as option, i}
          {@const s = statusFor(option)}
          <button
            class="option"
            class:correct={s === 'correct'}
            class:wrong={s === 'wrong'}
            class:reveal={s === 'reveal'}
            disabled={picked !== null}
            onclick={() => choose(option)}
          >
            {#if showKeys}
              <span class="key" aria-hidden="true">{i + 1}</span>
            {/if}
            <span class="opt-text">{option}</span>
            {#if picked !== null && option === current.answer}
              <span class="opt-explain">{current.explanation}</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/key}
  <div class="kb-legend" aria-hidden="true">
    <span><kbd>1</kbd>-<kbd>{current?.options.length ?? 4}</kbd> pick</span>
    <span><kbd>Esc</kbd> quit</span>
  </div>
</section>

<style>
  .bar {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0 0.25rem;
  }
  .quit {
    width: 32px;
    height: 32px;
    border-radius: 4px;
    color: var(--muted);
    background: var(--surface);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.875rem;
    border: 1px solid var(--border);
    flex-shrink: 0;
  }
  .quit:hover { color: var(--accent); border-color: var(--panel-line); }
  .dots {
    flex: 1;
    display: flex;
    gap: 5px;
    justify-content: center;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 4px;
    background: var(--surface-2);
    transition: background 0.2s, transform 0.2s;
  }
  .dot-correct { background: var(--good); }
  .dot-wrong { background: var(--bad); }
  .dot-now {
    background: var(--accent);
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.4); opacity: 0.65; }
  }
  .meta {
    font-size: 0.8125rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .round {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
  }
  .card {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  @media (min-width: 720px) {
    .card { padding: 2rem 2.5rem; }
  }
  .card-head {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    align-items: center;
  }
  .mode-pill,
  .diff-pill,
  .mix-pill {
    font-size: 0.6875rem;
    font-family: var(--font-main);
    letter-spacing: 0;
    text-transform: uppercase;
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
  }
  .mode-pill { color: var(--muted); background: var(--surface-2); }
  .diff-pill { color: var(--accent); background: rgba(163, 206, 241, 0.42); }
  .mix-pill { color: var(--accent-2); background: rgba(96, 150, 186, 0.16); }
  .info-btn {
    margin-left: auto;
    width: 26px;
    height: 26px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--muted);
    font-size: 0.85rem;
    line-height: 1;
  }
  .info-btn:hover { color: var(--accent); border-color: var(--panel-line); }
  .info-btn[aria-expanded="true"] {
    background: rgba(163, 206, 241, 0.45);
    border-color: rgba(96, 150, 186, 0.65);
    color: var(--accent);
  }
  .mode-info {
    margin-top: -0.5rem;
    padding: 0.6rem 0.75rem;
    background: rgba(163, 206, 241, 0.35);
    border: 1px solid rgba(96, 150, 186, 0.28);
    border-radius: 6px;
    font-size: 0.8125rem;
    line-height: 1.45;
    color: var(--muted);
  }

  .prompt-block {
    padding: 0.5rem 0;
    text-align: center;
  }
  .prompt-label {
    color: var(--muted);
    font-size: 0.875rem;
    display: block;
    margin-bottom: 0.4rem;
  }
  .prompt-block h2 {
    font-size: 1.55rem;
    font-weight: 600;
    letter-spacing: 0;
    line-height: 1.2;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }
  @media (min-width: 720px) {
    .options {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
  }
  .option {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    text-align: left;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.875rem 1.125rem;
    min-height: 56px;
    font-size: 1rem;
    transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s, opacity 0.15s;
  }
  .option:not(:disabled):active { transform: scale(0.98); }
  .option:not(:disabled):hover { border-color: var(--panel-line); background: var(--surface-3); }
  .option.correct {
    background: rgba(34, 197, 94, 0.14);
    border-color: rgba(34, 197, 94, 0.55);
    color: var(--good);
  }
  .option.wrong {
    background: rgba(239, 68, 68, 0.14);
    border-color: rgba(239, 68, 68, 0.55);
    color: var(--bad);
  }
  .option.reveal { opacity: 0.45; }
  .option:disabled { cursor: default; }
  .opt-text { flex: 1; }
  .opt-explain {
    flex-basis: 100%;
    margin-top: 0.35rem;
    font-size: 0.75rem;
    font-weight: 400;
    line-height: 1.35;
    color: var(--muted);
  }
  .key {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: var(--bg);
    border: 1px solid var(--border);
    font-size: 0.75rem;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .kb-legend {
    display: none;
    width: 100%;
    margin-top: 1rem;
    justify-content: center;
    gap: 1.25rem;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .kb-legend kbd {
    display: inline-block;
    padding: 0.05rem 0.35rem;
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    border-radius: 4px;
    background: var(--surface-2);
    color: var(--text);
    font-family: var(--font-main);
    font-size: 0.7rem;
    margin: 0 0.15rem;
  }
  @media (hover: hover) and (pointer: fine) {
    .kb-legend { display: flex; }
  }
</style>
