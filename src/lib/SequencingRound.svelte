<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onMount } from 'svelte';
  import type { Difficulty } from './types';
  import {
    SEQUENCE_ROUND_LENGTH,
    buildSequenceRound,
    type SequenceQuestion,
    type SequenceRoundResult,
  } from './sequencing';
  import { RadarScope, AircraftBlip } from 'radarscope/svelte';
  import { difficultyLabel } from './engine';
  import { clearProgress, progressKey, recordProgress, sessionKey } from './progress';
  import * as Sound from './sound';

  interface Props {
    difficulty: Difficulty;
    onFinish: (results: SequenceRoundResult[]) => void;
    onQuit: () => void;
  }

  let { difficulty, onFinish, onQuit }: Props = $props();

  // svelte-ignore state_referenced_locally
  const SESSION_KEY = sessionKey('sequence', difficulty);
  // svelte-ignore state_referenced_locally
  const PKEY = progressKey('sequence', difficulty);

  interface SavedSession {
    v: 2;
    difficulty: Difficulty;
    questions: SequenceQuestion[];
    index: number;
    results: SequenceRoundResult[];
  }
  function loadSession(): SavedSession | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as SavedSession;
      if (s.v !== 2 || s.difficulty !== difficulty) return null;
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
    return { questions: buildSequenceRound(difficulty), index: 0, results: [] as SequenceRoundResult[] };
  })();

  let questions: SequenceQuestion[] = $state(initial.questions);
  let index = $state(initial.index);
  /** Aircraft IDs the player has tapped, in tap order. */
  let order: string[] = $state([]);
  let committed = $state(false);
  let results: SequenceRoundResult[] = $state(initial.results);

  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    if (index === 0 && results.length === 0 && order.length === 0) return;
    const session: SavedSession = { v: 2, difficulty, questions, index, results };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    recordProgress({
      key: PKEY,
      gameKind: 'sequence',
      label: `Sequencing · ${difficulty}`,
      category: 'Radar',
      difficulty,
      currentIndex: index,
      total: questions.length,
      savedAt: 0,
      sessionStorageKey: SESSION_KEY,
    });
  });
  let showInfo = $state(false);

  const current = $derived(questions[index]);
  const score = $derived(results.filter((r) => r.correct).length);
  const lastResult = $derived(results[results.length - 1]);
  const total = $derived(current?.scenario.aircraft.length ?? 0);

  function tap(id: string) {
    if (committed) return;
    if (order.includes(id)) return;
    const next = [...order, id];
    order = next;
    if (next.length === total) commit(next);
  }

  function commit(finalOrder: string[]) {
    committed = true;
    const correct = finalOrder.length === current.correctOrder.length
      && finalOrder.every((id, i) => id === current.correctOrder[i]);
    if (correct) { Sound.correct(); Sound.vibrate(15); }
    else { Sound.wrong(); Sound.vibrate(35); }
    const csById = Object.fromEntries(current.scenario.aircraft.map((a) => [a.id, a.callsign]));
    const pickedStr = finalOrder.map((id) => csById[id]).join(' → ');
    results = [...results, { question: current, picked: pickedStr, correct }];
  }

  function reset() {
    if (committed) return;
    order = [];
  }

  function next() { advance(); }

  function advance(finalResults = results) {
    if (index + 1 >= questions.length) { clearProgress(PKEY); onFinish(finalResults); return; }
    index += 1;
    order = [];
    committed = false;
  }

  function dotState(i: number): 'todo' | 'now' | 'correct' | 'wrong' {
    if (i < results.length) return results[i].correct ? 'correct' : 'wrong';
    if (i === index) return 'now';
    return 'todo';
  }

  function tapBadge(id: string): number | null {
    const i = order.indexOf(id);
    if (i < 0) return null;
    return i + 1;
  }

  function isCorrectAtCurrent(id: string): boolean {
    if (!current.showAnswerHint) return false;
    const slot = order.length;
    return current.correctOrder[slot] === id;
  }

  function correctSlotFor(id: string): number {
    return current.correctOrder.indexOf(id);
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
        const ac = current.scenario.aircraft[n - 1];
        tap(ac.id);
      }
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
  <span class="meta">{score}/{SEQUENCE_ROUND_LENGTH}</span>
