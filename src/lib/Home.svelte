<script lang="ts">
  import type { Difficulty, HistoryEntry, Mode } from './types';
  import {
    difficultyLabel,
    loadBest,
    loadDailyDone,
    loadHistory,
    loadPool,
    modeTitle,
    modeDescription,
    savePool,
    tailCount,
    todayKey,
  } from './engine';
  import { loadSpeedBest } from './achievements';

  interface Props {
    onStart: (mode: Mode, difficulty: Difficulty) => void;
    onStartDaily: () => void;
    onStartSpeed: () => void;
    onStartMix: () => void;
    onOpenHistory: (entry: HistoryEntry) => void;
  }

  let { onStart, onStartDaily, onStartSpeed, onStartMix, onOpenHistory }: Props = $props();
  const mixBest = Number(localStorage.getItem('best:mix') ?? 0);

  const allModes: Mode[] = ['group', 'alliance', 'hub', 'logo', 'country', 'reverseGroup', 'tail', 'airportAirline', 'airlineDest', 'airportConn'];
  const modes = $derived(
    allModes
      .filter((m) => m !== 'tail' || tailCount() >= 4)
      .filter((m) => !(pool === 'us' && m === 'country'))
  );

  const ICONS: Record<Mode, string> = {
    group: 'building-2',
    alliance: 'handshake',
    hub: 'plane-takeoff',
    logo: 'image',
    country: 'globe',
    reverseGroup: 'split',
    tail: 'plane',
    airportAirline: 'tower-control',
    airlineDest: 'route',
    airportConn: 'map-pin',
  };
  function modeIcon(m: Mode): string {
    return `https://unpkg.com/lucide-static@0.469.0/icons/${ICONS[m]}.svg`;
  }

  function modeHint(m: Mode): string {
    switch (m) {
      case 'group': return 'Guess the parent airline group.';
      case 'alliance': return 'Pick the global airline alliance.';
      case 'hub': return 'Find the airline main hub.';
      case 'logo': return 'Name the airline from its logo.';
      case 'country': return 'Match the airline to its country.';
      case 'reverseGroup': return 'Select every airline in the group.';
      case 'tail': return 'Identify the aircraft tail livery.';
      case 'airportAirline': return 'Choose an airline serving the airport.';
      case 'airlineDest': return 'Find its top sourced destination.';
      case 'airportConn': return 'Pick a direct airport connection.';
    }
  }
  const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

  let difficulty: Difficulty = $state(
    (localStorage.getItem('difficulty') as Difficulty) || 'medium',
  );

  function setDifficulty(d: Difficulty) {
    difficulty = d;
    localStorage.setItem('difficulty', d);
  }

  let pool: 'all' | 'us' = $state(loadPool());
  function setPool(p: 'all' | 'us') {
    pool = p;
    savePool(p);
  }

  const history = $derived(loadHistory());
  const daily = $derived(loadDailyDone());
  const speedBest = $derived(loadSpeedBest());
</script>

<header class="hero">
  <h1>Airline Trivia</h1>
  <p>Six modes, three difficulties, one daily challenge.</p>
</header>

