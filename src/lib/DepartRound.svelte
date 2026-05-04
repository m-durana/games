<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onMount } from 'svelte';
  import type { Difficulty } from './types';
  import {
    DEPART_ROUND_LENGTH,
    buildDepartRound,
    type DepartQuestion,
    type DepartRoundResult,
  } from './depart';
  import { RadarScope, AircraftBlip } from 'radarscope/svelte';
  import { difficultyLabel } from './engine';
  import { clearProgress, progressKey, recordProgress, sessionKey } from './progress';
  import * as Sound from './sound';

  interface Props {
    difficulty: Difficulty;
    onFinish: (results: DepartRoundResult[]) => void;
    onQuit: () => void;
  }

  let { difficulty, onFinish, onQuit }: Props = $props();

  // svelte-ignore state_referenced_locally
  const SESSION_KEY = sessionKey('depart', difficulty);
  // svelte-ignore state_referenced_locally
  const PKEY = progressKey('depart', difficulty);

  interface SavedSession {
    v: 1;
    difficulty: Difficulty;
    questions: DepartQuestion[];
    index: number;
    results: DepartRoundResult[];
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
    return { questions: buildDepartRound(difficulty), index: 0, results: [] as DepartRoundResult[] };
  })();

  let questions: DepartQuestion[] = $state(initial.questions);
  let index = $state(initial.index);
  let pickedIndex: number | null = $state(null);
  let committed = $state(false);
  let results: DepartRoundResult[] = $state(initial.results);

  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    if (index === 0 && results.length === 0) return;
    const session: SavedSession = { v: 1, difficulty, questions, index, results };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    recordProgress({
      key: PKEY,
      gameKind: 'depart',
      label: `Departure Release · ${difficulty}`,
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

  function pickOption(i: number) {
    if (committed) return;
    pickedIndex = i;
    const correct = i === current.correctIndex;
    committed = true;
    if (correct) { Sound.correct(); Sound.vibrate(15); }
    else { Sound.wrong(); Sound.vibrate(35); }
    const picked = current.options[i].label;
    results = [...results, { question: current, picked, correct }];
  }

  function next() { advance(); }

  function advance(finalResults = results) {
    if (index + 1 >= questions.length) { clearProgress(PKEY); onFinish(finalResults); return; }
    index += 1;
    pickedIndex = null;
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
      if (committed && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        next();
        return;
      }
      if (committed) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= current.options.length) pickOption(n - 1);
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
  <span class="meta">{score}/{DEPART_ROUND_LENGTH}</span>
</header>

<section class="round">
  {#key index}
    <div class="card" in:fly={{ y: 16, duration: 220 }}>
      <div class="card-head">
        <span class="mode-pill">Departure Release</span>
        <span class="diff-pill">{difficultyLabel(difficulty)}</span>
        <button class="info-btn" aria-label="How this mode works" aria-expanded={showInfo} onclick={() => (showInfo = !showInfo)}>ⓘ</button>
      </div>

      {#if showInfo}
        <div class="mode-info">
          <p><strong>You're tower.</strong> Two or three aircraft are holding short of the runway, ready to depart. Inbound traffic is on final. Pick which to release first - or hold them all if the next inbound is too close.</p>
          <p>Each holding-short aircraft has an initial departure heading (vector arrow off the blip). Prefer the candidate whose heading diverges from the inbound's final track.</p>
          <p class="tip">Tip: if the closest inbound is inside ~2 nm, "Hold all" is the right call regardless of who's queued up.</p>
        </div>
      {/if}

      <div class="right-col">
        <div class="atc-call">
          <img class="atc-icon" src="https://unpkg.com/lucide-static@0.469.0/icons/tower-control.svg" alt="" aria-hidden="true" />
          <div class="atc-bubble">
            <span class="bubble-tag">Tower</span>
            {current.atcCall}
          </div>
        </div>

        {#if current.instruments}
          <div class="instruments">
            <img class="inst-icon" src="https://unpkg.com/lucide-static@0.469.0/icons/gauge.svg" alt="" aria-hidden="true" />
            <span>{current.instruments}</span>
          </div>
        {/if}

        <div class="game-q">
          <h2>{current.prompt}</h2>
        </div>

        <div class="options" class:disabled={committed}>
          {#each current.options as opt, i}
            {@const isCorrect = i === current.correctIndex}
            {@const wasPicked = pickedIndex === i}
            {@const hint = current.showAnswerHint && !committed && isCorrect}
            <button
              class="option"
              class:correct={committed && isCorrect}
              class:wrong={committed && wasPicked && !isCorrect}
              class:reveal={committed && !wasPicked && !isCorrect}
              class:hint
              disabled={committed}
              onclick={() => pickOption(i)}
            >
              <span class="key" aria-hidden="true">{i + 1}</span>
              <span class="opt-text">{opt.label}</span>
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

      <div class="scope-wrap">
        <RadarScope scenario={current.scenario} size={1200} vectorMin={1}>
          {#each current.scenario.aircraft as ac (ac.id)}
            <AircraftBlip
              aircraft={ac}
              selected={current.scenario.candidateIds.includes(ac.id)}
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
      <span><kbd>1</kbd>-<kbd>{current?.options.length ?? 4}</kbd> pick</span>
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
  .atc-call { display: flex; align-items: flex-start; gap: 0.6rem; }
  .atc-icon { width: 32px; height: 32px; flex-shrink: 0; margin-top: 4px; filter: invert(78%) sepia(29%) saturate(787%) hue-rotate(174deg) brightness(100%) contrast(90%); }
  .atc-bubble { position: relative; flex: 1; background: #18242f; border: 1px solid rgba(96, 150, 186, 0.45); border-radius: 12px; padding: 0.7rem 0.85rem; min-width: 0; }
  .atc-bubble::before, .atc-bubble::after { content: ''; position: absolute; left: -10px; top: 12px; width: 0; height: 0; border-style: solid; }
  .atc-bubble::before { border-width: 7px 10px 7px 0; border-color: transparent rgba(96, 150, 186, 0.45) transparent transparent; }
  .atc-bubble::after { left: -8px; top: 13px; border-width: 6px 9px 6px 0; border-color: transparent #18242f transparent transparent; }
  .bubble-tag { display: inline-block; font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); background: rgba(96, 150, 186, 0.15); padding: 0.05rem 0.35rem; border-radius: 3px; margin-right: 0.4rem; vertical-align: 1px; }
  .instruments { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.55rem 0.7rem; background: var(--surface-2); border-left: 3px solid var(--info); border-radius: 4px; font-size: 0.8125rem; color: var(--muted); line-height: 1.4; }
  .inst-icon { width: 18px; height: 18px; flex-shrink: 0; margin-top: 1px; filter: invert(78%) sepia(29%) saturate(787%) hue-rotate(174deg) brightness(100%) contrast(90%); }
  .game-q h2 { font-size: 1.05rem; font-weight: 600; line-height: 1.3; margin: 0; }
  .scope-wrap { display: flex; justify-content: center; background: #0c1116; border-radius: 8px; padding: 0.5rem; --scope-bg: #0c1116; min-width: 0; }
  .scope-wrap :global(svg.radarscope) { width: 100%; height: auto; max-width: 100%; }
  .options { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; }
  .options.disabled { pointer-events: none; }
  .option { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 0.7rem 0.875rem; font-size: 0.9375rem; text-align: left; display: flex; align-items: center; gap: 0.625rem; transition: background 0.12s, border-color 0.12s; }
  .option:hover { border-color: var(--panel-line); }
  .option .key { width: 22px; height: 22px; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; color: var(--muted); flex-shrink: 0; }
  .option.hint { border-color: var(--good); box-shadow: 0 0 0 1px var(--good); }
  .option.correct { background: rgba(34, 197, 94, 0.18); border-color: var(--good); }
  .option.wrong { background: rgba(239, 68, 68, 0.18); border-color: var(--bad); }
  .option.reveal { opacity: 0.55; }
  .feedback { background: var(--surface-2); border-left: 3px solid var(--muted); border-radius: 4px; padding: 0.6rem 0.75rem; display: flex; flex-direction: column; gap: 0.3rem; }
  .feedback.good { border-color: var(--good); }
  .feedback.bad { border-color: var(--bad); }
  .fb-row { display: flex; gap: 0.5rem; align-items: baseline; flex-wrap: wrap; }
  .fb-label { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
  .fb-val { font-size: 0.9rem; font-weight: 500; }
  .explain { font-size: 0.8125rem; color: var(--muted); line-height: 1.4; }
  .next { align-self: flex-end; background: var(--accent); color: var(--bg); border: 0; border-radius: 6px; padding: 0.45rem 1rem; font-weight: 600; font-size: 0.875rem; cursor: pointer; }
  .kb-legend { display: flex; gap: 0.875rem; justify-content: center; align-items: center; color: var(--muted); font-size: 0.6875rem; }
  .kb-legend kbd { padding: 0 0.3rem; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); font-family: var(--font-main); font-size: 0.6875rem; color: var(--text); }
</style>
