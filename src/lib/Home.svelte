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
  import { atcModeDescription, atcModeTitle, loadAtcBest, type AtcMode } from './atc';
  import { clearAllProgress, clearProgress, listProgress, type ProgressEntry } from './progress';

  interface Props {
    onStart: (mode: Mode, difficulty: Difficulty) => void;
    onStartDaily: () => void;
    onStartSpeed: () => void;
    onStartMix: () => void;
    onStartAircraftWordle: (difficulty: Difficulty) => void;
    onStartAircraftIdentify: (difficulty: Difficulty) => void;
    onStartMilitaryWordle: (difficulty: Difficulty) => void;
    onStartMilitaryIdentify: (difficulty: Difficulty) => void;
    onStartAirportWordle: (difficulty: Difficulty) => void;
    onStartAirportIdentify: (difficulty: Difficulty) => void;
    onStartAtc: (mode: AtcMode, difficulty: Difficulty) => void;
    onOpenIntro: (intro: IntroKey, difficulty: Difficulty) => void;
    onOpenHistory: (entry: HistoryEntry) => void;
    onResumeProgress: (entry: ProgressEntry) => void;
  }

  type IntroKey =
    | 'aircraftIdentify'
    | 'militaryIdentify'
    | 'atcDecode'
    | 'atcCompose'
    | 'atcCleared'
    | 'atcIntercept'
    | 'radarConflict'
    | 'radarSequence';

  let {
    onStart,
    onStartDaily,
    onStartSpeed,
    onStartMix,
    onStartAircraftWordle,
    onStartAircraftIdentify,
    onStartMilitaryWordle,
    onStartMilitaryIdentify,
    onStartAirportWordle,
    onStartAirportIdentify,
    onStartAtc,
    onOpenIntro,
    onOpenHistory,
    onResumeProgress,
  }: Props = $props();

  let inProgress: ProgressEntry[] = $state(listProgress());
  function refreshInProgress() { inProgress = listProgress(); }
  function deleteEntry(key: string) {
    clearProgress(key);
    refreshInProgress();
  }
  function clearAllInProgress() {
    if (!confirm('Delete all saved progress?')) return;
    clearAllProgress();
    refreshInProgress();
  }
  function resumeEntry(entry: ProgressEntry) {
    onResumeProgress(entry);
  }
  let inProgressExpanded = $state(false);

  function openGuide(e: Event, key: IntroKey) {
    e.stopPropagation();
    e.preventDefault();
    onOpenIntro(key, difficulty);
  }
  const mixBest = Number(localStorage.getItem('best:mix') ?? 0);
  // atcMix is now reachable only via the category Mix button; it's no longer
  // listed as its own chip per user request (see categoryMix below).
  // 'intercept' is temporarily disabled - it's a pilot-side decision and the
  // top-down radar view is the wrong viewpoint. Keep code intact for a future
  // cockpit / instruments-only game mode (see docs/potential-intercept-mode.md).
  // 'callsign' lives under the Airlines category - it's an airline-name quiz
  // at heart. The Radio category covers what's actually said on the radio.
  const atcModes: AtcMode[] = ['decode', 'compose', 'cleared'];
  const callsignBest = $derived(loadAtcBest('callsign', difficulty));
  // Radar modes - their own category. All run on the top-down scope.
  const radarModes: AtcMode[] = ['conflict', 'sequence'];

  type CategoryKey = 'airline' | 'airport' | 'aircraft' | 'atc' | 'radar';
  function categoryMix(cat: CategoryKey) {
    if (cat === 'atc') {
      onStartAtc('atcMix', difficulty);
      return;
    }
    if (cat === 'radar') {
      const m = radarModes[Math.floor(Math.random() * radarModes.length)];
      onStartAtc(m, difficulty);
      return;
    }
    if (cat === 'airline') {
      const m = visibleAirlineModes[Math.floor(Math.random() * visibleAirlineModes.length)];
      onStart(m, difficulty);
      return;
    }
    if (cat === 'airport') {
      const r = Math.random();
      if (r < 0.7) {
        const m = airportRoundModes[Math.floor(Math.random() * airportRoundModes.length)];
        onStart(m, difficulty);
      } else if (r < 0.85) {
        onStartAirportWordle(difficulty);
      } else {
        onStartAirportIdentify(difficulty);
      }
      return;
    }
    // aircraft: random of the 4 plane/military modes
    const r = Math.random();
    if (r < 0.25) onStartAircraftIdentify(difficulty);
    else if (r < 0.5) onStartAircraftWordle(difficulty);
    else if (r < 0.75) onStartMilitaryIdentify(difficulty);
    else onStartMilitaryWordle(difficulty);
  }
  const ATC_ICONS: Record<AtcMode, string> = {
    callsign: 'radio',
    decode: 'message-square-text',
    compose: 'spell-check',
    atcMix: 'shuffle',
    cleared: 'navigation',
    intercept: 'plane-landing',
    conflict: 'radar',
    sequence: 'list-ordered',
  };

  function atcIcon(m: AtcMode): string {
    return `https://unpkg.com/lucide-static@0.469.0/icons/${ATC_ICONS[m]}.svg`;
  }

  const airlineModes: Mode[] = ['group', 'alliance', 'hub', 'logo', 'country', 'reverseGroup', 'tail', 'code'];
  const airportRoundModes: Mode[] = ['airportAirline', 'airlineDest', 'airportConn', 'whereAmI', 'hubOf'];
  const visibleAirlineModes = $derived(
    airlineModes
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
    code: 'hash',
    whereAmI: 'map-pinned',
    hubOf: 'building',
    aircraftWordle: 'grid-3x3',
    aircraftIdentify: 'plane',
    militaryWordle: 'swords',
    militaryIdentify: 'crosshair',
    airportWordle: 'tower-control',
    airportIdentify: 'camera',
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
      case 'aircraftWordle': return 'Deduce a mystery aircraft.';
      case 'aircraftIdentify': return 'Spot a plane from a photo.';
      case 'airportAirline': return 'Choose an airline serving the airport.';
      case 'airlineDest': return 'Find its top sourced destination.';
      case 'airportConn': return 'Find the busiest ranked destination from the airport.';
      case 'code': return 'Guess the airline from its carrier code.';
      case 'whereAmI': return 'Deduce the airport from its top destinations.';
      case 'hubOf': return 'Pick the airline that hubs here.';
      case 'militaryWordle': return 'Deduce a mystery military aircraft.';
      case 'militaryIdentify': return 'Spot a military aircraft from a photo.';
      case 'airportWordle': return 'Deduce a mystery airport.';
      case 'airportIdentify': return 'Spot an airport from a photo.';
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

  let pool: 'all' | 'us' | 'us_eu' = $state(loadPool());
  function setPool(p: 'all' | 'us' | 'us_eu') {
    pool = p;
    savePool(p);
  }

  const history = $derived(loadHistory());
  const daily = $derived(loadDailyDone());
  const speedBest = $derived(loadSpeedBest());
</script>

<div class="features">
  <button class="daily-card" class:done={daily !== null} onclick={onStartDaily}>
    <img class="feature-icon" src="https://unpkg.com/lucide-static@0.469.0/icons/calendar-days.svg" alt="" aria-hidden="true" />
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
    <img class="feature-icon" src="https://unpkg.com/lucide-static@0.469.0/icons/timer.svg" alt="" aria-hidden="true" />
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
    <img class="feature-icon" src="https://unpkg.com/lucide-static@0.469.0/icons/shuffle.svg" alt="" aria-hidden="true" />
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
  <div class="diff-head">
    <span class="diff-label">Difficulty</span>
    <label class="pool-select" class:on={pool !== 'all'}>
      <span class="pool-select-label">Region</span>
      <select
        class="pool-select-input"
        value={pool}
        onchange={(e) => setPool((e.currentTarget as HTMLSelectElement).value as 'all' | 'us' | 'us_eu')}
      >
        <option value="all">All</option>
        <option value="us">US only</option>
        <option value="us_eu">US + Europe</option>
      </select>
    </label>
  </div>
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

<div class="modes-sections">
<section class="modes-wrap">
  <div class="modes-head">
    <span class="modes-label">Airlines</span>
    <button class="mix-btn" type="button" onclick={() => categoryMix('airline')} aria-label="Random airline mode">
      <img src="https://unpkg.com/lucide-static@0.469.0/icons/shuffle.svg" alt="" aria-hidden="true" />
      <span>Mix</span>
    </button>
  </div>
  <div class="modes-grid">
    {#each visibleAirlineModes as mode}
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
    <button class="mode-tile" onclick={() => onStartAtc('callsign', difficulty)}>
      <img class="tile-icon" src={atcIcon('callsign')} alt="" aria-hidden="true" />
      <span class="tile-title">{atcModeTitle('callsign')}</span>
      <span class="tile-desc">{atcModeDescription('callsign')}</span>
      {#if callsignBest > 0}
        <span class="tile-best">{callsignBest}/10</span>
      {/if}
    </button>
  </div>
</section>

<section class="modes-wrap">
  <div class="modes-head">
    <span class="modes-label">Airports</span>
    <button class="mix-btn" type="button" onclick={() => categoryMix('airport')} aria-label="Random airport mode">
      <img src="https://unpkg.com/lucide-static@0.469.0/icons/shuffle.svg" alt="" aria-hidden="true" />
      <span>Mix</span>
    </button>
  </div>
  <div class="modes-grid">
    {#each airportRoundModes as mode}
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
    <button class="mode-tile" onclick={() => onStartAirportWordle(difficulty)}>
      <img class="tile-icon" src="https://unpkg.com/lucide-static@0.469.0/icons/tower-control.svg" alt="" aria-hidden="true" />
      <span class="tile-title">Airport Wordle</span>
      <span class="tile-desc">Deduce a mystery airport from country, traffic tier, runways, alliance.</span>
    </button>
    <button class="mode-tile" onclick={() => onStartAirportIdentify(difficulty)}>
      <img class="tile-icon" src="https://unpkg.com/lucide-static@0.469.0/icons/camera.svg" alt="" aria-hidden="true" />
      <span class="tile-title">Airport Identify</span>
      <span class="tile-desc">Photo of an airport - guess with progressive hints.</span>
    </button>
  </div>
</section>

<section class="modes-wrap">
  <div class="modes-head">
    <span class="modes-label">Aircraft</span>
    <button class="mix-btn" type="button" onclick={() => categoryMix('aircraft')} aria-label="Random aircraft mode">
      <img src="https://unpkg.com/lucide-static@0.469.0/icons/shuffle.svg" alt="" aria-hidden="true" />
      <span>Mix</span>
    </button>
  </div>
  <div class="modes-grid">
    <button class="mode-tile" onclick={() => onStartAircraftIdentify(difficulty)}>
      <span class="guide-btn" role="button" tabindex="0" aria-label="Open field guide" title="Open field guide" onclick={(e) => openGuide(e, 'aircraftIdentify')} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openGuide(e, 'aircraftIdentify'); }}>?</span>
      <img class="tile-icon" src="https://unpkg.com/lucide-static@0.469.0/icons/plane.svg" alt="" aria-hidden="true" />
      <span class="tile-title">Aircraft Identify</span>
      <span class="tile-desc">Photo of a plane - guess with hints.</span>
    </button>
    <button class="mode-tile" onclick={() => onStartAircraftWordle(difficulty)}>
      <img class="tile-icon" src="https://unpkg.com/lucide-static@0.469.0/icons/grid-3x3.svg" alt="" aria-hidden="true" />
      <span class="tile-title">Aircraft Wordle</span>
      <span class="tile-desc">{difficulty === 'hard' ? '5 guesses' : '6 guesses'}, attribute clues each round.</span>
    </button>
    <button class="mode-tile" onclick={() => onStartMilitaryIdentify(difficulty)}>
      <span class="guide-btn" role="button" tabindex="0" aria-label="Open field guide" title="Open field guide" onclick={(e) => openGuide(e, 'militaryIdentify')} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openGuide(e, 'militaryIdentify'); }}>?</span>
      <img class="tile-icon" src="https://unpkg.com/lucide-static@0.469.0/icons/crosshair.svg" alt="" aria-hidden="true" />
      <span class="tile-title">Military Identify</span>
      <span class="tile-desc">Photo of a military aircraft - guess with progressive hints.</span>
    </button>
    <button class="mode-tile" onclick={() => onStartMilitaryWordle(difficulty)}>
      <img class="tile-icon" src="https://unpkg.com/lucide-static@0.469.0/icons/swords.svg" alt="" aria-hidden="true" />
      <span class="tile-title">Military Wordle</span>
      <span class="tile-desc">Fighters, bombers, helos. {difficulty === 'hard' ? '5 guesses' : '6 guesses'}, seven attributes.</span>
    </button>
  </div>
