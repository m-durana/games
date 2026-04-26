<script lang="ts">
  import {
    airlines,
    airportLabel,
    difficultyLabel,
    loadAirlineStats,
    loadBest,
    loadBestStreak,
    loadHistory,
    modeTitle,
  } from './engine';
  import { ACHIEVEMENTS, loadSpeedBest, loadUnlocked } from './achievements';
  import type { Difficulty, Mode } from './types';

  interface Props {
    onHome: () => void;
  }

  let { onHome }: Props = $props();

  const history = loadHistory();
  const stats = loadAirlineStats();
  const unlocked = loadUnlocked();
  const speedBest = loadSpeedBest();

  const modes: Mode[] = ['group', 'alliance', 'hub', 'logo', 'country', 'reverseGroup'];
  const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

  const totalRounds = history.length;
  const totalScore = history.reduce((s, h) => s + h.score, 0);
  const totalQuestions = history.reduce((s, h) => s + h.total, 0);
  const overallPct = totalQuestions ? Math.round((totalScore / totalQuestions) * 100) : 0;

  const perMode = modes.map((m) => {
    const rows = history.filter((h) => h.mode === m);
    const score = rows.reduce((s, h) => s + h.score, 0);
    const total = rows.reduce((s, h) => s + h.total, 0);
    return {
      mode: m,
      rounds: rows.length,
      pct: total ? Math.round((score / total) * 100) : 0,
      best: Math.max(...difficulties.map((d) => loadBest(m, d)), 0),
      streak: loadBestStreak(m),
    };
  });

  const dailyStreak = loadBestStreak('daily');

  const hardestAirlines = Object.entries(stats)
    .filter(([, s]) => s.seen >= 2 && s.missed > 0)
    .map(([iata, s]) => {
      const a = airlines.find((x) => x.iata === iata);
      return {
        iata,
        name: a?.name ?? iata,
        country: a?.country ?? '',
        hub: a?.hub ?? '',
        seen: s.seen,
        missed: s.missed,
        rate: s.missed / s.seen,
      };
    })
    .sort((a, b) => b.rate - a.rate || b.missed - a.missed)
    .slice(0, 8);

  const unlockedCount = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;
</script>

<header class="head">
  <h1>Stats</h1>
  {#if totalRounds === 0}
    <p>Play a round to start tracking stats.</p>
  {:else}
    <p>{totalRounds} rounds · {overallPct}% accuracy</p>
  {/if}
</header>

{#if totalRounds > 0 || speedBest > 0}
  <section class="grid">
    {#each perMode as m}
      <div class="cell">
        <span class="cell-title">{modeTitle(m.mode)}</span>
        <div class="cell-row">
          <span class="big">{m.pct}%</span>
          <span class="muted">{m.rounds}</span>
        </div>
        <div class="cell-row small">
          <span>Best {m.best}/10</span>
          {#if m.streak >= 3}
            <span class="streak">🔥 {m.streak}</span>
          {/if}
        </div>
      </div>
    {/each}
  </section>

  <div class="extra-row">
    {#if speedBest > 0}
      <div class="extra">
        <span class="extra-label">Speed best</span>
        <span class="extra-value">{speedBest}</span>
      </div>
    {/if}
    {#if dailyStreak >= 3}
      <div class="extra">
        <span class="extra-label">Daily streak</span>
        <span class="extra-value">🔥 {dailyStreak}</span>
      </div>
    {/if}
  </div>
{/if}

<section class="achievements">
  <h2>Achievements <span class="count">{unlockedCount}/{ACHIEVEMENTS.length}</span></h2>
  <div class="ach-grid">
    {#each ACHIEVEMENTS as a}
      {@const got = !!unlocked[a.id]}
      <div class="ach" class:got>
        <span class="ach-icon">{got ? a.icon : '🔒'}</span>
        <div class="ach-text">
          <span class="ach-name">{a.name}</span>
          <span class="ach-desc">{a.desc}</span>
        </div>
      </div>
    {/each}
  </div>
</section>

{#if hardestAirlines.length > 0}
  <section class="hardest">
    <h2>Toughest airlines</h2>
    <p class="muted">Airlines you've gotten wrong most often.</p>
    <ul>
      {#each hardestAirlines as a}
        <li>
          <span class="iata">{a.iata}</span>
          <div class="info">
            <span class="name">{a.name}</span>
            <span class="meta">{a.country}{a.hub ? ' · ' + airportLabel(a.hub) : ''}</span>
          </div>
          <span class="ratio">{a.missed}/{a.seen}</span>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<footer class="actions">
  <button class="primary" onclick={onHome}>Back home</button>
</footer>

<style>
  .head { padding: 1rem 0.25rem 0.25rem; }
  .head h1 {
    font-size: clamp(1.75rem, 8vw, 2.5rem);
    font-weight: 600;
    letter-spacing: -0.02em;
    margin-bottom: 0.5rem;
  }
  .head p { color: var(--muted); font-size: 0.9375rem; }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .cell {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 0.75rem 0.875rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .cell-title {
    font-size: 0.6875rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .cell-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .cell-row.small { font-size: 0.6875rem; color: var(--muted); }
  .big {
    font-size: 1.375rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .muted { color: var(--muted); font-size: 0.75rem; font-variant-numeric: tabular-nums; }
  .streak { color: #fb923c; }

  .extra-row {
    display: flex;
    gap: 0.5rem;
  }
  .extra {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0.625rem 0.875rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .extra-label {
    font-size: 0.6875rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .extra-value {
    font-size: 1.125rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .achievements h2 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .count {
    font-size: 0.75rem;
    color: var(--muted);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  .ach-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .ach {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0.625rem 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    opacity: 0.55;
  }
  .ach.got { opacity: 1; border-color: rgba(251, 191, 36, 0.3); }
  .ach-icon { font-size: 1.5rem; flex-shrink: 0; }
  .ach-text { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .ach-name { font-size: 0.8125rem; font-weight: 600; }
  .ach-desc { font-size: 0.6875rem; color: var(--muted); line-height: 1.3; }

  .hardest h2 { font-size: 1rem; font-weight: 600; margin-bottom: 0.25rem; }
  .hardest .muted { font-size: 0.8125rem; margin-bottom: 0.625rem; }
  .hardest ul {
    list-style: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  .hardest li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.625rem 0.875rem;
    border-bottom: 1px solid var(--border);
  }
  .hardest li:last-child { border-bottom: none; }
  .iata {
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 0.75rem;
    color: var(--muted);
    background: var(--surface-2);
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    min-width: 3ch;
    text-align: center;
  }
  .info { display: flex; flex-direction: column; min-width: 0; }
  .name { font-size: 0.9375rem; font-weight: 500; }
  .meta { font-size: 0.75rem; color: var(--muted); }
  .ratio {
    font-variant-numeric: tabular-nums;
    color: var(--bad);
    font-size: 0.875rem;
  }

  .actions { padding-top: 0.75rem; }
  .actions button {
    width: 100%;
    min-height: 52px;
    border-radius: 14px;
    font-size: 1rem;
    font-weight: 500;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    transition: background 0.15s, border-color 0.15s, transform 0.1s;
  }
  .actions button:active { transform: scale(0.98); }
  .actions button:hover { border-color: #3f3f46; background: var(--surface-2); }
</style>
