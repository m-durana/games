<script lang="ts">
  import { onMount } from 'svelte';
  import type { Difficulty, Mode, RoundResult } from './types';
  import {
    airportLabel,
    airportLabelWithCountry,
    difficultyLabel,
    modeTitle,
    recordRoundStats,
    ROUND_LENGTH,
    saveBest,
    saveDailyDone,
    saveHistoryEntry,
    todayKey,
  } from './engine';
  import { evaluateAchievements } from './achievements';
  import * as Sound from './sound';
  import Logo from './Logo.svelte';
  import { buildShareUrl, encodeRound } from './share';

  import type { Achievement } from './achievements';

  interface Props {
    mode: Mode;
    difficulty: Difficulty;
    daily?: boolean;
    mixed?: boolean;
    results: RoundResult[];
    onAgain: () => void;
    onHome: () => void;
    onAchievements?: (a: Achievement[]) => void;
  }

  let { mode, difficulty, daily = false, mixed = false, results, onAgain, onHome, onAchievements }: Props = $props();

  // svelte-ignore state_referenced_locally
  const score = results.filter((r) => r.correct).length;
  const pct = Math.round((score / ROUND_LENGTH) * 100);

  function saveMixBest(s: number): boolean {
    const key = 'best:mix';
    const prev = Number(localStorage.getItem(key) ?? 0);
    if (s > prev) { localStorage.setItem(key, String(s)); return true; }
    return false;
  }

  // svelte-ignore state_referenced_locally
  const isNewBest = daily ? false : mixed ? saveMixBest(score) : saveBest(mode, difficulty, score);

  // svelte-ignore state_referenced_locally
  if (daily) {
    saveDailyDone(score);
  } else if (!mixed) {
    saveHistoryEntry({ mode, difficulty, score, total: ROUND_LENGTH, ts: Date.now(), results });
  }
  // svelte-ignore state_referenced_locally
  recordRoundStats(results);

  // svelte-ignore state_referenced_locally
  const newAchievements = evaluateAchievements();
  $effect(() => {
    if (newAchievements.length > 0 && onAchievements) onAchievements(newAchievements);
  });

  let expanded: number | null = $state(null);
  let shareState: 'idle' | 'copied' = $state('idle');

  function verdict() {
    if (score === ROUND_LENGTH) return 'Perfect round.';
    if (score >= 8) return 'Sharp.';
    if (score >= 6) return 'Solid.';
    if (score >= 3) return 'Some homework to do.';
    return 'Time to study the timetables.';
  }

  function fmt(v: string, m: Mode): string {
    if (m === 'airportConn') return airportLabelWithCountry(v);
    return m === 'hub' ? airportLabel(v) : v;
  }

  function toggle(i: number) {
    expanded = expanded === i ? null : i;
  }

  onMount(() => {
    if (score === ROUND_LENGTH) Sound.perfect();
  });


  const isPerfect = score === ROUND_LENGTH;
  const confettiColors = ['var(--accent)', 'var(--accent-2)', 'var(--info)', 'var(--bad)', 'var(--surface)', 'var(--accent)'];
  const confetti = Array.from({ length: 36 }, (_, i) => ({
    color: confettiColors[i % confettiColors.length],
    angle: (i / 36) * 360 + Math.random() * 10,
    distance: 90 + Math.random() * 60,
    delay: Math.random() * 0.15,
    duration: 0.9 + Math.random() * 0.6,
    rotate: Math.random() * 720 - 360,
  }));

  async function share() {
    const blob = encodeRound({
      mode,
      difficulty,
      daily,
      date: todayKey(),
      results,
    });
    const url = buildShareUrl(blob);
    const grid = results.map((r) => (r.correct ? '🟩' : '🟥')).join('');
    const header = daily
      ? `Flight Deck · Daily ${todayKey()}`
      : `Flight Deck · ${modeTitle(mode)} · ${difficultyLabel(difficulty)}`;
    const text = `${header}\n${grid} ${score}/${ROUND_LENGTH}\n${url}`;

    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ text, url });
      } else {
        await navigator.clipboard.writeText(text);
        shareState = 'copied';
        setTimeout(() => (shareState = 'idle'), 1600);
      }
    } catch {
      // user cancelled or denied - silent
    }
  }
