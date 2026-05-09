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
  let showInfo = $state(false);
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
          aria-label="About this mode"
          aria-expanded={showInfo}
          onclick={() => (showInfo = !showInfo)}
        >i</button>
      
      </div>
      {#if showInfo}
        <p class="mode-info">Spot the developing conflict on the scope. Pick the pair on a converging course that needs intervention first.</p>
      {/if}

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