<div class="features">
  <button class="daily-card" class:done={daily !== null} onclick={onStartDaily}>
    <div class="daily-head">
      <span class="daily-tag">Daily</span>
      <span class="daily-date">{todayKey()}</span>
    </div>
    <h2>Today's 10</h2>
    <p>
      {#if daily}
        Done · {daily.score}/10
      {:else}
        Mixed modes. Same for everyone, every day.
      {/if}
    </p>
  </button>

  <button class="speed-card" onclick={onStartSpeed}>
    <div class="speed-head">
      <span class="speed-tag">Speed</span>
      {#if speedBest > 0}
        <span class="speed-best">Best {speedBest}</span>
      {/if}
    </div>
    <h2>60 seconds</h2>
    <p>Mixed modes. Combo bonus every 3 in a row.</p>
  </button>

  <button class="mix-card" onclick={onStartMix}>
    <div class="mix-head">
      <span class="mix-tag">Mix</span>
      {#if mixBest > 0}
        <span class="mix-best">Best {mixBest}/10</span>
      {/if}
    </div>
    <h2>Random 10</h2>
    <p>Daily-style mix. Replay as much as you like.</p>
  </button>
</div>

<section class="diff">
  <span class="diff-label">Difficulty (standard rounds)</span>
  <div class="diff-toggle" role="tablist">
    {#each difficulties as d}
      <button
        role="tab"
        aria-selected={difficulty === d}
        class:active={difficulty === d}
        onclick={() => setDifficulty(d)}
      >
        {difficultyLabel(d)}
      </button>
    {/each}
  </div>
</section>

<button
  class="pool-toggle"
  role="switch"
  aria-checked={pool === 'us'}
  class:on={pool === 'us'}
  onclick={() => setPool(pool === 'us' ? 'all' : 'us')}
>
  <span class="pool-knob"></span>
  <span class="pool-label">US only</span>
</button>

<section class="modes-wrap">
  <span class="modes-label">Modes</span>
  <div class="modes-grid">
    {#each modes as mode}
      {@const best = loadBest(mode, difficulty)}
      <button class="mode-tile" onclick={() => onStart(mode, difficulty)}>
        <img class="tile-icon" src={modeIcon(mode)} alt="" aria-hidden="true" />
        <span class="tile-title">{modeTitle(mode)}</span>
        <span class="tile-desc">{modeHint(mode)}</span>
        {#if best > 0}
          <span class="tile-best">{best}/10</span>
        {/if}
      </button>
    {/each}
  </div>
</section>

{#if history.length > 0}
  <section class="recent">
    <h3>Recent rounds</h3>
    <ul>
      {#each history.slice(0, 5) as h}
        <li>
          <button class="row-btn" disabled={!h.results || h.results.length === 0} onclick={() => onOpenHistory(h)}>
            <span class="dot" class:strong={h.score >= 7}></span>
            <span class="name">{modeTitle(h.mode)}</span>
            <span class="diff-pill">{difficultyLabel(h.difficulty)}</span>
            <span class="score">{h.score}/{h.total}</span>
            {#if h.results && h.results.length > 0}
              <span class="chev" aria-hidden="true">›</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .hero {
    padding: 1.25rem 0.25rem 0.25rem;
    border-left: 3px solid var(--accent);
    padding-left: 0.875rem;
  }
  .hero h1 {
    font-family: var(--font-main);
    font-size: 2.25rem;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
    margin-bottom: 0.5rem;
    color: var(--accent);
  }
  .hero p {
    color: var(--muted);
    font-size: 1rem;
    line-height: 1.5;
  }

  .features {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.625rem;
  }
  .features > .mix-card { grid-column: 1 / -1; }
  @media (min-width: 720px) {
    .features { grid-template-columns: 1fr 1fr 1fr; gap: 0.875rem; }
    .features > .mix-card { grid-column: auto; }
  }

  .mix-card {
    text-align: left;
    border-radius: 8px;
    padding: 0.875rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    transition: transform 0.15s, border-color 0.15s, background 0.15s;
    min-height: 110px;
    background:
      linear-gradient(90deg, rgba(98, 183, 216, 0.18), transparent 4px),
      linear-gradient(180deg, rgba(98, 183, 216, 0.12), rgba(16, 24, 27, 0.92));
    border: 1px solid rgba(98, 183, 216, 0.36);
    box-shadow: var(--shadow);
  }
  .mix-card:hover { border-color: rgba(98, 183, 216, 0.72); }
  .mix-card:active { transform: scale(0.98); }
  .mix-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .mix-tag {
    font-size: 0.625rem;
    font-family: var(--font-main);
    letter-spacing: 0;
    text-transform: uppercase;
    color: var(--info);
    font-weight: 600;
  }
  .mix-best {
    font-size: 0.6875rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .mix-card h2 {
    font-size: 1.125rem;
    font-weight: 600;
    letter-spacing: 0;
  }
  .mix-card p {
    color: var(--muted);
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .daily-card,
  .speed-card {
    text-align: left;
    border-radius: 8px;
    padding: 0.875rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    transition: transform 0.15s, border-color 0.15s, background 0.15s;
    min-height: 130px;
  }
  .daily-card {
    background:
      linear-gradient(90deg, rgba(245, 197, 66, 0.22), transparent 4px),
      linear-gradient(180deg, rgba(245, 197, 66, 0.11), rgba(16, 24, 27, 0.92));
    border: 1px solid rgba(245, 197, 66, 0.34);
    box-shadow: var(--shadow);
  }
  .daily-card:hover { border-color: rgba(245, 197, 66, 0.72); }
  .daily-card.done { opacity: 0.85; }

  .speed-card {
    background:
      linear-gradient(90deg, rgba(71, 217, 176, 0.2), transparent 4px),
      linear-gradient(180deg, rgba(71, 217, 176, 0.1), rgba(16, 24, 27, 0.92));
    border: 1px solid rgba(71, 217, 176, 0.34);
    box-shadow: var(--shadow);
  }
  .speed-card:hover { border-color: rgba(71, 217, 176, 0.72); }

  .daily-card:active, .speed-card:active { transform: scale(0.98); }

  .daily-head, .speed-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .daily-tag {
    font-size: 0.625rem;
    font-family: var(--font-main);
    letter-spacing: 0;
    text-transform: uppercase;
    color: var(--accent);
    font-weight: 600;
  }
  .speed-tag {
    font-size: 0.625rem;
    font-family: var(--font-main);
    letter-spacing: 0;
    text-transform: uppercase;
    color: var(--accent-2);
    font-weight: 600;
  }
  .daily-date, .speed-best {
    font-size: 0.6875rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .daily-card h2, .speed-card h2 {
    font-size: 1.125rem;
    font-weight: 600;
    letter-spacing: 0;
  }
  .daily-card p, .speed-card p {
    color: var(--muted);
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .diff {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .diff-label {
    font-size: 0.6875rem;
    font-family: var(--font-main);
    letter-spacing: 0;
    text-transform: uppercase;
    color: var(--muted);
    padding-left: 0.25rem;
  }
  .diff-toggle {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    background: rgba(16, 24, 27, 0.92);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px;
  }
  .diff-toggle button {
    padding: 0.625rem 0.5rem;
    border-radius: 8px;
    font-size: 0.875rem;
    color: var(--muted);
    transition: background 0.15s, color 0.15s;
  }
  .diff-toggle button.active {
    background: var(--accent);
    color: var(--bg);
  }

  .pool-toggle {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0.65rem 0.3rem 0.3rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.75rem;
    color: var(--muted);
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .pool-knob {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    transition: background 0.15s, border-color 0.15s;
  }
  .pool-toggle.on {
    color: var(--text);
    border-color: rgba(71, 217, 176, 0.62);
    background: rgba(71, 217, 176, 0.12);
  }
  .pool-toggle.on .pool-knob {
    background: var(--accent-2);
    border-color: var(--accent-2);
  }

  .modes-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .modes-label {
    font-size: 0.6875rem;
    font-family: var(--font-main);
    letter-spacing: 0;
    text-transform: uppercase;
    color: var(--muted);
    padding-left: 0.25rem;
  }
  .modes-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
  @media (min-width: 720px) {
    .modes-grid { grid-template-columns: repeat(5, 1fr); gap: 0.75rem; }
  }
  @media (min-width: 1024px) {
    .modes-grid { grid-template-columns: repeat(6, 1fr); }
  }
  .mode-tile {
    min-height: 148px;
    background:
      linear-gradient(180deg, rgba(245, 197, 66, 0.04), transparent 50%),
      var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    position: relative;
    text-align: center;
    transition: transform 0.15s, border-color 0.15s, background 0.15s;
  }
  .mode-tile:active { transform: scale(0.98); background: var(--surface-2); }
  .mode-tile:hover { border-color: var(--panel-line); }
  .tile-icon {
    width: 28px;
    height: 28px;
    margin-bottom: 0.2rem;
    filter: invert(84%) sepia(56%) saturate(617%) hue-rotate(349deg) brightness(104%) contrast(92%);
  }
  .tile-title {
    font-size: 0.8125rem;
    font-family: var(--font-main);
    font-weight: 700;
    color: var(--text);
    line-height: 1.2;
  }
  .tile-desc {
    color: var(--muted);
    font-size: 0.6875rem;
    line-height: 1.3;
    min-height: 1.8em;
    max-width: 100%;
  }
  .tile-best {
    position: absolute;
    top: 0.35rem;
    right: 0.4rem;
    font-size: 0.625rem;
    color: var(--muted);
    background: rgba(245, 197, 66, 0.12);
    border: 1px solid rgba(245, 197, 66, 0.24);
    font-family: var(--font-main);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    font-variant-numeric: tabular-nums;
  }

  .recent h3 {
    font-size: 0.6875rem;
    font-family: var(--font-main);
    letter-spacing: 0;
    text-transform: uppercase;
    color: var(--muted);
    padding-left: 0.25rem;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }
  .recent ul {
    list-style: none;
    background: rgba(16, 24, 27, 0.94);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .recent li {
    border-bottom: 1px solid var(--border);
  }
  .recent li:last-child { border-bottom: none; }
  .row-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.875rem;
    font-size: 0.875rem;
    background: none;
    color: var(--text);
    text-align: left;
    transition: background 0.12s;
  }
  .row-btn:not(:disabled):hover { background: rgba(245, 197, 66, 0.08); }
  .row-btn:disabled { cursor: default; opacity: 0.7; }
  .chev { color: var(--muted); font-size: 1rem; line-height: 1; }
  .dot {
    width: 8px; height: 8px;
    border-radius: 4px;
    background: var(--muted);
  }
  .dot.strong { background: var(--good); }
  .name { flex: 1; }
  .diff-pill {
    font-size: 0.6875rem;
    color: var(--muted);
    background: var(--surface-2);
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
  }
  .score {
    font-variant-numeric: tabular-nums;
    color: var(--text);
    font-size: 0.875rem;
    min-width: 4ch;
    text-align: right;
  }
</style>
