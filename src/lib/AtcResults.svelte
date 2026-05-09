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
  import type { SequenceRoundResult } from './sequencing';
  import type { InterceptStableResult } from './intercept-stable';
  import type { InterceptMinimumsResult } from './intercept-minimums';
  import type { InterceptFmaResult } from './intercept-fma';

  type RecapResult =
    | AtcRoundResult
    | RadarRoundResult
    | ClearedRoundResult
    | SequenceRoundResult
    | InterceptStableResult
    | InterceptMinimumsResult
    | InterceptFmaResult;
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
    font-family: var(--mono);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--label-dim);
    background: var(--panel-2);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    padding: 0.28rem 0.65rem;
    border-radius: 1px;
  }
  .pill.subtle {
    background: transparent;
    border: 1px solid var(--bezel-hi);
  }
  .head h1 {
    font-family: var(--mono);
    font-size: 4.2rem;
    font-weight: 700;
    color: var(--led-green);
    letter-spacing: 0.02em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .of { color: var(--label-dim); font-weight: 400; }
  .pct {
    font-family: var(--mono);
    color: var(--label-dim);
    font-size: 0.9rem;
  }
  .best-flag {
    margin-top: 0.3rem;
    font-family: var(--mono);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--led-amber);
    border: 1px solid var(--led-amber);
    background: rgba(251, 191, 36, 0.08);
    padding: 0.28rem 0.7rem;
    border-radius: 1px;
  }

  .recap {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 2px;
    padding: 0.5rem;
  }
  .row {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.55rem 0.6rem;
    background: var(--panel-2);
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
  }
  .row:hover { border-color: var(--led-cyan); }
  .row.open { border-color: var(--led-cyan); background: rgba(96, 216, 240, 0.04); }
  .num {
    color: var(--label-dim);
    font-family: var(--mono);
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
    min-width: 1.5ch;
    padding-top: 0.25rem;
  }
  .kind {
    font-family: var(--mono);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--led-cyan);
    background: rgba(96, 216, 240, 0.06);
    border: 1px solid var(--led-cyan);
    padding: 0.18rem 0.42rem;
    border-radius: 1px;
    white-space: nowrap;
  }
  .row-body {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .prompt {
    font-family: var(--sans);
    font-size: 0.92rem;
    font-weight: 700;
    color: var(--label);
    letter-spacing: -0.005em;
    line-height: 1.3;
  }
  .ans {
    font-family: var(--sans);
    font-size: 0.8rem;
    color: var(--label-dim);
    line-height: 1.35;
  }
  .ans.good,
  .row:not(.bad) .ans { color: var(--led-green); }
  .ans .picked {
    color: var(--led-red);
    text-decoration: line-through;
  }
  .ans .arrow {
    color: var(--label-dim);
    margin: 0 0.4rem;
  }
  .ans .correct { color: var(--led-green); }
  .explain {
    margin-top: 0.35rem;
    font-family: var(--sans);
    font-size: 0.8rem;
    color: var(--label-2);
    line-height: 1.45;
    white-space: pre-line;
  }
  .chev {
    color: var(--label-dim);
    font-size: 0.78rem;
    padding-top: 0.25rem;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    margin-top: auto;
    padding-top: 1rem;
  }
  .actions button {
    min-height: 48px;
    border-radius: 1px;
    font-family: var(--mono);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .primary {
    background: var(--panel);
    color: var(--led-cyan);
    border: 1px solid var(--led-cyan);
  }
  .primary:hover { color: #b0ecf6; border-color: #b0ecf6; background: rgba(96, 216, 240, 0.08); }
  .primary:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
  .secondary {
    background: var(--panel);
    color: var(--label-dim);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
  }
  .secondary:hover { color: var(--led-cyan); border-color: var(--led-cyan); }
  .secondary:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }

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
