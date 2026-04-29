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
    font-size: 0.6875rem;
    font-family: var(--font-main);
    letter-spacing: 0;
    text-transform: uppercase;
    color: var(--muted);
    background: var(--surface-2);
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
  }
  .pill.subtle { background: transparent; border: 1px solid var(--border); }
  .pill.daily { color: var(--accent); background: rgba(163, 206, 241, 0.42); }
  .pill.mix { color: var(--accent-2); background: rgba(96, 150, 186, 0.16); }
  .head h1 {
    font-family: var(--font-main);
    font-size: 4rem;
    font-weight: 600;
    letter-spacing: 0;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .of { color: var(--muted); font-weight: 400; }
  .pct { color: var(--muted); font-size: 0.9375rem; }
  .best-flag {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: var(--good);
    background: rgba(163, 206, 241, 0.42);
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
  }

  .share {
    align-self: center;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.625rem 1.25rem;
    border-radius: 4px;
    font-size: 0.875rem;
    transition: background 0.15s, border-color 0.15s, transform 0.1s;
  }
  .share:active { transform: scale(0.97); }
  .share:hover { border-color: var(--panel-line); background: var(--surface-2); }

  .recap {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.5rem;
  }
  .row {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 0.625rem 0.625rem;
    border-radius: 6px;
    text-align: left;
    transition: background 0.15s;
  }
  .row:hover { background: var(--surface-2); }
  .row.open { background: var(--surface-2); }

  .num {
    color: var(--muted);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    min-width: 1.5ch;
    padding-top: 0.875rem;
  }
  .row-body {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .airline { font-size: 0.9375rem; font-weight: 500; }
  .ans { font-size: 0.8125rem; color: var(--muted); }
  .ans.good { color: var(--good); }
  .ans .picked { color: var(--bad); text-decoration: line-through; }
  .ans .arrow { color: var(--muted); margin: 0 0.4rem; }
  .ans .correct { color: var(--good); }
  .row:not(.bad) .ans { color: var(--good); }

  .chev { color: var(--muted); font-size: 0.75rem; padding-top: 0.875rem; }

  .facts {
    margin-top: 0.5rem;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem 0.75rem;
    font-size: 0.8125rem;
  }
  .facts > div { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .facts dt {
    font-size: 0.6875rem;
    font-family: var(--font-main);
    letter-spacing: 0;
    text-transform: uppercase;
    color: var(--muted);
  }
  .facts dd { color: var(--text); word-break: break-word; }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    margin-top: auto;
    padding-top: 0.75rem;
  }
  .actions button {
    min-height: 52px;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 500;
    transition: transform 0.1s, background 0.15s, border-color 0.15s;
  }
  .actions button:active { transform: scale(0.98); }
  .primary { background: var(--accent); color: var(--bg); }
  .primary:hover { background: #a3cef1; }
  .secondary {
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
  }
  .secondary:hover { border-color: var(--panel-line); background: var(--surface-2); }
</style>
