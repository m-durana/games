<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onDestroy, onMount } from 'svelte';
  import type { Difficulty } from './types';
  import {
    RADAR_ROUND_LENGTH,
    buildRadarRound,
    type RadarQuestion,
    type RadarRoundResult,
  } from './atc-radar';
  import type { Aircraft } from 'radarscope';
  import { RadarScope, AircraftBlip, RunwayMarker, WindTag } from 'radarscope/svelte';
  import { difficultyLabel } from './engine';
  import * as Sound from './sound';

  interface Props {
    difficulty: Difficulty;
    onFinish: (results: RadarRoundResult[]) => void;
    onQuit: () => void;
  }

  let { difficulty, onFinish, onQuit }: Props = $props();

  // svelte-ignore state_referenced_locally
  let questions: RadarQuestion[] = $state(buildRadarRound(difficulty));
  let index = $state(0);
  let pickedIds: string[] = $state([]);
  let pickedOption: string | null = $state(null);
  let committed = $state(false);
  let results: RadarRoundResult[] = $state([]);
  let advanceTimer: number | null = null;

  const current = $derived(questions[index]);
  const score = $derived(results.filter((r) => r.correct).length);

  const conflictHighlightIds = $derived.by(() => {
    if (!committed || current.kind !== 'conflict') return new Set<string>();
    return new Set(current.conflictPair);
  });

  function clickAircraft(a: Aircraft) {
    if (committed) return;
    if (current.kind === 'direct') return; // direct uses buttons, not clicks
    if (current.kind === 'conflict') {
      // Toggle inclusion; cap at 2.
      const i = pickedIds.indexOf(a.id);
      if (i >= 0) {
        pickedIds = pickedIds.filter((x) => x !== a.id);
      } else if (pickedIds.length < 2) {
        pickedIds = [...pickedIds, a.id];
        if (pickedIds.length === 2) commitConflict();
      }
    } else if (current.kind === 'sequence') {
      // Ordered list; clicking again removes from end.
      const i = pickedIds.indexOf(a.id);
      if (i === pickedIds.length - 1) {
        pickedIds = pickedIds.slice(0, -1);
      } else if (i === -1) {
        pickedIds = [...pickedIds, a.id];
        if (pickedIds.length === current.scenario.aircraft.length) commitSequence();
      }
    }
  }

  function commitConflict() {
    if (current.kind !== 'conflict' || committed) return;
    const target = new Set(current.conflictPair);
    const correct = pickedIds.length === 2 && pickedIds.every((id) => target.has(id));
    finalize(correct, pickedToCallsignList());
  }

  function commitSequence() {
    if (current.kind !== 'sequence' || committed) return;
    const correct =
      pickedIds.length === current.correctOrder.length &&
      pickedIds.every((id, i) => id === current.correctOrder[i]);
    finalize(correct, pickedToCallsignList());
  }

  function pickOption(opt: string, i: number) {
    if (committed || current.kind !== 'direct') return;
    pickedOption = opt;
    const correct = i === current.correctIndex;
    finalize(correct, opt);
  }

  function pickedToCallsignList(): string {
    const map = new Map(current.scenario.aircraft.map((a) => [a.id, a.callsign]));
    return pickedIds.map((id) => map.get(id) ?? id).join(' → ');
  }

  function finalize(correct: boolean, pickedHuman: string) {
    committed = true;
    if (correct) { Sound.correct(); Sound.vibrate(15); }
    else { Sound.wrong(); Sound.vibrate(35); }
    const nextResults = [...results, { question: current, picked: pickedHuman, correct }];
    results = nextResults;
    advanceTimer = window.setTimeout(() => advance(nextResults), 1800);
  }

  function advance(finalResults = results) {
    if (index + 1 >= questions.length) {
      onFinish(finalResults);
      return;
    }
    index += 1;
    pickedIds = [];
    pickedOption = null;
    committed = false;
  }

  function dotState(i: number): 'todo' | 'now' | 'correct' | 'wrong' {
    if (i < results.length) return results[i].correct ? 'correct' : 'wrong';
    if (i === index) return 'now';
    return 'todo';
  }

  function selectionLabel(): string {
    if (current.kind === 'conflict') return `Pick the conflict pair · ${pickedIds.length}/2`;
    if (current.kind === 'sequence') return `Tap in landing order · ${pickedIds.length}/${current.scenario.aircraft.length}`;
    return 'Pick the right call';
  }

  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onQuit(); return; }
      if (committed) return;
      if (current.kind === 'direct') {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= current.options.length) pickOption(current.options[n - 1], n - 1);
      } else {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= current.scenario.aircraft.length) {
          clickAircraft(current.scenario.aircraft[n - 1]);
        }
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
  <span class="meta">{score}/{RADAR_ROUND_LENGTH}</span>
</header>