</header>

<section class="round">
  {#key index}
    <div class="card" in:fly={{ y: 16, duration: 220 }}>
      <div class="card-head">
        <span class="mode-pill">Sequencing</span>
        <span class="diff-pill">{difficultyLabel(difficulty)}</span>
        <button class="info-btn" aria-label="How this mode works" aria-expanded={showInfo} onclick={() => (showInfo = !showInfo)}>ⓘ</button>
      </div>

      {#if showInfo}
        <div class="mode-info">
          <p><strong>You're the approach controller.</strong> Multiple aircraft are inbound to the same runway from different bearings. Tap the blips on the scope in the order they should land.</p>
          <p>Read the speed vectors and bearings off the scope - whichever blip closes the threshold first lands first. There are no strip numbers; the scope is the only data source.</p>
          <p class="tip">Tip: use <strong>V</strong> at the bottom-left of the scope to lengthen the speed vectors. Easy starts at 2 min, Hard starts off.</p>
        </div>
      {/if}

      <div class="right-col">
        {#if current.instruments}
          <div class="instruments">
            <img class="inst-icon" src="https://unpkg.com/lucide-static@0.469.0/icons/gauge.svg" alt="" aria-hidden="true" />
            <span>{current.instruments}</span>
          </div>
        {/if}

        <div class="game-q">
          <h2>{current.prompt}</h2>
        </div>

        <ol class="tap-list">
          {#each current.scenario.aircraft as ac, i (ac.id)}
            {@const tapIdx = order.indexOf(ac.id)}
            {@const tapped = tapIdx >= 0}
            <li class="tap-row" class:tapped>
              <span class="tap-slot">{tapped ? `${tapIdx + 1}.` : '·'}</span>
              <span class="tap-cs">{tapped ? ac.callsign : `(${i + 1})`}</span>
            </li>
          {/each}
        </ol>

        {#if !committed && order.length > 0}
          <button class="reset" onclick={reset}>Reset taps</button>
        {/if}

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
        <RadarScope scenario={current.scenario} size={1200} vectorMin={current.defaultVectorMin}>
          {#each current.scenario.aircraft as ac (ac.id)}
            {@const badge = tapBadge(ac.id)}
            {@const slot = correctSlotFor(ac.id)}
            {@const hinted = !committed && isCorrectAtCurrent(ac.id)}
            {@const wasCorrect = committed && order[slot] === ac.id}
            <AircraftBlip
              aircraft={ac}
              selected={badge !== null || hinted}
              conflict={committed && !wasCorrect}
              onclick={() => tap(ac.id)}
            />
          {/each}
        </RadarScope>
      </div>
    </div>
  {/key}
  <div class="kb-legend" aria-hidden="true">
    {#if committed}
      <span><kbd>Enter</kbd> next</span>
    {:else}
      <span>tap blips in landing order</span>
      <span><kbd>1</kbd>-<kbd>{current?.scenario.aircraft.length ?? 4}</kbd> tap by index</span>
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
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 0.875rem; display: grid; gap: 0.75rem; grid-template-columns: 1fr; grid-template-areas: "head" "info" "scope" "right"; }
  @media (min-width: 820px) {
    .card { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); grid-template-areas: "head head" "info info" "scope right"; align-items: start; }
  }
  .card-head { grid-area: head; display: flex; gap: 0.4rem; align-items: center; }
  .mode-info { grid-area: info; }
  .scope-wrap { grid-area: scope; }
  .right-col { grid-area: right; display: flex; flex-direction: column; gap: 0.75rem; min-width: 0; }
  .mode-pill, .diff-pill { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.2rem 0.5rem; border-radius: 4px; background: var(--surface-2); color: var(--muted); }
  .mode-pill { background: var(--accent); color: var(--bg); font-weight: 600; }
  .info-btn { margin-left: auto; width: 26px; height: 26px; border-radius: 4px; border: 1px solid var(--border); background: var(--surface-2); color: var(--muted); font-size: 0.85rem; line-height: 1; }
  .info-btn:hover { color: var(--accent); border-color: var(--panel-line); }
  .info-btn[aria-expanded="true"] { background: rgba(163, 206, 241, 0.45); border-color: rgba(96, 150, 186, 0.65); color: var(--accent); }
  .mode-info { padding: 0.65rem 0.8rem; background: rgba(163, 206, 241, 0.35); border: 1px solid rgba(96, 150, 186, 0.28); border-radius: 6px; font-size: 0.8125rem; line-height: 1.5; color: var(--muted); display: flex; flex-direction: column; gap: 0.4rem; }
  .mode-info p { margin: 0; }
  .mode-info strong { color: var(--text); font-weight: 600; }
  .mode-info .tip { font-size: 0.75rem; opacity: 0.85; }
  .instruments { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.55rem 0.7rem; background: var(--surface-2); border-left: 3px solid var(--info); border-radius: 4px; font-size: 0.8125rem; color: var(--muted); line-height: 1.4; }
  .inst-icon { width: 18px; height: 18px; flex-shrink: 0; margin-top: 1px; filter: invert(78%) sepia(29%) saturate(787%) hue-rotate(174deg) brightness(100%) contrast(90%); }
  .game-q h2 { font-size: 1.05rem; font-weight: 600; line-height: 1.3; margin: 0; }
  .scope-wrap { display: flex; justify-content: center; background: #0c1116; border-radius: 8px; padding: 0.5rem; --scope-bg: #0c1116; min-width: 0; }
  .scope-wrap :global(svg.radarscope) { width: 100%; height: auto; max-width: 100%; }
  /* Tap list shows order; the scope blip uses selected/conflict colors. */
  .tap-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
  .tap-row { display: grid; grid-template-columns: 2.2rem 1fr; gap: 0.5rem; padding: 0.4rem 0.6rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 4px; font-size: 0.8125rem; align-items: baseline; }
  .tap-row.tapped { background: rgba(163, 206, 241, 0.18); border-color: var(--accent); }
  .tap-slot { font-family: var(--font-main); font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; text-align: right; }
  .tap-row:not(.tapped) .tap-slot { color: var(--muted); }
  .tap-cs { color: var(--text); font-weight: 500; }
  .tap-row:not(.tapped) .tap-cs { color: var(--muted); font-weight: 400; }
  .reset { align-self: flex-start; background: var(--surface); border: 1px solid var(--border); color: var(--muted); border-radius: 4px; padding: 0.3rem 0.7rem; font-size: 0.75rem; cursor: pointer; }
  .reset:hover { color: var(--text); border-color: var(--panel-line); }
  .feedback { background: var(--surface-2); border-left: 3px solid var(--muted); border-radius: 4px; padding: 0.6rem 0.75rem; display: flex; flex-direction: column; gap: 0.3rem; }
  .feedback.good { border-color: var(--good); }
  .feedback.bad { border-color: var(--bad); }
  .fb-row { display: flex; gap: 0.5rem; align-items: baseline; flex-wrap: wrap; }
  .fb-label { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
  .fb-val { font-size: 0.9rem; font-weight: 500; }
  .explain { font-size: 0.8125rem; color: var(--muted); line-height: 1.4; }
  .next { align-self: flex-end; background: var(--accent); color: var(--bg); border: 0; border-radius: 6px; padding: 0.45rem 1rem; font-weight: 600; font-size: 0.875rem; cursor: pointer; }
  .kb-legend { display: flex; gap: 0.875rem; justify-content: center; align-items: center; color: var(--muted); font-size: 0.6875rem; flex-wrap: wrap; }
  .kb-legend kbd { padding: 0 0.3rem; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); font-family: var(--font-main); font-size: 0.6875rem; color: var(--text); }
</style>
