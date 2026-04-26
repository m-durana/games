<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onDestroy, onMount } from 'svelte';
  import type { Question } from './types';
  import { airportLabel, buildSpeedQuestion, loadSettings, modeLabel, modeTitle } from './engine';
  import { saveSpeedBest } from './achievements';
  import * as Sound from './sound';
  import Logo from './Logo.svelte';
  import AllianceLogo from './AllianceLogo.svelte';

  interface Props {
    onFinish: (score: number, isNewBest: boolean) => void;
    onQuit: () => void;
  }

  let { onFinish, onQuit }: Props = $props();

  const DURATION = 60;

  let current: Question = $state(buildSpeedQuestion());
  let picked: string | null = $state(null);
  let score = $state(0);
  let combo = $state(0);
  let bestCombo = $state(0);
  let timeLeft = $state(DURATION);
  let started = $state(performance.now());
  let raf = 0;
  let timeoutId: number | null = null;

  // svelte-ignore state_referenced_locally
  const showKeys = loadSettings().keyboardHints;

  function tickFrame(now: number) {
    const elapsed = (now - started) / 1000;
    const left = Math.max(0, DURATION - elapsed);
    timeLeft = left;
    if (left <= 0) {
      finish();
      return;
    }
    raf = requestAnimationFrame(tickFrame);
  }

  function finish() {
    if (raf) cancelAnimationFrame(raf);
    if (timeoutId !== null) clearTimeout(timeoutId);
    const isNewBest = saveSpeedBest(score);
    if (score >= 10) Sound.perfect();
    onFinish(score, isNewBest);
  }

  function choose(option: string) {
    if (picked !== null || timeLeft <= 0) return;
    picked = option;
    const correct = option === current.answer;
    if (correct) {
      combo += 1;
      bestCombo = Math.max(bestCombo, combo);
      const bonus = Math.floor(combo / 3); // every 3 in a row, +1 bonus
      score += 1 + bonus;
      Sound.correct();
      Sound.vibrate(15);
    } else {
      combo = 0;
      Sound.wrong();
      Sound.vibrate(35);
    }
    timeoutId = window.setTimeout(next, 380);
  }

  function next() {
    if (timeLeft <= 0) {
      finish();
      return;
    }
    current = buildSpeedQuestion();
    picked = null;
  }

  function statusFor(option: string): 'idle' | 'correct' | 'wrong' | 'reveal' {
    if (picked === null) return 'idle';
    if (option === current.answer) return 'correct';
    if (option === picked) return 'wrong';
    return 'reveal';
  }

  onMount(() => {
    raf = requestAnimationFrame(tickFrame);
    const handler = (e: KeyboardEvent) => {
      if (picked !== null || timeLeft <= 0) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= current.options.length) {
        choose(current.options[n - 1]);
      } else if (e.key === 'Escape') {
        onQuit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  onDestroy(() => {
    if (raf) cancelAnimationFrame(raf);
    if (timeoutId !== null) clearTimeout(timeoutId);
  });
</script>

<header class="bar">
  <button class="quit" onclick={onQuit} aria-label="Quit">✕</button>
  <div class="timer">
    <div class="timer-fill" style="width: {(timeLeft / DURATION) * 100}%"></div>
    <span class="timer-text">{timeLeft.toFixed(1)}s</span>
  </div>
  <span class="meta">
    {#if combo >= 3}
      <span class="streak">🔥{combo}</span>
    {/if}
    <span class="score">{score}</span>
  </span>
</header>

<section class="round">
  {#key current}
    <div class="card" in:fly={{ y: 12, duration: 180 }}>
      <div class="card-head">
        <span class="speed-pill">Speed Round</span>
        <span class="mode-pill">{modeTitle(current.mode)}</span>
      </div>

      {#if current.mode === 'logo'}
        <div class="logo-stage">
          <Logo iata={current.airline.iata} name={current.airline.name} big />
        </div>
        <p class="ask center">{modeLabel(current.mode)}</p>
      {:else if current.mode === 'reverseGroup'}
        <div class="prompt-block">
          <span class="prompt-label">Which airline belongs to</span>
          <h2>{current.airline.group}</h2>
        </div>
      {:else}
        <div class="airline">
          <Logo iata={current.airline.iata} name={current.airline.name} />
          <div class="airline-text">
            <h2>{current.airline.name}</h2>
            <span class="country">{current.airline.country} · {current.airline.iata}</span>
          </div>
        </div>
        <p class="ask">{modeLabel(current.mode)}?</p>
      {/if}

      <div class="options">
        {#each current.options as option, i}
          {@const s = statusFor(option)}
          <button
            class="option"
            class:correct={s === 'correct'}
            class:wrong={s === 'wrong'}
            class:reveal={s === 'reveal'}
            disabled={picked !== null}
            onclick={() => choose(option)}
          >
            {#if showKeys}
              <span class="key" aria-hidden="true">{i + 1}</span>
            {/if}
            {#if current.mode === 'alliance'}
              <AllianceLogo alliance={option} />
              <span class="opt-text">{option}</span>
            {:else if current.mode === 'hub'}
              <span class="opt-text">{airportLabel(option)}</span>
            {:else}
              <span class="opt-text">{option}</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/key}
</section>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0 0.25rem;
  }
  .quit {
    width: 32px; height: 32px;
    border-radius: 4px;
    color: var(--muted);
    background: var(--surface);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.875rem;
    border: 1px solid var(--border);
    flex-shrink: 0;
  }
  .timer {
    flex: 1;
    height: 28px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
    position: relative;
  }
  .timer-fill {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, var(--good) 0%, var(--accent) 70%, var(--bad) 100%);
    transition: width 0.1s linear;
  }
  .timer-text {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    color: var(--bg);
    font-family: var(--font-main);
    font-weight: 700;
    mix-blend-mode: lighten;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-shrink: 0;
  }
  .streak { color: var(--accent); font-size: 0.875rem; }
  .score {
    background: var(--surface-2);
    border: 1px solid var(--border);
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
    color: var(--text);
    font-family: var(--font-main);
    font-weight: 700;
  }

  .round { flex: 1; display: flex; align-items: stretch; }

  .card {
    width: 100%;
    background:
      linear-gradient(rgba(245, 197, 66, 0.05) 1px, transparent 1px),
      var(--surface);
    background-size: 100% 34px;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .card-head { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .speed-pill {
    font-size: 0.6875rem;
    font-family: var(--font-main);
    letter-spacing: 0;
    text-transform: uppercase;
    color: var(--accent);
    background: rgba(245, 197, 66, 0.12);
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
  }
  .mode-pill {
    font-size: 0.6875rem;
    font-family: var(--font-main);
    letter-spacing: 0;
    text-transform: uppercase;
    color: var(--muted);
    background: var(--surface-2);
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
  }

  .airline {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.25rem 0;
  }
  .airline-text { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
  .airline h2 {
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: 0;
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
    font-size: 1.75rem;
    font-weight: 600;
    letter-spacing: 0;
  }

  .logo-stage { display: flex; justify-content: center; padding: 0.5rem 0; }
  .ask { color: var(--muted); font-size: 0.9375rem; }
  .ask.center { text-align: center; }

  .options { display: flex; flex-direction: column; gap: 0.5rem; }
  .option {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    text-align: left;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    min-height: 48px;
    font-size: 1rem;
    transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s, opacity 0.15s;
  }
  .option:not(:disabled):active { transform: scale(0.98); }
  .option:not(:disabled):hover { border-color: var(--panel-line); background: #1d2a2e; }
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
    background: rgba(71, 217, 176, 0.15);
    border-color: rgba(71, 217, 176, 0.5);
    color: var(--good);
  }
  .option.wrong {
    background: rgba(255, 107, 95, 0.15);
    border-color: rgba(255, 107, 95, 0.5);
    color: var(--bad);
  }
  .option.reveal { opacity: 0.45; }
  .option:disabled { cursor: default; }
</style>