</script>

<header class="head">
  {#if isPerfect}
    <div class="confetti" aria-hidden="true">
      {#each confetti as c}
        <span
          style="--c: {c.color}; --a: {c.angle}deg; --d: {c.distance}px; --dl: {c.delay}s; --du: {c.duration}s; --r: {c.rotate}deg;"
        ></span>
      {/each}
    </div>
  {/if}
  <div class="pills">
    {#if daily}
      <span class="pill daily">Daily · {todayKey()}</span>
    {:else if mixed}
      <span class="pill mix">Random Mix</span>
    {:else}
      <span class="pill">{modeTitle(mode)}</span>
      <span class="pill subtle">{difficultyLabel(difficulty)}</span>
    {/if}
  </div>
  <h1>{score}<span class="of">/{ROUND_LENGTH}</span></h1>
  <p class="pct">{pct}% · {verdict()}</p>
  {#if isNewBest && score > 0}
    <span class="best-flag">New best</span>
  {/if}
</header>

<button class="share" onclick={share}>
  {#if shareState === 'copied'}Copied to clipboard{:else}Share result{/if}
</button>

<section class="recap">
  {#each results as r, i}
    <button class="row" class:bad={!r.correct} class:open={expanded === i} onclick={() => toggle(i)}>
      <span class="num">{i + 1}</span>
      <Logo iata={r.question.airline.iata} name={r.question.airline.name} />
      <div class="row-body">
        <span class="airline">{r.question.airline.name}</span>
        {#if r.correct}
          <span class="ans good">{fmt(r.question.answer, r.question.mode)}</span>
        {:else}
          <span class="ans">
            <span class="picked">{fmt(r.picked, r.question.mode)}</span>
            <span class="arrow">→</span>
            <span class="correct">{fmt(r.question.answer, r.question.mode)}</span>
          </span>
        {/if}
        {#if expanded === i}
          <dl class="facts">
            <div><dt>Country</dt><dd>{r.question.airline.country}</dd></div>
            <div><dt>IATA</dt><dd>{r.question.airline.iata}</dd></div>
            <div><dt>Hub</dt><dd>{airportLabel(r.question.airline.hub)}</dd></div>
            <div><dt>Alliance</dt><dd>{r.question.airline.alliance ?? 'Independent'}</dd></div>
            <div><dt>Group</dt><dd>{r.question.airline.group ?? 'Independent'}</dd></div>
          </dl>
        {/if}
      </div>
      <span class="chev" aria-hidden="true">{expanded === i ? '▴' : '▾'}</span>
    </button>
  {/each}
</section>

<footer class="actions">
  {#if !daily}
    <button class="primary" onclick={onAgain}>Play again</button>
  {/if}
  <button class="secondary" onclick={onHome}>{daily ? 'Back home' : 'Change mode'}</button>
</footer>

<style>
  .head {
    position: relative;
    text-align: center;
    padding: 1rem 0 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  .confetti {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: 0;
  }
  .confetti span {
    position: absolute;
    width: 8px;
    height: 12px;
    background: var(--c);
    border-radius: 2px;
    transform: translate(-50%, -50%);
    animation: burst var(--du) cubic-bezier(0.2, 0.7, 0.3, 1) var(--dl) forwards;
    opacity: 0;
  }
  @keyframes burst {
    0% {
      transform: translate(-50%, -50%) rotate(var(--a)) translate(0, 0) rotate(0deg);
      opacity: 1;
    }
    100% {
      transform: translate(-50%, -50%) rotate(var(--a)) translate(var(--d), 0) rotate(var(--r));
      opacity: 0;
    }
  }
  .head > :not(.confetti) { position: relative; z-index: 1; }
  .pills { display: flex; gap: 0.4rem; flex-wrap: wrap; justify-content: center; }
  .pill {
    font-family: var(--mono);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--label-dim);
    background: var(--panel-2);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    padding: 0.28rem 0.65rem;
    border-radius: 1px;
  }
  .pill.subtle { background: transparent; }
  .pill.daily { color: var(--led-amber); border-color: var(--led-amber); background: rgba(251, 191, 36, 0.06); }
  .pill.mix { color: var(--led-cyan); border-color: var(--led-cyan); background: rgba(96, 216, 240, 0.06); }
  .head h1 {
    font-family: var(--mono);
    font-size: 4.2rem;
    font-weight: 700;
    color: var(--led-green);
    letter-spacing: 0.02em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .of { color: var(--label-dim); font-weight: 400; }
  .pct { font-family: var(--mono); color: var(--label-dim); font-size: 0.9rem; }
  .best-flag {
    margin-top: 0.3rem;
    font-family: var(--mono);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--led-amber);
    border: 1px solid var(--led-amber);
    background: rgba(251, 191, 36, 0.08);
    padding: 0.28rem 0.7rem;
    border-radius: 1px;
  }

  .share {
    align-self: center;
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    color: var(--label-dim);
    font-family: var(--mono);
    font-size: 0.66rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 700;
    padding: 0.5rem 1rem;
    border-radius: 1px;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }
  .share:hover { color: var(--led-cyan); border-color: var(--led-cyan); }
  .share:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }

  .recap {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 2px;
    padding: 0.5rem;
  }
  .row {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.55rem 0.6rem;
    background: var(--panel-2);
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
    text-align: left;
    transition: background 0.15s, border-color 0.15s;
  }
  .row:hover { border-color: var(--led-cyan); }
  .row.open { border-color: var(--led-cyan); background: rgba(96, 216, 240, 0.04); }

  .num {
    color: var(--label-dim);
    font-family: var(--mono);
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
    min-width: 1.5ch;
    padding-top: 0.8rem;
  }
  .row-body {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .airline { font-family: var(--sans); font-size: 0.92rem; font-weight: 700; color: var(--label); letter-spacing: -0.005em; }
  .ans { font-family: var(--sans); font-size: 0.8rem; color: var(--label-dim); }
  .ans.good { color: var(--led-green); }
  .ans .picked { color: var(--led-red); text-decoration: line-through; }
  .ans .arrow { color: var(--label-dim); margin: 0 0.4rem; }
  .ans .correct { color: var(--led-green); }
  .row:not(.bad) .ans { color: var(--led-green); }

  .chev { color: var(--label-dim); font-size: 0.78rem; padding-top: 0.8rem; }

  .facts {
    margin-top: 0.5rem;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem 0.85rem;
    font-family: var(--sans);
    font-size: 0.82rem;
  }
  .facts > div { display: flex; flex-direction: column; gap: 0.18rem; min-width: 0; }
  .facts dt {
    font-family: var(--mono);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--label-dim);
  }
  .facts dd { color: var(--label); word-break: break-word; font-weight: 700; }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    margin-top: auto;
    padding-top: 1rem;
  }
  .actions button {
    min-height: 48px;
    border-radius: 1px;
    font-family: var(--mono);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .primary {
    background: var(--panel);
    color: var(--led-cyan);
    border: 1px solid var(--led-cyan);
  }
  .primary:hover { color: #b0ecf6; border-color: #b0ecf6; background: rgba(96, 216, 240, 0.08); }
  .primary:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
  .secondary {
    background: var(--panel);
    color: var(--label-dim);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
  }
  .secondary:hover { color: var(--led-cyan); border-color: var(--led-cyan); }
  .secondary:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
</style>