<section class="round">
  {#key index}
    <div class="card" in:fly={{ y: 16, duration: 220 }}>
      <div class="card-head">
        <span class="mode-pill">ATC Radar</span>
        <span class="diff-pill">{difficultyLabel(difficulty)}</span>
        <span class="kind-pill">{current.kind}</span>
      </div>

      <div class="prompt-block">
        <h2>{current.prompt}</h2>
        {#if !committed}
          <span class="sel">{selectionLabel()}</span>
        {/if}
      </div>

      <div class="scope-wrap">
        <RadarScope scenario={current.scenario} size={520}>
          {#if current.scenario.runway}
            <RunwayMarker runway={current.scenario.runway} showFinal />
          {/if}
          {#each current.scenario.aircraft as ac (ac.id)}
            {@const sel = pickedIds.includes(ac.id)}
            {@const conf = conflictHighlightIds.has(ac.id)}
            <AircraftBlip
              aircraft={ac}
              selected={sel}
              conflict={conf}
              onclick={current.kind === 'direct' ? undefined : clickAircraft}
            />
          {/each}
          {#if current.scenario.wind}
            <WindTag
              wind={current.scenario.wind}
              position={{ x: -(current.scenario.rangeNm ?? 30) + 2.5, y: -(current.scenario.rangeNm ?? 30) + 2.5 }}
            />
          {/if}
        </RadarScope>
      </div>

      {#if current.kind === 'direct'}
        <div class="options" class:disabled={committed}>
          {#each current.options as opt, i}
            {@const isCorrect = i === current.correctIndex}
            {@const wasPicked = pickedOption === opt}
            <button
              class="option"
              class:correct={committed && isCorrect}
              class:wrong={committed && wasPicked && !isCorrect}
              class:reveal={committed && !wasPicked && !isCorrect}
              disabled={committed}
              onclick={() => pickOption(opt, i)}
            >
              <span class="key" aria-hidden="true">{i + 1}</span>
              <span class="opt-text">{opt}</span>
            </button>
          {/each}
        </div>
      {/if}

      {#if committed}
        <div class="feedback" class:good={results[results.length - 1]?.correct} class:bad={!results[results.length - 1]?.correct}>
          <div class="fb-row"><span class="fb-label">Correct</span><span class="fb-val">{current.answer}</span></div>
          <p class="explain">{current.explanation}</p>
        </div>
      {/if}
    </div>
  {/key}
  <div class="kb-legend" aria-hidden="true">
    {#if current?.kind === 'direct'}
      <span><kbd>1</kbd>-<kbd>3</kbd> pick</span>
    {:else}
      <span><kbd>1</kbd>-<kbd>{current?.scenario.aircraft.length ?? 4}</kbd> tap aircraft</span>
    {/if}
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
    width: 32px; height: 32px;
    border-radius: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--muted);
    font-size: 0.9rem;
    line-height: 1;
  }
  .quit:hover { color: var(--bad); border-color: rgba(239, 68, 68, 0.55); }
  .dots {
    flex: 1;
    display: flex; gap: 4px; justify-content: center;
  }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--surface-2); }
  .dot-now { background: var(--accent); }
  .dot-correct { background: var(--good); }
  .dot-wrong { background: var(--bad); }
  .meta {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    font-size: 0.875rem;
    min-width: 4ch;
    text-align: right;
  }
  .round { display: flex; flex-direction: column; gap: 0.625rem; padding: 0.5rem 0; }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.875rem;
    display: flex; flex-direction: column; gap: 0.75rem;
  }
  .card-head { display: flex; gap: 0.4rem; align-items: center; }
  .mode-pill, .diff-pill, .kind-pill {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    background: var(--surface-2);
    color: var(--muted);
  }
  .mode-pill { background: var(--accent); color: var(--bg); font-weight: 600; }
  .prompt-block { display: flex; flex-direction: column; gap: 0.25rem; }
  .prompt-block h2 { font-size: 1.05rem; font-weight: 600; line-height: 1.3; }
  .sel { color: var(--muted); font-size: 0.8125rem; }
  .scope-wrap {
    display: flex; justify-content: center;
    background: #0c1116;
    border-radius: 8px;
    padding: 0.5rem;
    --scope-bg: #0c1116;
  }
  .options { display: grid; grid-template-columns: 1fr; gap: 0.4rem; }
  .options.disabled { pointer-events: none; }
  .option {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 6px;
    padding: 0.7rem 0.875rem;
    font-size: 0.9375rem;
    text-align: left;
    display: flex; align-items: center; gap: 0.625rem;
    transition: background 0.12s, border-color 0.12s;
  }
  .option:hover { border-color: var(--panel-line); }
  .option .key {
    width: 22px; height: 22px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 0.75rem; color: var(--muted);
    flex-shrink: 0;
  }
  .option.correct { background: rgba(34, 197, 94, 0.18); border-color: var(--good); }
  .option.wrong { background: rgba(239, 68, 68, 0.18); border-color: var(--bad); }
  .option.reveal { opacity: 0.55; }
  .feedback {
    background: var(--surface-2);
    border-left: 3px solid var(--muted);
    border-radius: 4px;
    padding: 0.6rem 0.75rem;
    display: flex; flex-direction: column; gap: 0.3rem;
  }
  .feedback.good { border-color: var(--good); }
  .feedback.bad { border-color: var(--bad); }
  .fb-row { display: flex; gap: 0.5rem; align-items: baseline; flex-wrap: wrap; }
  .fb-label { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
  .fb-val { font-size: 0.9rem; font-weight: 500; }
  .explain { font-size: 0.8125rem; color: var(--muted); line-height: 1.4; }
  .kb-legend {
    display: flex; gap: 0.875rem; justify-content: center; align-items: center;
    color: var(--muted); font-size: 0.6875rem;
  }
  .kb-legend kbd {
    padding: 0 0.3rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface);
    font-family: var(--font-main);
    font-size: 0.6875rem;
    color: var(--text);
  }
</style>
