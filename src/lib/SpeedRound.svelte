<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onDestroy, onMount } from 'svelte';
  import type { Question } from './types';
  import { airlines as allAirlines, airportLabel, airportLabelWithCountry, buildSpeedQuestion, loadSettings, modeLabel, modeTitle } from './engine';
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
      {:else if current.mode === 'airportConn'}
        <div class="prompt-block">
          <span class="prompt-label">{modeLabel(current.mode)}</span>
          <h2>{airportLabelWithCountry(current.airport ?? current.airline.hub)}</h2>
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
            {:else if current.mode === 'airportConn'}
              <span class="opt-text">{airportLabelWithCountry(option)}</span>
            {:else if current.mode === 'hub'}
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
          </button>
        {/each}
      </div>
    </div>
  {/key}
</section>

<style>
  .bar {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.5rem 0.65rem;
    background: var(--panel-2);
    border: 1px solid var(--bezel-lo);
    border-radius: 2px;
  }
  .quit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--mono);
    font-size: 0.65rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--led-red);
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    background: var(--panel);
    border-radius: 1px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .quit:hover { color: #ff9b9b; }
  .quit:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }

  .timer {
    flex: 1;
    position: relative;
    height: 22px;
    background: var(--bg);
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
    overflow: hidden;
  }
  .timer-fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--led-cyan);
    opacity: 0.22;
    transition: width 0.08s linear;
  }
  .timer-text {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--mono);
    font-weight: 700;
    font-size: 0.78rem;
    letter-spacing: 0.06em;
    color: var(--led-cyan);
    font-variant-numeric: tabular-nums;
  }

  .meta {
    display: inline-flex;
    align-items: center;
    gap: 0.85rem;
    font-family: var(--mono);
    font-size: 0.78rem;
    color: var(--label);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .streak { color: var(--led-amber); font-weight: 700; }
  .score { color: var(--led-green); font-weight: 700; font-size: 0.95rem; letter-spacing: 0.04em; }

  .round {
    width: 100%;
    margin-top: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    align-items: stretch;
  }

  .card {
    width: 100%;
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 2px;
    padding: 1.4rem 1.2rem 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .card-head { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
  .speed-pill, .mode-pill {
    font-family: var(--mono);
    font-size: 0.62rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--label-dim);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    background: var(--panel-2);
    padding: 0.22rem 0.5rem;
    border-radius: 1px;
    font-weight: 700;
  }
  .speed-pill { color: var(--led-cyan); letter-spacing: 0.22em; }
  .mode-pill { color: var(--label); }

  .logo-stage {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0.6rem 0;
  }
  .logo-stage :global(.logo) { width: 100px; height: 100px; }

  .prompt-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.45rem;
    text-align: center;
    padding: 0.6rem 0;
  }
  .prompt-block .prompt-label {
    font-family: var(--mono);
    font-size: 0.62rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--label-dim);
    font-weight: 700;
  }
  .prompt-block h2 {
    font-family: var(--sans);
    font-weight: 700;
    font-size: 1.5rem;
    color: var(--label);
    letter-spacing: -0.005em;
    line-height: 1.2;
  }

  .airline {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.4rem 0;
  }
  .airline :global(.logo) { width: 60px; height: 60px; flex-shrink: 0; }
  .airline-text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    align-items: flex-start;
  }
  .airline-text h2 {
    font-family: var(--sans);
    font-weight: 700;
    font-size: 1.3rem;
    color: var(--label);
    letter-spacing: -0.005em;
  }
  .airline-text .country {
    font-family: var(--mono);
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    color: var(--label-dim);
  }

  .ask, .ask.center {
    font-family: var(--mono);
    font-size: 0.78rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--led-cyan);
    font-weight: 700;
    text-align: left;
  }
  .ask.center { text-align: center; }

  .options {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.55rem;
  }
  @media (max-width: 600px) { .options { grid-template-columns: 1fr; } }

  .option {
    position: relative;
    display: grid;
    grid-template-columns: 30px 1fr;
    align-items: center;
    column-gap: 0.7rem;
    padding: 0.85rem 0.95rem 0.85rem 0.55rem;
    background: var(--panel-2);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 1px;
    cursor: pointer;
    text-align: left;
    min-height: 60px;
  }
  .option:hover .opt-text { color: #fff; }
  .option:hover .key { color: var(--led-cyan); border-color: var(--led-cyan); }
  .option:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
  .option[disabled] { cursor: default; }

  .key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px; height: 24px;
    font-family: var(--mono);
    font-size: 0.7rem;
    color: var(--label-dim);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    background: var(--bg);
    border-radius: 1px;
    font-weight: 700;
  }
  .opt-text {
    font-family: var(--sans);
    font-weight: 700;
    font-size: 0.92rem;
    color: var(--label);
    letter-spacing: -0.005em;
  }

  .option.correct { border-color: var(--led-green); background: rgba(74, 222, 128, 0.08); }
  .option.correct .opt-text { color: var(--led-green); }
  .option.correct .key { color: var(--led-green); border-color: var(--led-green); }
  .option.wrong { border-color: var(--led-red); background: rgba(248, 113, 113, 0.06); }
  .option.wrong .opt-text { color: var(--led-red); }
  .option.wrong .key { color: var(--led-red); border-color: var(--led-red); }

  .option :global(.alliance-logo) { width: 22px; height: 22px; flex-shrink: 0; }
  .option :global(.logo) { width: 26px; height: 26px; flex-shrink: 0; }
</style>
