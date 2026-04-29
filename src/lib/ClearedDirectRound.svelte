<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onDestroy, onMount } from 'svelte';
  import type { Difficulty } from './types';
  import {
    CLEARED_ROUND_LENGTH,
    buildClearedRound,
    type ClearedQuestion,
    type ClearedRoundResult,
  } from './cleared-direct';
  import type { Waypoint } from 'radarscope';
  import { RadarScope, AircraftBlip, RunwayMarker, Waypoint as WaypointMarker } from 'radarscope/svelte';
  import { difficultyLabel } from './engine';
  import * as Sound from './sound';

  interface Props {
    difficulty: Difficulty;
    onFinish: (results: ClearedRoundResult[]) => void;
    onQuit: () => void;
  }

  let { difficulty, onFinish, onQuit }: Props = $props();

  // svelte-ignore state_referenced_locally
  let questions: ClearedQuestion[] = $state(buildClearedRound(difficulty));
  let index = $state(0);
  let pickedId: string | null = $state(null);
  let committed = $state(false);
  let results: ClearedRoundResult[] = $state([]);
  let showInfo = $state(false);
  let advanceTimer: number | null = null;

  const current = $derived(questions[index]);
  const score = $derived(results.filter((r) => r.correct).length);
  const lastResult = $derived(results[results.length - 1]);

  function pickWaypoint(w: Waypoint) {
    if (committed) return;
    pickedId = w.id;
    const correct = w.id === current.targetWaypointId;
    committed = true;
    if (correct) { Sound.correct(); Sound.vibrate(15); }
    else { Sound.wrong(); Sound.vibrate(35); }
    const nextResults = [...results, { question: current, picked: w.label, correct }];
    results = nextResults;
    if (correct) {
      // Auto-advance on correct so the round stays brisk.
      advanceTimer = window.setTimeout(() => advance(nextResults), 1200);
    }
    // On wrong, wait for explicit Next press so the player can read the explanation.
  }

  function next() {
    if (advanceTimer !== null) { clearTimeout(advanceTimer); advanceTimer = null; }
    advance();
  }

  function advance(finalResults = results) {
    if (index + 1 >= questions.length) { onFinish(finalResults); return; }
    index += 1;
    pickedId = null;
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
      if (committed && !lastResult?.correct && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        next();
        return;
      }
      if (committed) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= current.scenario.waypoints.length) {
        pickWaypoint(current.scenario.waypoints[n - 1]);
      }
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
  <span class="meta">{score}/{CLEARED_ROUND_LENGTH}</span>
</header>

