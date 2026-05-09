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
  import { RadarScope, AircraftBlip, Waypoint as WaypointMarker, WindTag } from 'radarscope/svelte';
  import { difficultyLabel } from './engine';
  import { clearProgress, progressKey, recordProgress, sessionKey } from './progress';
  import * as Sound from './sound';
  import RoundBar from './RoundBar.svelte';

  interface Props {
    difficulty: Difficulty;
    onFinish: (results: ClearedRoundResult[]) => void;
    onQuit: () => void;
  }

  let { difficulty, onFinish, onQuit }: Props = $props();

  // svelte-ignore state_referenced_locally
  const SESSION_KEY = sessionKey('cleared', difficulty);
  // svelte-ignore state_referenced_locally
  const PKEY = progressKey('cleared', difficulty);

  interface SavedSession {
    v: 1;
    difficulty: Difficulty;
    questions: ClearedQuestion[];
    index: number;
    results: ClearedRoundResult[];
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
    return { questions: buildClearedRound(difficulty), index: 0, results: [] as ClearedRoundResult[] };
  })();

  let questions: ClearedQuestion[] = $state(initial.questions);
  let showInfo = $state(false);
  let index = $state(initial.index);
  let pickedIndex: number | null = $state(null);
  let committed = $state(false);
  let results: ClearedRoundResult[] = $state(initial.results);

  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    if (index === 0 && results.length === 0) return;
    const session: SavedSession = { v: 1, difficulty, questions, index, results };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    recordProgress({
      key: PKEY,
      gameKind: 'cleared',
      label: `Cleared Direct · ${difficulty}`,
      category: 'ATC',
      difficulty,
      currentIndex: index,
      total: questions.length,
      savedAt: 0,
      sessionStorageKey: SESSION_KEY,
    });
  });
  let advanceTimer: number | null = null;

  const current = $derived(questions[index]);
  const score = $derived(results.filter((r) => r.correct).length);
  const lastResult = $derived(results[results.length - 1]);

  function fmt(h: number): string {
    return h.toString().padStart(3, '0');
  }

  function pickHeading(i: number) {
    if (committed) return;
    pickedIndex = i;
    const correct = i === current.correctIndex;
    committed = true;
    if (correct) { Sound.correct(); Sound.vibrate(15); }
    else { Sound.wrong(); Sound.vibrate(35); }
    const pickedHuman = `Heading ${fmt(current.options[i])}`;
    const nextResults = [...results, { question: current, picked: pickedHuman, correct }];
    results = nextResults;
    // Thinking mode - wait for explicit Next so the player can study the
    // bearing geometry, even when correct.
  }

  function next() {
    if (advanceTimer !== null) { clearTimeout(advanceTimer); advanceTimer = null; }
    advance();
  }

  function advance(finalResults = results) {
    if (index + 1 >= questions.length) { clearProgress(PKEY); onFinish(finalResults); return; }
    index += 1;
    pickedIndex = null;
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
      if (committed && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        next();
        return;
      }
      if (committed) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= current.options.length) pickHeading(n - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  onDestroy(() => {
    if (advanceTimer !== null) clearTimeout(advanceTimer);
  });
</script>

<RoundBar progress={progressLeds} {score} total={CLEARED_ROUND_LENGTH} {onQuit} />

<section class="round">
  {#key index}
    <div class="card" in:fly={{ y: 16, duration: 220 }}>
      <div class="card-head">
        <span class="mode-pill">Cleared Direct</span>
        <span class="diff-pill">{difficultyLabel(difficulty)}</span>
        <button
          class="info-btn"
          aria-label="About this mode"
          aria-expanded={showInfo}
          onclick={() => (showInfo = !showInfo)}
        >i</button>
      
      </div>
      {#if showInfo}
        <p class="mode-info">ATC has cleared you direct to a fix. Pick the heading that intercepts the assigned course or proceeds direct from your current position.</p>
      {/if}

      <div class="scope-wrap">
        <RadarScope scenario={current.scenario} size={1200} rangeRings={[10, 20]}>
          {#each current.scenario.waypoints as wp (wp.id)}
            <WaypointMarker
              waypoint={wp}
              selected={wp.id === current.scenario.targetWaypointId}
            />
          {/each}
          {#each current.scenario.aircraft as ac (ac.id)}
            <AircraftBlip aircraft={ac} />
          {/each}
          {#if current.scenario.wind}
            <WindTag
              wind={current.scenario.wind}
              position={{ x: -(current.scenario.rangeNm ?? 25) + 2.5, y: -(current.scenario.rangeNm ?? 25) + 2.5 }}
            />
          {/if}
        </RadarScope>
      </div>

      <div class="right-col">
        {#if current.atcCall}
          <div class="atc-call">
            <img class="atc-icon" src="https://unpkg.com/lucide-static@0.469.0/icons/tower-control.svg" alt="" aria-hidden="true" />
            <div class="atc-bubble">
              <span class="bubble-tag">ATC</span>
              {current.atcCall}
            </div>
          </div>
        {/if}
        {#if current.instruments}
          <div class="instruments">
            <img class="inst-icon" src="https://unpkg.com/lucide-static@0.469.0/icons/gauge.svg" alt="" aria-hidden="true" />
            <span>{current.instruments}</span>
          </div>
        {/if}
        <div class="game-q"><h2>{current.prompt}</h2></div>

        <div class="options" class:disabled={committed}>
          {#each current.options as h, i}
            {@const isCorrect = i === current.correctIndex}
            {@const wasPicked = pickedIndex === i}
            <button
              class="option"
              class:correct={committed && isCorrect}
              class:wrong={committed && wasPicked && !isCorrect}
              class:reveal={committed && !wasPicked && !isCorrect}
              disabled={committed}
              onclick={() => pickHeading(i)}
            >
              <span class="key" aria-hidden="true">{i + 1}</span>
              <span class="opt-text">Heading {fmt(h)}</span>
            </button>
          {/each}
        </div>

        {#if committed}
          <div class="feedback" class:good={lastResult?.correct} class:bad={!lastResult?.correct}>
            {#if !lastResult?.correct}
              <div class="fb-row"><span class="fb-label">You picked</span><span class="fb-val">{lastResult?.picked}</span></div>
            {/if}
            <div class="fb-row"><span class="fb-label">Correct</span><span class="fb-val">{current.answer}</span></div>
            <p class="explain">{current.explanation}</p>
            <button class="next" onclick={next}>Next →</button>
          </div>
        {/if}
      </div>
    </div>
  {/key}
  <div class="kb-legend" aria-hidden="true">
    {#if committed}
      <span><kbd>Enter</kbd> next</span>
    {:else}
      <span><kbd>1</kbd>-<kbd>{current?.options.length ?? 4}</kbd> pick heading</span>
    {/if}
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

  .pfd-wrap, .scope-wrap {
    background: var(--mfd-bg);
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
    padding: 0.5rem;
    overflow: hidden;
    min-width: 0;
  }
  .scope-wrap :global(svg) { max-width: 100%; height: auto; display: block; }

  .right-col { display: flex; flex-direction: column; gap: 0.85rem; }

  .atc-call { display: grid; grid-template-columns: 56px 1fr; gap: 1.3rem; align-items: stretch; }
  .atc-icon { display: block; width: auto !important; height: 100% !important; max-height: 100%; padding: 0.2rem 0.3rem 0.2rem 0; filter: invert(70%) sepia(60%) saturate(390%) hue-rotate(75deg) brightness(95%); }
  .atc-bubble {
    position: relative;
    background: var(--mfd-bg);
    border: 1px solid var(--bezel-lo);
    border-radius: 2px;
    padding: 0.85rem 1rem 0.95rem;
    font-family: var(--mono); font-weight: 700; font-size: 0.95rem; color: var(--mfd-text); letter-spacing: 0.05em; line-height: 1.5; text-transform: uppercase;
  }
  .atc-bubble::before { content: ""; position: absolute; left: -7px; top: 18px; width: 0; height: 0; border-top: 7px solid transparent; border-bottom: 7px solid transparent; border-right: 7px solid var(--bezel-lo); }
  .atc-bubble::after { content: ""; position: absolute; left: -6px; top: 19px; width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-right: 6px solid var(--mfd-bg); }
  .bubble-tag { font-family: var(--mono); font-size: 0.6rem; letter-spacing: 0.18em; color: var(--mfd-dim); text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 0.4rem; }

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

  .instruments {
    display: flex; align-items: flex-start; gap: 0.55rem;
    padding: 0.55rem 0.7rem;
    background: var(--panel-2);
    border: 1px solid var(--bezel-lo);
    border-left: 2px solid var(--led-cyan);
    border-radius: 1px;
    font-family: var(--sans); font-size: 0.82rem;
    color: var(--label-2); line-height: 1.45;
  }
  .inst-icon {
    width: 16px; height: 16px; flex-shrink: 0; margin-top: 2px;
    filter: invert(78%) sepia(60%) saturate(390%) hue-rotate(160deg) brightness(95%);
  }

  .game-q h2 {
    font-family: var(--sans); font-size: 1.0rem; font-weight: 700;
    color: var(--label); line-height: 1.35;
    letter-spacing: -0.005em;
  }
  .game-q .sel {
    font-family: var(--mono); font-size: 0.62rem;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--label-dim); display: block; margin-top: 0.35rem;
  }

  .tap-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.32rem; }
  .tap-row {
    display: grid; grid-template-columns: 2rem 1fr auto; gap: 0.5rem;
    padding: 0.42rem 0.6rem;
    background: var(--panel-2);
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
    font-family: var(--mono); font-size: 0.78rem;
    align-items: baseline;
  }
  .tap-row.tapped { border-color: var(--led-cyan); background: rgba(96, 216, 240, 0.08); }
  .tap-slot { font-weight: 700; color: var(--led-cyan); text-align: right; font-variant-numeric: tabular-nums; }
  .tap-row:not(.tapped) .tap-slot { color: var(--label-dim); }
  .tap-cs { color: var(--label); font-weight: 700; letter-spacing: 0.05em; }
  .tap-row:not(.tapped) .tap-cs { color: var(--label-dim); font-weight: 400; }
  .wake-tag {
    font-family: var(--mono); font-size: 0.62rem; font-weight: 700;
    padding: 0.05rem 0.32rem; border-radius: 1px;
    letter-spacing: 0.06em;
  }
  .wake-tag.wake-J { color: var(--led-amber); border: 1px solid var(--led-amber); }
  .wake-tag.wake-H { color: var(--led-green); border: 1px solid var(--led-green); }
  .wake-tag.wake-L { color: var(--led-red); border: 1px solid var(--led-red); }
  .wake-tag.wake-M { color: var(--led-cyan); border: 1px solid var(--led-cyan); }

  .reset {
    align-self: flex-start;
    font-family: var(--mono); font-size: 0.62rem; font-weight: 700;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--label-dim);
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 1px;
    padding: 0.4rem 0.7rem;
    cursor: pointer;
  }
  .reset:hover { color: var(--led-cyan); border-color: var(--led-cyan); }
  .reset:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }

  .fb-row { display: flex; gap: 0.5rem 0.65rem; align-items: baseline; flex-wrap: wrap; font-family: var(--sans); font-size: 0.82rem; }
  .fb-label { font-family: var(--mono); font-size: 0.6rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--label-dim); font-weight: 700; }
  .fb-val { color: var(--label); font-weight: 700; }

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
