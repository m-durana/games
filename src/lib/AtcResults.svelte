<script lang="ts">
  import { onMount } from 'svelte';
  import type { Difficulty } from './types';
  import {
    ATC_ROUND_LENGTH,
    atcModeTitle,
    saveAtcBest,
    type AtcMode,
    type AtcRoundResult,
  } from './atc';
  import type { RadarRoundResult } from './atc-radar';
  import type { ClearedRoundResult } from './cleared-direct';
  import type { InterceptRoundResult } from './intercepts';
  import type { SequenceRoundResult } from './sequencing';

  type RecapResult = AtcRoundResult | RadarRoundResult | ClearedRoundResult | InterceptRoundResult | SequenceRoundResult;
  import { difficultyLabel } from './engine';
  import * as Sound from './sound';

  interface Props {
    mode: AtcMode;
    difficulty: Difficulty;
    results: RecapResult[];
    onAgain: () => void;
    onHome: () => void;
  }

  let { mode, difficulty, results, onAgain, onHome }: Props = $props();

  // svelte-ignore state_referenced_locally
  const score = results.filter((r) => r.correct).length;
  const pct = Math.round((score / ATC_ROUND_LENGTH) * 100);
  // svelte-ignore state_referenced_locally
  const isNewBest = saveAtcBest(mode, difficulty, score);
  let expanded: number | null = $state(null);
  let displayScore = $state(0);

  function verdict() {
    if (score === ATC_ROUND_LENGTH) return 'Readback perfect.';
    if (score >= 8) return 'Crisp radio work.';
    if (score >= 6) return 'Solid copy.';
    if (score >= 3) return 'Some calls got stepped on.';
    return 'Say again?';
  }

  function toggle(i: number) {
    expanded = expanded === i ? null : i;
  }

  onMount(() => {
    if (score === ATC_ROUND_LENGTH) Sound.perfect();
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      displayScore = Math.round(score * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
</script>

<header class="head">
  <div class="pills">
    <span class="pill">{atcModeTitle(mode)}</span>
    <span class="pill subtle">{difficultyLabel(difficulty)}</span>
  </div>
  <h1>{displayScore}<span class="of">/{ATC_ROUND_LENGTH}</span></h1>
  <p class="pct">{pct}% · {verdict()}</p>
  {#if isNewBest && score > 0}
    <span class="best-flag">New best</span>
  {/if}
</header>

<section class="recap">
  {#each results as r, i}
    <button class="row" class:bad={!r.correct} class:open={expanded === i} onclick={() => toggle(i)}>
      <span class="num">{i + 1}</span>
      <span class="kind">{atcModeTitle(r.question.mode)}</span>
      <div class="row-body">
        <span class="prompt">{r.question.prompt}</span>
        {#if r.correct}
          <span class="ans good">{r.question.answer}</span>
        {:else}
          <span class="ans">
            <span class="picked">{r.picked}</span>
            <span class="arrow">→</span>
            <span class="correct">{r.question.answer}</span>
          </span>
        {/if}
        {#if expanded === i}
          <p class="explain">{r.question.explanation}</p>
        {/if}
      </div>
      <span class="chev" aria-hidden="true">{expanded === i ? '▴' : '▾'}</span>
    </button>
  {/each}
</section>

<footer class="actions">
  <button class="primary" onclick={onAgain}>Play again</button>
  <button class="secondary" onclick={onHome}>Change mode</button>
</footer>

<style>
  .head {
    text-align: center;
    padding: 1rem 0 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  .pills {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    justify-content: center;
  }
  .pill {
    font-size: 0.6875rem;
    font-family: var(--font-main);
    letter-spacing: 0;
    text-transform: uppercase;
    color: var(--muted);
    background: var(--surface-2);
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
  }
  .pill.subtle {
    background: transparent;
    border: 1px solid var(--border);
  }
  .head h1 {
    font-family: var(--font-main);
    font-size: 4rem;
    font-weight: 600;
    letter-spacing: 0;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .of { color: var(--muted); font-weight: 400; }
  .pct {
    color: var(--muted);
    font-size: 0.9375rem;
  }
  .best-flag {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: var(--good);
    background: rgba(163, 206, 241, 0.42);
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
  }

  .recap {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.5rem;
  }
  .row {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 0.625rem;
    border-radius: 6px;
    text-align: left;
    transition: background 0.15s;
  }
  .row:hover,
  .row.open { background: var(--surface-2); }
  .num {
    color: var(--muted);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    min-width: 1.5ch;
    padding-top: 0.25rem;
  }
  .kind {
    font-size: 0.625rem;
    font-family: var(--font-main);
    text-transform: uppercase;
    color: var(--accent);
    background: rgba(163, 206, 241, 0.2);
    border: 1px solid rgba(96, 150, 186, 0.28);
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    white-space: nowrap;
  }
  .row-body {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .prompt {
    font-size: 0.9375rem;
    font-weight: 500;
    line-height: 1.3;
  }
  .ans {
    font-size: 0.8125rem;
    color: var(--muted);
    line-height: 1.35;
  }
  .ans.good,
  .row:not(.bad) .ans { color: var(--good); }
  .ans .picked {
    color: var(--bad);
    text-decoration: line-through;
  }
  .ans .arrow {
    color: var(--muted);
    margin: 0 0.4rem;
  }
  .ans .correct { color: var(--good); }
  .explain {
    margin-top: 0.35rem;
    font-size: 0.8125rem;
    color: var(--muted);
    line-height: 1.4;
  }
  .chev {
    color: var(--muted);
    font-size: 0.75rem;
    padding-top: 0.25rem;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    margin-top: auto;
    padding-top: 0.75rem;
  }
  .actions button {
    min-height: 52px;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 500;
    transition: transform 0.1s, background 0.15s, border-color 0.15s;
  }
  .actions button:active { transform: scale(0.98); }
  .primary { background: var(--accent); color: var(--bg); }
  .primary:hover { background: #a3cef1; }
  .secondary {
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
  }
  .secondary:hover {
    border-color: var(--panel-line);
    background: var(--surface-2);
  }

  @media (max-width: 560px) {
    .row {
      grid-template-columns: auto 1fr auto;
    }
    .kind {
      grid-column: 2;
      justify-self: start;
      margin-bottom: 0.1rem;
    }
    .row-body {
      grid-column: 2;
    }
    .chev {
      grid-column: 3;
      grid-row: 1 / span 2;
    }
  }
</style>