<section class="round">
  {#key index}
    <div class="card" in:fly={{ y: 16, duration: 220 }}>
      <div class="card-head">
        <span class="mode-pill">Cleared Direct</span>
        <span class="diff-pill">{difficultyLabel(difficulty)}</span>
        <button
          class="info-btn"
          aria-label="How this mode works"
          aria-expanded={showInfo}
          onclick={() => (showInfo = !showInfo)}
        >ⓘ</button>
      </div>

      {#if showInfo}
        <div class="mode-info">
          <p><strong>ATC clears you direct to a named fix.</strong> The prompt names a single waypoint — find that label on the chart and tap it.</p>
          <ul>
            <li>Each fix is a 5-letter ID (e.g. <em>BIRRA, OSKED, NOSAB</em>). Read the prompt's name carefully — names look alike on purpose.</li>
            <li>The aircraft icon shows your current position. The fix can be anywhere on the scope, not just on your existing route.</li>
            <li>Range rings (10/20 nm) help estimate distance and bearing.</li>
          </ul>
          <p class="tip">Tap a fix to commit. On a wrong pick, the explanation tells you which fix was correct and why — press <kbd>Enter</kbd> for the next round.</p>
        </div>
      {/if}

      <div class="prompt-block">
        <h2>{current.prompt}</h2>
        {#if !committed}
          <span class="sel">Tap the matching fix on the chart.</span>
        {/if}
      </div>

      <div class="scope-wrap">
        <RadarScope scenario={current.scenario} size={520} rangeRings={[10, 20]}>
          {#each current.scenario.allRunways as rw, i (i)}
            <RunwayMarker runway={rw} showFinal={false} />
          {/each}

          {#each current.scenario.waypoints as wp (wp.id)}
            {@const isTarget = wp.id === current.targetWaypointId}
            {@const isPicked = pickedId === wp.id}
            <WaypointMarker
              waypoint={wp}
              selected={(committed && isTarget) || (!committed && isPicked)}
              onclick={committed ? undefined : pickWaypoint}
            />
          {/each}

          {#each current.scenario.aircraft as ac (ac.id)}
            <AircraftBlip aircraft={ac} />
          {/each}
        </RadarScope>
      </div>

      {#if committed}
        <div class="feedback" class:good={lastResult?.correct} class:bad={!lastResult?.correct}>
          {#if !lastResult?.correct}
            <div class="fb-row"><span class="fb-label">You picked</span><span class="fb-val">{lastResult?.picked}</span></div>
          {/if}
          <div class="fb-row"><span class="fb-label">Correct</span><span class="fb-val">{current.answer}</span></div>
          <p class="explain">{current.explanation}</p>
          {#if !lastResult?.correct}
            <button class="next" onclick={next}>Next →</button>
          {/if}
        </div>
      {/if}
    </div>
  {/key}
  <div class="kb-legend" aria-hidden="true">
    {#if committed && !lastResult?.correct}
      <span><kbd>Enter</kbd> next</span>
    {:else}
      <span>tap a fix to commit</span>
    {/if}
    <span><kbd>Esc</kbd> quit</span>
  </div>
</section>

<style>
  .bar { width: 100%; display: flex; align-items: center; gap: 0.625rem; padding: 0 0.25rem; }
  .quit { width: 32px; height: 32px; border-radius: 4px; background: var(--surface); border: 1px solid var(--border); color: var(--muted); font-size: 0.9rem; line-height: 1; }
  .quit:hover { color: var(--bad); border-color: rgba(239, 68, 68, 0.55); }
  .dots { flex: 1; display: flex; gap: 4px; justify-content: center; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--surface-2); }
  .dot-now { background: var(--accent); }
  .dot-correct { background: var(--good); }
  .dot-wrong { background: var(--bad); }
  .meta { font-variant-numeric: tabular-nums; color: var(--muted); font-size: 0.875rem; min-width: 4ch; text-align: right; }
  .round { display: flex; flex-direction: column; gap: 0.625rem; padding: 0.5rem 0; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 0.875rem; display: flex; flex-direction: column; gap: 0.75rem; }
  .card-head { display: flex; gap: 0.4rem; align-items: center; }
  .mode-pill, .diff-pill { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.2rem 0.5rem; border-radius: 4px; background: var(--surface-2); color: var(--muted); }
  .mode-pill { background: var(--accent); color: var(--bg); font-weight: 600; }
  .info-btn {
    margin-left: auto;
    width: 26px; height: 26px;
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
    padding: 0.65rem 0.8rem;
    background: rgba(163, 206, 241, 0.35);
    border: 1px solid rgba(96, 150, 186, 0.28);
    border-radius: 6px;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--muted);
    display: flex; flex-direction: column; gap: 0.4rem;
  }
  .mode-info p { margin: 0; }
  .mode-info ul { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.25rem; }
  .mode-info strong { color: var(--text); font-weight: 600; }
  .mode-info em { color: var(--text); font-style: normal; font-family: var(--font-main); font-size: 0.78rem; }
  .mode-info .tip { font-size: 0.75rem; opacity: 0.85; }
  .mode-info kbd { padding: 0 0.3rem; border: 1px solid var(--border); border-radius: 3px; background: var(--surface); font-family: var(--font-main); font-size: 0.7rem; color: var(--text); }
  .prompt-block { display: flex; flex-direction: column; gap: 0.25rem; }
  .prompt-block h2 { font-size: 1.05rem; font-weight: 600; line-height: 1.3; }
  .sel { color: var(--muted); font-size: 0.8125rem; }
  .scope-wrap { display: flex; justify-content: center; background: #0c1116; border-radius: 8px; padding: 0.5rem; --scope-bg: #0c1116; }
  .feedback { background: var(--surface-2); border-left: 3px solid var(--muted); border-radius: 4px; padding: 0.6rem 0.75rem; display: flex; flex-direction: column; gap: 0.4rem; }
  .feedback.good { border-color: var(--good); }
  .feedback.bad { border-color: var(--bad); }
  .fb-row { display: flex; gap: 0.5rem; align-items: baseline; flex-wrap: wrap; }
  .fb-label { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
  .fb-val { font-size: 0.9rem; font-weight: 500; }
  .explain { font-size: 0.8125rem; color: var(--muted); line-height: 1.4; }
  .next {
    align-self: flex-end;
    background: var(--accent);
    color: var(--bg);
    border: 0;
    border-radius: 6px;
    padding: 0.45rem 1rem;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
  }
  .kb-legend { display: flex; gap: 0.875rem; justify-content: center; align-items: center; color: var(--muted); font-size: 0.6875rem; }
  .kb-legend kbd { padding: 0 0.3rem; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); font-family: var(--font-main); font-size: 0.6875rem; color: var(--text); }
</style>
