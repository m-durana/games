<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onDestroy, onMount } from 'svelte';
  import type { Difficulty } from './types';
  import {
    RADAR_ROUND_LENGTH,
    buildConflictRound,
    type RadarQuestion,
    type RadarRoundResult,
  } from './atc-radar';
  import type { Aircraft } from 'radarscope';
  import { RadarScope, AircraftBlip, WindTag } from 'radarscope/svelte';
  import { difficultyLabel } from './engine';
  import { clearProgress, progressKey, recordProgress, sessionKey } from './progress';
  import * as Sound from './sound';
  import RoundBar from './RoundBar.svelte';

  interface Props {
    difficulty: Difficulty;
    /** Retained for parent dispatch parity; only 'conflict' is supported. */
    mode: 'conflict';
    onFinish: (results: RadarRoundResult[]) => void;
    onQuit: () => void;
  }

  let { difficulty, mode, onFinish, onQuit }: Props = $props();

  // svelte-ignore state_referenced_locally
  const SESSION_KEY = sessionKey('radar', difficulty, mode);
  // svelte-ignore state_referenced_locally
  const PKEY = progressKey('radar', difficulty, mode);

  interface SavedSession {
    v: 1;
    difficulty: Difficulty;
    mode: 'conflict';
    questions: RadarQuestion[];
    index: number;
    results: RadarRoundResult[];
  }
  function loadSession(): SavedSession | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as SavedSession;
      if (s.v !== 1 || s.difficulty !== difficulty || s.mode !== mode) return null;
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
    return {
      // svelte-ignore state_referenced_locally
      questions: buildConflictRound(difficulty),
      index: 0,
      results: [] as RadarRoundResult[],
    };
  })();

  let questions: RadarQuestion[] = $state(initial.questions);
  let index = $state(initial.index);
  let pickedIds: string[] = $state([]);
  let committed = $state(false);
  let results: RadarRoundResult[] = $state(initial.results);

  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    if (index === 0 && results.length === 0) return;
    const session: SavedSession = { v: 1, difficulty, mode, questions, index, results };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    recordProgress({
      key: PKEY,
      gameKind: 'radar',
      label: `Conflict Spot · ${difficulty}`,
      category: 'Radar',
      mode,
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

  const conflictHighlightIds = $derived.by(() => {
    if (!committed) return new Set<string>();
    return new Set(current.conflictPair);
  });

  function clickAircraft(a: Aircraft) {
    if (committed) return;
    // Toggle inclusion; cap at 2; auto-commit on second pick.
    const i = pickedIds.indexOf(a.id);
    if (i >= 0) {
      pickedIds = pickedIds.filter((x) => x !== a.id);
    } else if (pickedIds.length < 2) {
      pickedIds = [...pickedIds, a.id];
      if (pickedIds.length === 2) commitConflict();
    }
  }

  function commitConflict() {
    if (committed) return;
    const target = new Set(current.conflictPair);
    const correct = pickedIds.length === 2 && pickedIds.every((id) => target.has(id));
    finalize(correct, pickedToCallsignList());
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
    // Thinking mode - wait for explicit Next so the player can study the scope
    // and read the explanation, even when correct.
  }

  function next() {
    if (advanceTimer !== null) { clearTimeout(advanceTimer); advanceTimer = null; }
    advance();
  }

  function advance(finalResults = results) {
    if (index + 1 >= questions.length) {
      clearProgress(PKEY);
      onFinish(finalResults);
      return;
    }
    index += 1;
    pickedIds = [];
    committed = false;
  }

  const lastResult = $derived(results[results.length - 1]);

  function dotState(i: number): 'todo' | 'current' | 'correct' | 'wrong' {
    if (i < results.length) return results[i].correct ? 'correct' : 'wrong';
    if (i === index) return 'current';
    return 'todo';
  }
  const progressLeds = $derived(questions.map((_, i) => dotState(i)));

  function selectionLabel(): string {
    return `Pick the conflict pair · ${pickedIds.length}/2`;
  }

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
      if (n >= 1 && n <= current.scenario.aircraft.length) {
        clickAircraft(current.scenario.aircraft[n - 1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  onDestroy(() => {
    if (advanceTimer !== null) clearTimeout(advanceTimer);
  });
</script>

<RoundBar progress={progressLeds} {score} total={RADAR_ROUND_LENGTH} {onQuit} />

<section class="round">
  {#key index}
    <div class="card" in:fly={{ y: 16, duration: 220 }}>
      <div class="card-head">
        <span class="mode-pill">Conflict Spot</span>
        <span class="diff-pill">{difficultyLabel(difficulty)}</span>
        <button
          class="info-btn"
          aria-label="How this mode works"
          aria-expanded={showInfo}
          onclick={() => (showInfo = !showInfo)}
        >ⓘ</button>
      </div>

      <div class="right-col">
        <div class="game-q">
          <h2>{current.prompt}</h2>
          {#if !committed}
            <span class="sel">{selectionLabel()}</span>
          {/if}
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

      <div class="scope-wrap">
        <RadarScope scenario={current.scenario} size={1200}>
          {#each current.scenario.aircraft as ac (ac.id)}
            {@const sel = pickedIds.includes(ac.id)}
            {@const conf = conflictHighlightIds.has(ac.id)}
            <AircraftBlip
              aircraft={ac}
              selected={sel}
              conflict={conf}
              onclick={clickAircraft}
            />
            {@const vr = current.verticalRates?.[ac.id]}
            {#if vr}
              <text
                x={ac.pos.x - 0.6}
                y={ac.pos.y + 0.2}
                font-size="0.95"
                font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
                fill={vr > 0 ? '#7ddc8a' : '#f5b461'}
                text-anchor="end"
                paint-order="stroke"
                stroke="#0c1116"
                stroke-width="0.18"
                pointer-events="none"
              >{vr > 0 ? '↑' : '↓'}</text>
            {/if}
          {/each}
          {#if current.scenario.wind}
            <WindTag
              wind={current.scenario.wind}
              position={{ x: -(current.scenario.rangeNm ?? 30) + 2.5, y: -(current.scenario.rangeNm ?? 30) + 2.5 }}
            />
          {/if}
        </RadarScope>
      </div>
    </div>
  {/key}
  <div class="kb-legend" aria-hidden="true">
    {#if committed}
      <span><kbd>Enter</kbd> next</span>
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
    display: grid;
    gap: 0.75rem;
    grid-template-columns: 1fr;
    grid-template-areas: "head" "info" "scope" "right";
  }
  @media (min-width: 820px) {
    .card {
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
      grid-template-areas:
        "head head"
        "info info"
        "scope right";
      align-items: start;
    }
  }
  .card-head { grid-area: head; display: flex; gap: 0.4rem; align-items: center; }
  .mode-info { grid-area: info; }
  .scope-wrap { grid-area: scope; }
  .right-col { grid-area: right; display: flex; flex-direction: column; gap: 0.75rem; min-width: 0; }
  .mode-pill, .diff-pill {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    background: var(--surface-2);
    color: var(--muted);
  }
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
  .mode-info strong { color: var(--text); font-weight: 600; }
  .mode-info .tip { font-size: 0.75rem; opacity: 0.85; }
  .game-q h2 { font-size: 1.05rem; font-weight: 600; line-height: 1.3; margin: 0; }
  .sel { color: var(--muted); font-size: 0.8125rem; display: block; margin-top: 0.25rem; }
  .scope-wrap {
    display: flex; justify-content: center;
    background: #0c1116;
    border-radius: 8px;
    padding: 0.5rem;
    --scope-bg: #0c1116;
    min-width: 0;
  }
  .scope-wrap :global(svg.radarscope) {
    width: 100%;
    height: auto;
    max-width: 100%;
  }
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