</section>

<section class="modes-wrap">
  <div class="modes-head">
    <span class="modes-label">Radio</span>
    <button class="mix-btn" type="button" onclick={() => categoryMix('atc')} aria-label="Radio Mix - random question type each round">
      <img src="https://unpkg.com/lucide-static@0.469.0/icons/shuffle.svg" alt="" aria-hidden="true" />
      <span>Mix</span>
    </button>
  </div>
  <div class="modes-grid">
    {#each atcModes as mode}
      {@const best = loadAtcBest(mode, difficulty)}
      {@const introKey = mode === 'decode' ? 'atcDecode' : mode === 'compose' ? 'atcCompose' : mode === 'cleared' ? 'atcCleared' : mode === 'intercept' ? 'atcIntercept' : null}
      <button class="mode-tile" onclick={() => onStartAtc(mode, difficulty)}>
        {#if introKey}
          <span class="guide-btn" role="button" tabindex="0" aria-label="Open field guide" title="Open field guide" onclick={(e) => openGuide(e, introKey as IntroKey)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openGuide(e, introKey as IntroKey); }}>?</span>
        {/if}
        <img class="tile-icon" src={atcIcon(mode)} alt="" aria-hidden="true" />
        <span class="tile-title">{atcModeTitle(mode)}</span>
        <span class="tile-desc">{atcModeDescription(mode)}</span>
        {#if best > 0}
          <span class="tile-best">{best}/10</span>
        {/if}
      </button>
    {/each}
  </div>
</section>

<section class="modes-wrap">
  <div class="modes-head">
    <span class="modes-label">Radar</span>
    <button class="mix-btn" type="button" onclick={() => categoryMix('radar')} aria-label="Random radar mode">
      <img src="https://unpkg.com/lucide-static@0.469.0/icons/shuffle.svg" alt="" aria-hidden="true" />
      <span>Mix</span>
    </button>
  </div>
  <div class="modes-grid">
    {#each radarModes as mode}
      {@const best = loadAtcBest(mode, difficulty)}
      {@const introKey = mode === 'conflict' ? 'radarConflict' : mode === 'sequence' ? 'radarSequence' : null}
      <button class="mode-tile" onclick={() => onStartAtc(mode, difficulty)}>
        {#if introKey}
          <span class="guide-btn" role="button" tabindex="0" aria-label="Open field guide" title="Open field guide" onclick={(e) => openGuide(e, introKey as IntroKey)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openGuide(e, introKey as IntroKey); }}>?</span>
        {/if}
        <img class="tile-icon" src={atcIcon(mode)} alt="" aria-hidden="true" />
        <span class="tile-title">{atcModeTitle(mode)}</span>
        <span class="tile-desc">{atcModeDescription(mode)}</span>
        {#if best > 0}
          <span class="tile-best">{best}/10</span>
        {/if}
      </button>
    {/each}
  </div>
</section>
</div>

{#if inProgress.length > 0}
  {@const visibleEntries = inProgressExpanded ? inProgress : inProgress.slice(0, 3)}
  <section class="in-progress">
    <div class="in-progress-head">
      <span class="in-progress-label">In progress</span>
      <button class="ip-clear-all" type="button" onclick={clearAllInProgress}>Clear all</button>
    </div>
    <ul class="ip-list">
      {#each visibleEntries as entry (entry.key)}
        <li class="ip-row">
          <button class="ip-resume" type="button" onclick={() => resumeEntry(entry)}>
            <span class="ip-cat">{entry.category}</span>
            <span class="ip-label">{entry.label}</span>
            <span class="ip-progress">{entry.currentIndex}/{entry.total}</span>
          </button>
          <button
            class="ip-del"
            type="button"
            aria-label="Delete {entry.label}"
            title="Delete"
            onclick={() => deleteEntry(entry.key)}
          >✕</button>
        </li>
      {/each}
    </ul>
    {#if inProgress.length > 3}
      <button class="ip-toggle" type="button" onclick={() => (inProgressExpanded = !inProgressExpanded)}>
        {inProgressExpanded ? 'Show less' : `View more (${inProgress.length - 3})`}
      </button>
    {/if}
  </section>
{/if}

{#if history.length > 0}
  <section class="recent">
    <h3>Recent rounds</h3>
    <ul>
      {#each history.slice(0, 5) as h}
        {@const hasDetail = (h.results && h.results.length > 0) || (h.aircraftResults && h.aircraftResults.length > 0)}
        <li>
          <button class="row-btn" disabled={!hasDetail} onclick={() => onOpenHistory(h)}>
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
    text-align: center;
    border-radius: 8px;
    padding: 0.7rem 0.75rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    transition: transform 0.15s, border-color 0.15s, background 0.15s;
    min-height: 104px;
    background: var(--surface);
    border: 1px solid rgba(96, 150, 186, 0.36);
    border-left: 5px solid var(--accent-2);
    box-shadow: var(--shadow);
  }
  .mix-card:hover { border-color: rgba(96, 150, 186, 0.72); }
  .mix-card:active { transform: scale(0.98); }
  .mix-head {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    width: 100%;
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
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0;
  }
  .mix-card p {
    color: var(--muted);
    font-size: 0.75rem;
    line-height: 1.25;
  }

  .daily-card,
  .speed-card {
    text-align: center;
    border-radius: 8px;
    padding: 0.7rem 0.75rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    transition: transform 0.15s, border-color 0.15s, background 0.15s;
    min-height: 104px;
  }
  .daily-card {
    background: var(--surface);
    border: 1px solid rgba(39, 76, 119, 0.28);
    border-left: 5px solid var(--accent);
    box-shadow: var(--shadow);
  }
  .daily-card:hover { border-color: rgba(39, 76, 119, 0.6); }
  .daily-card.done { opacity: 0.85; }

  .speed-card {
    background: var(--surface);
    border: 1px solid rgba(163, 206, 241, 0.7);
    border-left: 5px solid var(--info);
    box-shadow: var(--shadow);
  }
  .speed-card:hover { border-color: rgba(96, 150, 186, 0.72); }

  .daily-card:active, .speed-card:active { transform: scale(0.98); }

  .feature-icon {
    width: 30px;
    height: 30px;
    filter: invert(78%) sepia(29%) saturate(787%) hue-rotate(174deg) brightness(100%) contrast(90%);
  }
  .daily-head, .speed-head {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    width: 100%;
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
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0;
  }
  .daily-card p, .speed-card p {
    color: var(--muted);
    font-size: 0.75rem;
    line-height: 1.25;
  }

  .diff {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .diff-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
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
    background: var(--surface);
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

  .pool-select {
    align-self: center;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.4rem 0.25rem 0.55rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.75rem;
    color: var(--muted);
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .pool-select.on {
    color: var(--text);
    border-color: rgba(96, 150, 186, 0.62);
    background: rgba(163, 206, 241, 0.42);
  }
  .pool-select-label {
    font-family: var(--font-main);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .pool-select-input {
    background: transparent;
    color: inherit;
    border: none;
    font: inherit;
    padding: 0.15rem 0.2rem;
    cursor: pointer;
  }
  .pool-select-input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
    border-radius: 3px;
  }

  .modes-sections {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.25rem;
    align-items: start;
  }
  @media (min-width: 720px) {
    .modes-sections {
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
    }
  }
  .modes-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .modes-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding-right: 0.25rem;
  }
  .modes-label {
    font-size: 0.6875rem;
    font-family: var(--font-main);
    letter-spacing: 0;
    text-transform: uppercase;
    color: var(--muted);
    padding-left: 0.25rem;
  }
  .mix-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.18rem 0.55rem 0.18rem 0.4rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid rgba(96, 150, 186, 0.45);
    color: var(--accent);
    font-family: var(--font-main);
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, transform 0.12s;
  }
  .mix-btn:hover { background: rgba(163, 206, 241, 0.18); border-color: rgba(96, 150, 186, 0.75); }
  .mix-btn:active { transform: scale(0.96); }
  .mix-btn img {
    width: 13px; height: 13px;
    filter: invert(78%) sepia(29%) saturate(787%) hue-rotate(174deg) brightness(100%) contrast(90%);
  }
  .modes-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
  @media (min-width: 720px) {
    .modes-grid { grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
  }
  @media (min-width: 1024px) {
    .modes-grid { grid-template-columns: repeat(4, 1fr); }
  }
  .mode-tile {
    min-height: 148px;
    background: var(--surface);
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
    filter: invert(78%) sepia(29%) saturate(787%) hue-rotate(174deg) brightness(100%) contrast(90%);
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
  .guide-btn {
    position: absolute;
    top: 0.3rem;
    left: 0.35rem;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--surface-2);
    border: 1px solid rgba(96, 150, 186, 0.45);
    color: var(--accent);
    font-family: var(--font-main);
    font-size: 0.6875rem;
    font-weight: 700;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s, transform 0.12s;
  }
  .guide-btn:hover {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
    transform: scale(1.08);
  }
  .guide-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .tile-best {
    position: absolute;
    top: 0.35rem;
    right: 0.4rem;
    font-size: 0.625rem;
    color: var(--muted);
    background: rgba(163, 206, 241, 0.45);
    border: 1px solid rgba(96, 150, 186, 0.32);
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
    background: var(--surface);
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
  .row-btn:not(:disabled):hover { background: var(--surface-2); }
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

  .in-progress {
    margin: 0.75rem 0 1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem 0.875rem;
  }
  .in-progress-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }
  .in-progress-label {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    font-weight: 600;
  }
  .ip-clear-all {
    background: none;
    border: 0;
    color: var(--muted);
    font-size: 0.75rem;
    cursor: pointer;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
  }
  .ip-clear-all:hover { color: var(--bad); background: var(--surface-2); }
  .ip-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .ip-row {
    display: flex;
    align-items: stretch;
    gap: 0.4rem;
  }
  .ip-resume {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    text-align: left;
    color: var(--text);
    font-size: 0.875rem;
  }
  .ip-resume:hover { border-color: var(--accent); }
  .ip-cat {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    flex-shrink: 0;
  }
  .ip-label { font-weight: 500; flex: 1; min-width: 0; }
  .ip-progress {
    color: var(--muted);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  .ip-toggle {
    margin-top: 0.4rem;
    background: none;
    border: 0;
    color: var(--accent);
    font-size: 0.8125rem;
    cursor: pointer;
    padding: 0.25rem 0.4rem;
    border-radius: 4px;
  }
  .ip-toggle:hover { background: var(--surface-2); }
  .ip-del {
    width: 32px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--muted);
    cursor: pointer;
    font-size: 0.875rem;
  }
  .ip-del:hover { color: var(--bad); border-color: rgba(239, 68, 68, 0.55); }
</style>
