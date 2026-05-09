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
  .head { padding: 0.4rem 0.1rem 0.6rem; }
  .head h1 {
    font-family: var(--mono);
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--label);
    margin-bottom: 0.4rem;
  }
  .head p { font-family: var(--sans); color: var(--label-dim); font-size: 0.85rem; }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }
  .cell {
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 1px;
    padding: 0.7rem 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.32rem;
  }
  .cell-title {
    font-family: var(--mono);
    font-size: 0.6rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--label-dim);
    font-weight: 700;
  }
  .cell-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .cell-row.small { font-family: var(--mono); font-size: 0.66rem; color: var(--label-dim); letter-spacing: 0.04em; }
  .big {
    font-family: var(--mono);
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--led-green);
    letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums;
  }
  .muted { color: var(--label-dim); font-family: var(--mono); font-size: 0.72rem; font-variant-numeric: tabular-nums; }
  .streak { color: var(--led-amber); font-family: var(--mono); font-weight: 700; }

  .extra-row {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .extra {
    flex: 1;
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 1px;
    padding: 0.6rem 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .extra-label {
    font-family: var(--mono);
    font-size: 0.6rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--label-dim);
    font-weight: 700;
  }
  .extra-value {
    font-family: var(--mono);
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--led-cyan);
    font-variant-numeric: tabular-nums;
  }

  .achievements { margin-bottom: 1rem; }
  .achievements h2 {
    font-family: var(--mono);
    font-size: 0.72rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--label);
    font-weight: 700;
    margin-bottom: 0.55rem;
    display: flex;
    align-items: baseline;
    gap: 0.55rem;
  }
  .count {
    font-family: var(--mono);
    font-size: 0.66rem;
    color: var(--label-dim);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .ach-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .ach {
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 1px;
    padding: 0.6rem 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    opacity: 0.5;
  }
  .ach.got { opacity: 1; border-color: var(--led-green); }
  .ach-icon { font-size: 1.4rem; flex-shrink: 0; }
  .ach-text { display: flex; flex-direction: column; gap: 0.12rem; min-width: 0; }
  .ach-name { font-family: var(--sans); font-size: 0.8rem; font-weight: 700; color: var(--label); letter-spacing: -0.005em; }
  .ach-desc { font-family: var(--sans); font-size: 0.7rem; color: var(--label-dim); line-height: 1.35; }

  .hardest { margin-bottom: 1rem; }
  .hardest h2 { font-family: var(--mono); font-size: 0.72rem; letter-spacing: 0.22em; text-transform: uppercase; color: var(--label); font-weight: 700; margin-bottom: 0.25rem; }
  .hardest .muted { font-family: var(--sans); font-size: 0.78rem; margin-bottom: 0.6rem; }
  .hardest ul {
    list-style: none;
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 1px;
    overflow: hidden;
  }
  .hardest li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.7rem;
    align-items: center;
    padding: 0.6rem 0.85rem;
    border-bottom: 1px solid var(--bezel-lo);
  }
  .hardest li:last-child { border-bottom: none; }
  .iata {
    font-family: var(--mono);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--led-cyan);
    background: var(--panel-2);
    border: 1px solid var(--bezel-lo);
    padding: 0.22rem 0.5rem;
    border-radius: 1px;
    min-width: 3ch;
    text-align: center;
  }
  .info { display: flex; flex-direction: column; min-width: 0; }
  .name { font-family: var(--sans); font-size: 0.9rem; font-weight: 700; color: var(--label); letter-spacing: -0.005em; }
  .meta { font-family: var(--mono); font-size: 0.66rem; letter-spacing: 0.04em; color: var(--label-dim); }
  .ratio {
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    color: var(--led-red);
    font-weight: 700;
    font-size: 0.85rem;
  }

  .actions { padding-top: 1rem; }
  .actions .primary {
    width: 100%;
    min-height: 48px;
    border-radius: 1px;
    font-family: var(--mono);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    background: var(--panel);
    color: var(--led-cyan);
    border: 1px solid var(--led-cyan);
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .actions .primary:hover { color: #b0ecf6; border-color: #b0ecf6; background: rgba(96, 216, 240, 0.08); }
  .actions .primary:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
</style>
