<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onMount } from 'svelte';
  import type { Difficulty, Mode, Question, RoundResult } from './types';
  import {
    airportLabel,
    buildDailyRound,
    buildMixedRound,
    buildRound,
    explainAnswer,
    loadSettings,
    modeDescription,
    modeLabel,
    modeTitle,
    ROUND_LENGTH,
    saveBestStreak,
    tailEntry,
    todayKey,
  } from './engine';
  import { recordModePlayed } from './achievements';
  import * as Sound from './sound';
  import Logo from './Logo.svelte';
  import AllianceLogo from './AllianceLogo.svelte';
  import { airlines as allAirlines } from './engine';

  interface Props {
    mode: Mode;
    difficulty: Difficulty;
    daily?: boolean;
    mixed?: boolean;
    onFinish: (results: RoundResult[]) => void;
    onQuit: () => void;
  }

  let { mode, difficulty, daily = false, mixed = false, onFinish, onQuit }: Props = $props();

  // svelte-ignore state_referenced_locally
  let questions: Question[] = $state(
    daily ? buildDailyRound(todayKey()) : mixed ? buildMixedRound() : buildRound(mode, difficulty),
  );
  let index = $state(0);
  let picked: string | null = $state(null);
  let selected: string[] = $state([]);
  let submitted = $state(false);
  let results: RoundResult[] = $state([]);
  let streak = $state(0);
  let advanceTimer: number | null = null;
  let showInfo = $state(false);

  const current = $derived(questions[index]);
  const isMulti = $derived(current?.mode === 'reverseGroup' && Array.isArray(current?.answers));
  const correctSet = $derived(new Set(current?.answers ?? []));
  const requiredCount = $derived(current?.answers?.length ?? 0);

  // svelte-ignore state_referenced_locally
  const showKeys = loadSettings().keyboardHints;

  const score = $derived(results.filter((r) => r.correct).length);

  // svelte-ignore state_referenced_locally
  if (!daily) recordModePlayed(mode);

  function choose(option: string) {
    if (isMulti) {
      if (submitted) return;
      if (selected.includes(option)) {
        selected = selected.filter((s) => s !== option);
      } else {
        selected = [...selected, option];
      }
      return;
    }
    if (picked !== null) return;
    picked = option;
    const correct = option === current.answer;
    if (correct) {
      streak += 1;
      // svelte-ignore state_referenced_locally
      saveBestStreak(daily ? 'daily' : mode, streak);
      Sound.correct();
      Sound.vibrate(15);
    } else {
      streak = 0;
      Sound.wrong();
      Sound.vibrate(35);
    }
    results = [...results, { question: current, picked: option, correct }];
    advanceTimer = window.setTimeout(advance, 1400);
  }

  function submitMulti() {
    if (!isMulti || submitted) return;
    if (selected.length === 0) return;
    submitted = true;
    const sel = new Set(selected);
    let correct = sel.size === correctSet.size;
    if (correct) for (const a of correctSet) if (!sel.has(a)) { correct = false; break; }
    if (correct) {
      streak += 1;
      saveBestStreak(daily ? 'daily' : mode, streak);
      Sound.correct();
      Sound.vibrate(15);
    } else {
      streak = 0;
      Sound.wrong();
      Sound.vibrate(35);
    }
    results = [...results, { question: current, picked: selected.join(', '), correct }];
    advanceTimer = window.setTimeout(advance, 1800);
  }

  function advance() {
    if (index + 1 >= questions.length) {
      onFinish(results);
      return;
    }
    index += 1;
    picked = null;
    selected = [];
    submitted = false;
  }

  function statusFor(option: string): 'idle' | 'selected' | 'correct' | 'wrong' | 'reveal' | 'missed' {
    if (isMulti) {
      if (!submitted) return selected.includes(option) ? 'selected' : 'idle';
      const isCorrect = correctSet.has(option);
      const wasSelected = selected.includes(option);
      if (wasSelected && isCorrect) return 'correct';
      if (wasSelected && !isCorrect) return 'wrong';
      if (!wasSelected && isCorrect) return 'missed';
      return 'reveal';
    }
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
      if (e.key === 'Escape') { onQuit(); return; }
      if (isMulti) {
        if (submitted) return;
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= current.options.length) {
          choose(current.options[n - 1]);
        } else if (e.key === 'Enter' && selected.length > 0) {
          submitMulti();
        }
        return;
      }
      if (picked !== null) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= current.options.length) {
        choose(current.options[n - 1]);
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
  <span class="meta">
    {#if streak >= 3}
      <span class="streak" title="Streak">🔥{streak}</span>
    {/if}
    <span>{score}/{ROUND_LENGTH}</span>
  </span>
</header>

<section class="round">
  {#key index}
    <div class="card" in:fly={{ y: 16, duration: 220 }}>
      <div class="card-head">
        <span class="mode-pill">{modeTitle(current.mode)}</span>
        {#if daily}
          <span class="daily-pill">Daily</span>
        {:else if mixed}
          <span class="daily-pill mix">Mix</span>
        {/if}
        <button
          class="info-btn"
          aria-label="About this mode"
          aria-expanded={showInfo}
          onclick={() => (showInfo = !showInfo)}
        >ⓘ</button>
      </div>
      {#if showInfo}
        <p class="mode-info">{modeDescription(current.mode)}</p>
      {/if}

      {#if current.mode === 'logo'}
        <div class="logo-stage">
          <Logo iata={current.airline.iata} name={current.airline.name} big />
        </div>
        <p class="ask center">{modeLabel(current.mode)}</p>
      {:else if current.mode === 'tail'}
        {@const t = tailEntry(current.airline.iata)}
        {#if t}
          {#if t.crop}
            <div class="tail-stage" style="aspect-ratio: {t.crop.w / t.crop.h};">
              <img
                src={t.thumb ?? t.url}
                alt="Aircraft tail"
                style="width:{100 / t.crop.w}%; height:{100 / t.crop.h}%; left:{(-t.crop.x / t.crop.w) * 100}%; top:{(-t.crop.y / t.crop.h) * 100}%;"
              />
            </div>
          {:else}
            <div class="tail-stage">
              <img src={t.thumb ?? t.url} alt="Aircraft tail" class="tail-fill" />
            </div>
          {/if}
        {/if}
        <p class="ask center">{modeLabel(current.mode)}</p>
      {:else if current.mode === 'reverseGroup'}
        <div class="prompt-block">
          <span class="prompt-label">Select all airlines that belong to</span>
          <h2>{current.airline.group}</h2>
        </div>
      {:else if current.mode === 'airportAirline' || current.mode === 'airportConn'}
        <div class="prompt-block">
          <span class="prompt-label">{modeLabel(current.mode)}</span>
          <h2>{airportLabel(current.airport ?? current.airline.hub)}</h2>
        </div>
      {:else if current.mode === 'airlineDest'}
        <div class="airline">
          <Logo iata={current.airline.iata} name={current.airline.name} />
          <div class="airline-text">
            <h2>{current.airline.name}</h2>
            <span class="country">{current.airline.country} · {current.airline.iata}</span>
          </div>
        </div>
        <p class="ask">{modeLabel(current.mode)}?</p>
      {:else}
        <div class="airline">
          <Logo iata={current.airline.iata} name={current.airline.name} />
          <div class="airline-text">
            <h2>{current.airline.name}</h2>
            <span class="country">
              {#if current.mode === 'country' || current.mode === 'hub'}
                {current.airline.iata}
              {:else}
                {current.airline.country} · {current.airline.iata}
              {/if}
            </span>
          </div>
        </div>
        <p class="ask">{modeLabel(current.mode)}?</p>
      {/if}

      <div class="options" class:disabled={isMulti ? submitted : picked !== null}>
        {#each current.options as option, i}
          {@const s = statusFor(option)}
          <button
            class="option"
            class:selected={s === 'selected'}
            class:correct={s === 'correct'}
            class:wrong={s === 'wrong'}
            class:reveal={s === 'reveal'}
            class:missed={s === 'missed'}
            disabled={isMulti ? submitted : picked !== null}
            onclick={() => choose(option)}
          >
            {#if showKeys}
              <span class="key" aria-hidden="true">{i + 1}</span>
            {/if}
            {#if current.mode === 'alliance'}
              <AllianceLogo alliance={option} />
              <span class="opt-text">{option}</span>
            {:else if current.mode === 'hub' || current.mode === 'airlineDest' || current.mode === 'airportConn'}
              <span class="opt-text">{airportLabel(option)}</span>
            {:else if current.mode === 'airportAirline'}
              {@const airlineForOpt = allAirlines.find((x) => x.iata === option)}
              {#if airlineForOpt}
                <Logo iata={airlineForOpt.iata} name={airlineForOpt.name} />
              {/if}
              <span class="opt-text">{airlineForOpt?.name ?? option}</span>
            {:else}
              <span class="opt-text">{option}</span>
            {/if}
            {#if isMulti}
              <span class="check" aria-hidden="true">
                {#if s === 'missed'}+{:else if s === 'selected' || s === 'correct' || s === 'wrong'}✓{/if}
              </span>
            {/if}
            {#if isMulti && submitted && s === 'wrong'}
              {@const aw = allAirlines.find((x) => x.name === option)}
              <span class="opt-explain">Belongs to {aw?.group ?? 'no group'}</span>
            {/if}
            {#if isMulti && submitted && s === 'missed'}
              <span class="opt-explain missed-note">You missed this one</span>
            {/if}
            {#if !isMulti && picked !== null && picked !== current.answer && option === current.answer}
              <span class="opt-explain">{explainAnswer(current)}</span>
            {/if}
          </button>
        {/each}
      </div>

      {#if isMulti && !submitted}
        <button
          class="confirm"
          disabled={selected.length === 0}
          onclick={submitMulti}
        >
          Confirm{selected.length > 0 ? ` (${selected.length} selected)` : ''}
        </button>
      {/if}
    </div>
  {/key}
  <div class="kb-legend" aria-hidden="true">
    <span><kbd>1</kbd>–<kbd>{current?.options.length ?? 4}</kbd> pick</span>
    {#if isMulti}<span><kbd>Enter</kbd> confirm</span>{/if}
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
    border-radius: 999px;
    color: var(--muted);
    background: var(--surface);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.875rem;
    border: 1px solid var(--border);
    flex-shrink: 0;
  }
  .quit:hover { color: var(--text); }
  .dots {
    flex: 1;
    display: flex;
    gap: 5px;
    justify-content: center;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: var(--surface-2);
    transition: background 0.2s, transform 0.2s;
  }
  .dot-correct { background: var(--good); }
  .dot-wrong { background: var(--bad); }
  .dot-now {
    background: var(--text);
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50%      { transform: scale(1.4); opacity: 0.65; }
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8125rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  .streak {
    color: #fb923c;
    font-size: 0.8125rem;
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
    border-radius: 20px;
    padding: 1.5rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  @media (min-width: 720px) {
    .card { padding: 2rem 2.5rem; }
  }

  .card-head { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; }
  .info-btn {
    margin-left: auto;
    width: 26px;
    height: 26px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--muted);
    font-size: 0.85rem;
    line-height: 1;
  }
  .info-btn:hover { color: var(--text); border-color: #3f3f46; }
  .info-btn[aria-expanded="true"] {
    background: rgba(96, 165, 250, 0.18);
    border-color: rgba(96, 165, 250, 0.55);
    color: #cbe2ff;
  }
  .mode-info {
    margin-top: -0.5rem;
    padding: 0.6rem 0.75rem;
    background: rgba(96, 165, 250, 0.08);
    border: 1px solid rgba(96, 165, 250, 0.25);
    border-radius: 10px;
    font-size: 0.8125rem;
    line-height: 1.45;
    color: var(--muted);
  }

  .mode-pill {
    font-size: 0.6875rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    background: var(--surface-2);
    padding: 0.3rem 0.6rem;
    border-radius: 999px;
  }
  .daily-pill {
    font-size: 0.6875rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #fbbf24;
    background: rgba(251, 191, 36, 0.12);
    padding: 0.3rem 0.6rem;
    border-radius: 999px;
  }
  .daily-pill.mix {
    color: #a78bfa;
    background: rgba(167, 139, 250, 0.14);
  }

  .airline {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.25rem 0;
  }
  .airline-text { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
  .airline h2 {
    font-size: clamp(1.25rem, 5vw, 1.75rem);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.15;
    word-break: break-word;
  }
  .country { color: var(--muted); font-size: 0.8125rem; }

  .prompt-block { padding: 0.5rem 0; text-align: center; }
  .prompt-label {
    color: var(--muted);
    font-size: 0.875rem;
    display: block;
    margin-bottom: 0.4rem;
  }
  .prompt-block h2 {
    font-size: clamp(1.5rem, 6vw, 2rem);
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .logo-stage { display: flex; justify-content: center; padding: 0.5rem 0; }

  .tail-stage {
    position: relative;
    background: var(--surface-2);
    border-radius: 14px;
    overflow: hidden;
    max-height: 320px;
    width: 100%;
  }
  .tail-stage img {
    position: absolute;
    max-width: none;
    object-fit: cover;
    display: block;
  }
  .tail-stage .tail-fill {
    position: static;
    width: 100%;
    height: 100%;
  }

  .ask { color: var(--muted); font-size: 0.9375rem; }
  .ask.center { text-align: center; }

  .options { display: flex; flex-direction: column; gap: 0.625rem; }
  @media (min-width: 720px) {
    .options {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
  }
  .opt-explain {
    flex-basis: 100%;
    margin-top: 0.35rem;
    font-size: 0.75rem;
    font-weight: 400;
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.78);
    letter-spacing: 0;
  }
  .option {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    text-align: left;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 0.875rem 1.125rem;
    min-height: 56px;
    font-size: 1rem;
    transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s, opacity 0.15s;
  }
  .option:not(:disabled):active { transform: scale(0.98); }
  @media (hover: hover) and (pointer: fine) {
    .option:not(:disabled):hover {
      border-color: #60a5fa;
      background: #2c2f36;
    }
  }
  .option:not(:disabled):hover { border-color: #3f3f46; background: #2f2f33; }

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
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 0.7rem;
    margin: 0 0.15rem;
  }
  @media (hover: hover) and (pointer: fine) {
    .kb-legend { display: flex; }
  }
  .opt-text { flex: 1; }

  .key {
    width: 22px; height: 22px;
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

  .option.correct {
    background: rgba(34, 197, 94, 0.15);
    border-color: rgba(34, 197, 94, 0.5);
    color: var(--good);
  }
  .option.wrong {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.5);
    color: var(--bad);
  }
  .option.reveal { opacity: 0.45; }
  .option.selected {
    background: rgba(96, 165, 250, 0.28);
    border-color: rgba(96, 165, 250, 0.75);
    color: #cbe2ff;
  }
  .option.selected:hover {
    background: rgba(96, 165, 250, 0.32) !important;
    border-color: rgba(96, 165, 250, 0.85) !important;
  }
  .check {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    border: 1.5px solid var(--border);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    color: transparent;
    flex-shrink: 0;
    margin-left: auto;
  }
  .option.selected .check {
    background: #60a5fa;
    border-color: #60a5fa;
    color: #0b0b0c;
  }
  .option.correct .check {
    background: var(--good);
    border-color: var(--good);
    color: #0b0b0c;
  }
  .option.wrong .check {
    background: var(--bad);
    border-color: var(--bad);
    color: #0b0b0c;
  }
  .option.missed {
    background: rgba(251, 191, 36, 0.12);
    border-color: rgba(251, 191, 36, 0.55);
    color: #fbbf24;
  }
  .option.missed .check {
    background: #fbbf24;
    border-color: #fbbf24;
    color: #0b0b0c;
  }
  .opt-explain.missed-note { color: #fbbf24; }
  .option:disabled { cursor: default; }

  .confirm {
    margin-top: 0.875rem;
    width: 100%;
    background: var(--text);
    color: #0b0b0c;
    border: none;
    padding: 0.875rem 1rem;
    border-radius: 12px;
    font-size: 0.9375rem;
    font-weight: 600;
    transition: opacity 0.15s, transform 0.1s;
  }
  .confirm:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .confirm:not(:disabled):active { transform: scale(0.98); }
  .multi-explain {
    margin-top: 0.875rem;
    color: var(--muted);
    font-size: 0.875rem;
    line-height: 1.4;
    text-align: center;
  }
</style>
