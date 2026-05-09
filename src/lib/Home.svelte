<script lang="ts">
  import type { Difficulty, HistoryEntry, Mode } from './types';
  import {
    difficultyLabel,
    loadBest,
    loadDailyDone,
    loadHistory,
    loadPool,
    modeTitle,
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
    | 'radarConflict'
    | 'radarSequence'
    | 'interceptStable'
    | 'interceptMinimums'
    | 'interceptFma';

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
  let confirmClearOpen = $state(false);
  function askClearAll() { confirmClearOpen = true; }
  function doClearAll() {
    clearAllProgress();
    refreshInProgress();
    confirmClearOpen = false;
  }
  function cancelClearAll() { confirmClearOpen = false; }
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

  const atcModes: AtcMode[] = ['decode', 'compose', 'cleared'];
  const callsignBest = $derived(loadAtcBest('callsign', difficulty));
  const radarModes: AtcMode[] = [
    'conflict',
    'sequence',
    'interceptStable',
    'interceptMinimums',
    'interceptFma',
  ];

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
    conflict: 'radar',
    sequence: 'list-ordered',
    interceptStable: 'gauge',
    interceptMinimums: 'cloud-fog',
    interceptFma: 'monitor-cog',
  };
  function atcIconUrl(m: AtcMode): string {
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
  function modeIconUrl(m: Mode): string {
    return `https://unpkg.com/lucide-static@0.469.0/icons/${ICONS[m]}.svg`;
  }
  const SHUFFLE_ICON = `https://unpkg.com/lucide-static@0.469.0/icons/shuffle.svg`;
  const CALENDAR_ICON = `https://unpkg.com/lucide-static@0.469.0/icons/calendar-days.svg`;
  const TIMER_ICON = `https://unpkg.com/lucide-static@0.469.0/icons/timer.svg`;
  const FLAME_ICON = `https://unpkg.com/lucide-static@0.469.0/icons/flame.svg`;

  function modeEngrave(m: Mode | AtcMode | 'tail'): string {
    const map: Record<string, string> = {
      group: 'GROUP', alliance: 'ALLIANCE', hub: 'HUB', logo: 'LOGO',
      country: 'COUNTRY', reverseGroup: 'REVERSE GROUP', tail: 'TAIL', code: 'CODE',
      airportAirline: 'CARRIERS', airlineDest: 'AIRLINE ROUTES', airportConn: 'AIRPORT ROUTES',
      whereAmI: 'WHERE AM I?', hubOf: 'HUB OF',
      airportWordle: 'WORDLE', airportIdentify: 'IDENTIFY',
      aircraftWordle: 'WORDLE', aircraftIdentify: 'IDENTIFY',
      militaryWordle: 'MIL WORDLE', militaryIdentify: 'MILITARY',
      callsign: 'CALLSIGN', decode: 'DECODE', compose: 'READBACK', cleared: 'CLEARED',
      conflict: 'CONFLICT', sequence: 'SEQUENCE',
      interceptStable: 'STABLE', interceptMinimums: 'MINIMUMS', interceptFma: 'FMA',
    };
    return map[m] ?? modeTitle(m as Mode);
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

<!-- DIFF + REGION ROW (cockpit-style segmented selector) -->
<div class="diff-row">
  <div class="diff" role="tablist" aria-label="Difficulty">
    {#each difficulties as d}
      <button class:on={difficulty === d} aria-selected={difficulty === d} onclick={() => setDifficulty(d)}>
        <span class="led"></span>{difficultyLabel(d)}
      </button>
    {/each}
  </div>
  <span class="diff-spacer"></span>
  <div class="pool" role="tablist" aria-label="Region">
    <span class="pool-label">Region</span>
    {#each [['all','All'],['us','US'],['us_eu','US + EU']] as [value, label]}
      <button
        type="button"
        class:on={pool === value}
        aria-selected={pool === value}
        onclick={() => setPool(value as 'all' | 'us' | 'us_eu')}
      >{label}</button>
    {/each}
  </div>
</div>

<!-- PRIMARY -->
<section class="bezel" data-label="Primary Runs">
  <div class="btn-grid cols-3">
    <button class="pbtn lg" class:lit-green={daily !== null} onclick={onStartDaily}>
      <span class="pbtn-led"></span>
      <span class="pbtn-icon" style="--icon: url('{CALENDAR_ICON}')"></span>
      <span class="pbtn-engrave">DAILY</span>
      <span class="pbtn-desc">Today's curated 10. Same set for everyone every day.</span>
      {#if daily !== null}
        <span class="pbtn-last">{daily.score}/10</span>
      {:else}
        <span class="pbtn-last subtle">{todayKey()}</span>
      {/if}
    </button>
    <button class="pbtn lg" onclick={onStartSpeed}>
      <span class="pbtn-led"></span>
      <span class="pbtn-icon" style="--icon: url('{TIMER_ICON}')"></span>
      <span class="pbtn-engrave">SPEED · 60s</span>
      <span class="pbtn-desc">Sixty-second sprint. Combo bonus every 3 in a row.</span>
      {#if speedBest > 0}<span class="pbtn-last">best {speedBest}</span>{/if}
    </button>
    <button class="pbtn lg" onclick={onStartMix}>
      <span class="pbtn-led"></span>
      <span class="pbtn-icon" style="--icon: url('{SHUFFLE_ICON}')"></span>
      <span class="pbtn-engrave">RANDOM 10</span>
      <span class="pbtn-desc">Daily-style mix. Replay as much as you like.</span>
      {#if mixBest > 0}<span class="pbtn-last">best {mixBest}/10</span>{/if}
    </button>
  </div>
</section>

<!-- AIRLINES + AIRPORTS -->
<section class="row-2">
  <div class="bezel" data-label="Airlines">
    <span class="bezel-mix">
      <button class="mix-btn" type="button" onclick={() => categoryMix('airline')} aria-label="Random airline mode">
        <span class="m-icon" style="--icon: url('{SHUFFLE_ICON}')"></span>Mix
      </button>
    </span>
    <div class="btn-grid">
      {#each visibleAirlineModes as mode}
        {@const best = loadBest(mode, difficulty)}
        <button class="pbtn" onclick={() => onStart(mode, difficulty)}>
          <span class="pbtn-led"></span>
          <span class="pbtn-icon" style="--icon: url('{modeIconUrl(mode)}')"></span>
          <span class="pbtn-engrave">{modeEngrave(mode)}</span>
          <span class="pbtn-desc">{modeHint(mode)}</span>
          {#if best > 0}<span class="pbtn-last">{best}/10</span>{/if}
        </button>
      {/each}
      <button class="pbtn" onclick={() => onStartAtc('callsign', difficulty)}>
        <span class="pbtn-led"></span>
        <span class="pbtn-icon" style="--icon: url('{atcIconUrl('callsign')}')"></span>
        <span class="pbtn-engrave">CALLSIGN</span>
        <span class="pbtn-desc">{atcModeDescription('callsign')}</span>
        {#if callsignBest > 0}<span class="pbtn-last">{callsignBest}/10</span>{/if}
      </button>
    </div>
  </div>

  <div class="bezel" data-label="Airports">
    <span class="bezel-mix">
      <button class="mix-btn" type="button" onclick={() => categoryMix('airport')} aria-label="Random airport mode">
        <span class="m-icon" style="--icon: url('{SHUFFLE_ICON}')"></span>Mix
      </button>
    </span>
    <div class="btn-grid">
      {#each airportRoundModes as mode}
        {@const best = loadBest(mode, difficulty)}
        <button class="pbtn" onclick={() => onStart(mode, difficulty)}>
          <span class="pbtn-led"></span>
          <span class="pbtn-icon" style="--icon: url('{modeIconUrl(mode)}')"></span>
          <span class="pbtn-engrave">{modeEngrave(mode)}</span>
          <span class="pbtn-desc">{modeHint(mode)}</span>
          {#if best > 0}<span class="pbtn-last">{best}/10</span>{/if}
        </button>
      {/each}
      <button class="pbtn" onclick={() => onStartAirportWordle(difficulty)}>
        <span class="pbtn-led"></span>
        <span class="pbtn-icon" style="--icon: url('{modeIconUrl('airportWordle')}')"></span>
        <span class="pbtn-engrave">WORDLE</span>
        <span class="pbtn-desc">{modeHint('airportWordle')}</span>
      </button>
      <button class="pbtn" onclick={() => onStartAirportIdentify(difficulty)}>
        <span class="pbtn-led"></span>
        <span class="pbtn-icon" style="--icon: url('{modeIconUrl('airportIdentify')}')"></span>
        <span class="pbtn-engrave">IDENTIFY</span>
        <span class="pbtn-desc">{modeHint('airportIdentify')}</span>
      </button>
    </div>
  </div>
</section>

<!-- AIRCRAFT + RADIO + RADAR -->
<section class="row-3">
  <div class="bezel" data-label="Aircraft">
    <span class="bezel-mix">
      <button class="mix-btn" type="button" onclick={() => categoryMix('aircraft')} aria-label="Random aircraft mode">
        <span class="m-icon" style="--icon: url('{SHUFFLE_ICON}')"></span>Mix
      </button>
    </span>
    <div class="btn-grid">
      <button class="pbtn has-info" onclick={() => onStartAircraftIdentify(difficulty)}>
        <span class="pbtn-led"></span>
        <span class="pbtn-icon" style="--icon: url('{modeIconUrl('aircraftIdentify')}')"></span>
        <span class="title-row">
          <span class="pbtn-engrave">IDENTIFY</span>
          <span class="info-badge" role="button" tabindex="0" aria-label="Open field guide" title="Open field guide" onclick={(e) => openGuide(e, 'aircraftIdentify')} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openGuide(e, 'aircraftIdentify'); }}>?</span>
        </span>
        <span class="pbtn-desc">{modeHint('aircraftIdentify')}</span>
      </button>
      <button class="pbtn" onclick={() => onStartAircraftWordle(difficulty)}>
        <span class="pbtn-led"></span>
        <span class="pbtn-icon" style="--icon: url('{modeIconUrl('aircraftWordle')}')"></span>
        <span class="pbtn-engrave">WORDLE</span>
        <span class="pbtn-desc">{modeHint('aircraftWordle')}</span>
      </button>
      <button class="pbtn has-info" onclick={() => onStartMilitaryIdentify(difficulty)}>
        <span class="pbtn-led"></span>
        <span class="pbtn-icon" style="--icon: url('{modeIconUrl('militaryIdentify')}')"></span>
        <span class="title-row">
          <span class="pbtn-engrave">MILITARY</span>
          <span class="info-badge" role="button" tabindex="0" aria-label="Open field guide" title="Open field guide" onclick={(e) => openGuide(e, 'militaryIdentify')} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openGuide(e, 'militaryIdentify'); }}>?</span>
        </span>
        <span class="pbtn-desc">{modeHint('militaryIdentify')}</span>
      </button>
      <button class="pbtn" onclick={() => onStartMilitaryWordle(difficulty)}>
        <span class="pbtn-led"></span>
        <span class="pbtn-icon" style="--icon: url('{modeIconUrl('militaryWordle')}')"></span>
        <span class="pbtn-engrave">MIL WORDLE</span>
        <span class="pbtn-desc">{modeHint('militaryWordle')}</span>
      </button>
    </div>
  </div>

  <div class="bezel" data-label="Radio">
    <span class="bezel-mix">
      <button class="mix-btn" type="button" onclick={() => categoryMix('atc')} aria-label="Radio Mix">
        <span class="m-icon" style="--icon: url('{SHUFFLE_ICON}')"></span>Mix
      </button>
    </span>
    <div class="btn-grid">
      {#each atcModes as mode}
        {@const best = loadAtcBest(mode, difficulty)}
        {@const introKey = mode === 'decode' ? 'atcDecode' : mode === 'compose' ? 'atcCompose' : mode === 'cleared' ? 'atcCleared' : null}
        <button class="pbtn" class:has-info={!!introKey} onclick={() => onStartAtc(mode, difficulty)}>
          <span class="pbtn-led"></span>
          <span class="pbtn-icon" style="--icon: url('{atcIconUrl(mode)}')"></span>
          {#if introKey}
            <span class="title-row">
              <span class="pbtn-engrave">{modeEngrave(mode)}</span>
              <span class="info-badge" role="button" tabindex="0" aria-label="Open field guide" title="Open field guide" onclick={(e) => openGuide(e, introKey as IntroKey)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openGuide(e, introKey as IntroKey); }}>?</span>
            </span>
          {:else}
            <span class="pbtn-engrave">{modeEngrave(mode)}</span>
          {/if}
          <span class="pbtn-desc">{atcModeDescription(mode)}</span>
          {#if best > 0}<span class="pbtn-last">{best}/10</span>{/if}
        </button>
      {/each}
    </div>
  </div>

  <div class="bezel" data-label="Radar">
    <span class="bezel-mix">
      <button class="mix-btn" type="button" onclick={() => categoryMix('radar')} aria-label="Random radar mode">
        <span class="m-icon" style="--icon: url('{SHUFFLE_ICON}')"></span>Mix
      </button>
    </span>
    <div class="btn-grid">
      {#each radarModes as mode}
        {@const best = loadAtcBest(mode, difficulty)}
        {@const introKey = mode === 'conflict' ? 'radarConflict' : mode === 'sequence' ? 'radarSequence' : mode === 'interceptStable' ? 'interceptStable' : mode === 'interceptMinimums' ? 'interceptMinimums' : mode === 'interceptFma' ? 'interceptFma' : null}
        <button class="pbtn" class:has-info={!!introKey} onclick={() => onStartAtc(mode, difficulty)}>
          <span class="pbtn-led"></span>
          <span class="pbtn-icon" style="--icon: url('{atcIconUrl(mode)}')"></span>
          {#if introKey}
            <span class="title-row">
              <span class="pbtn-engrave">{modeEngrave(mode)}</span>
              <span class="info-badge" role="button" tabindex="0" aria-label="Open field guide" title="Open field guide" onclick={(e) => openGuide(e, introKey as IntroKey)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openGuide(e, introKey as IntroKey); }}>?</span>
            </span>
          {:else}
            <span class="pbtn-engrave">{modeEngrave(mode)}</span>
          {/if}
          <span class="pbtn-desc">{atcModeDescription(mode)}</span>
          {#if best > 0}<span class="pbtn-last">{best}/10</span>{/if}
        </button>
      {/each}
    </div>
  </div>
</section>

<!-- MFD: RESUME + RECENT -->
{#if inProgress.length > 0 || history.length > 0}
<section class="row-2 mfd-row" class:solo={inProgress.length === 0 || history.length === 0}>
  {#if inProgress.length > 0}
    {@const visibleEntries = inProgressExpanded ? inProgress : inProgress.slice(0, 3)}
    <div class="bezel" data-label="MFD · Resume">
      <button class="bezel-aux-btn" type="button" onclick={askClearAll}>Clear all</button>
      <div class="mfd-screen">
        {#each visibleEntries as entry (entry.key)}
          <div class="mfd-row" tabindex="0">
            <span class="pre">▸</span>
            <span class="name"><span class="cat">{entry.category}</span>{entry.label}</span>
            <span class="diff" aria-hidden="true"></span>
            <button class="resume-btn" type="button" onclick={() => resumeEntry(entry)}>
              <span class="score">{entry.currentIndex}/{entry.total}</span>
              <span class="chev">›</span>
            </button>
            <button class="del-btn" type="button" aria-label="Delete {entry.label}" title="Delete" onclick={() => deleteEntry(entry.key)}>×</button>
          </div>
        {/each}
        {#if inProgress.length > 3}
          <button class="mfd-more" type="button" onclick={() => (inProgressExpanded = !inProgressExpanded)}>
            {inProgressExpanded ? 'Show less' : `View more (${inProgress.length - 3})`}
          </button>
        {/if}
      </div>
    </div>
  {/if}

  {#if history.length > 0}
    <div class="bezel" data-label="MFD · Recent Rounds">
      <div class="mfd-screen">
        {#each history.slice(0, 5) as h}
          {@const hasDetail = (h.results && h.results.length > 0) || (h.aircraftResults && h.aircraftResults.length > 0)}
          {@const tone = h.score >= 7 ? 'good' : h.score <= 3 ? 'bad-2' : ''}
          <button class="mfd-row {tone}" disabled={!hasDetail} onclick={() => onOpenHistory(h)}>
            <span class="pre">›</span>
            <span class="ts" aria-hidden="true"></span>
            <span class="name">{modeTitle(h.mode)}</span>
            <span class="diff">{difficultyLabel(h.difficulty)}</span>
            <span class="score">{h.score}/{h.total}</span>
            <span class="chev">{hasDetail ? '›' : ''}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</section>
{/if}

<!-- Confirm Clear All modal -->
{#if confirmClearOpen}
  <div class="cockpit-modal-backdrop" role="presentation" onclick={cancelClearAll}>
    <div class="bezel cockpit-modal" data-label="Confirm" role="dialog" aria-modal="true" aria-labelledby="ccm-title" onclick={(e) => e.stopPropagation()}>
      <h3 id="ccm-title" class="ccm-title">Delete all saved progress?</h3>
      <p class="ccm-body">All in-progress rounds will be cleared. This can't be undone.</p>
      <div class="ccm-actions">
        <button class="ccm-btn cancel" type="button" onclick={cancelClearAll}>Cancel</button>
        <button class="ccm-btn danger" type="button" onclick={doClearAll}>Clear all</button>
      </div>
    </div>
  </div>
{/if}

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && confirmClearOpen) cancelClearAll(); }} />

<style>
  /* ─── diff + region row ─────────────────────── */
  .diff-row {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0 0.05rem;
    flex-wrap: wrap;
  }
  .diff {
    display: inline-flex;
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    background: var(--panel);
    border-radius: 1px;
  }
  .diff button {
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--label-dim);
    padding: 0.42rem 0.95rem 0.4rem;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    transition: color 0.15s, background 0.15s;
  }
  .diff button + button { border-left: 1px solid var(--bezel-lo); }
  .diff button .led {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--led-off);
    border: 1px solid var(--bezel-lo);
  }
  .diff button:hover { color: var(--label); }
  .diff button.on { color: var(--label); background: var(--panel-2); }
  .diff button.on .led { background: var(--led-amber); }

  .diff-spacer { flex: 1; }

  .pool {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    background: var(--panel);
    border-radius: 1px;
  }
  .pool-label {
    font-family: var(--mono);
    font-size: 0.6rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--label-dim);
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    padding: 0 0.7rem;
    border-right: 1px solid var(--bezel-lo);
  }
  .pool button {
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--label-dim);
    background: transparent;
    border: none;
    padding: 0.42rem 0.85rem 0.4rem;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }
  .pool button + button { border-left: 1px solid var(--bezel-lo); }
  .pool button:hover { color: var(--label); }
  .pool button.on { color: var(--label); background: var(--panel-2); }

  /* ─── bezel ─────────────────────────────────── */
  .bezel {
    position: relative;
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 2px;
    padding: 1.1rem 0.7rem 0.65rem;
  }
  .bezel::before {
    content: attr(data-label);
    position: absolute;
    top: -0.42rem;
    left: 0.85rem;
    background: var(--bg);
    padding: 0 0.45rem;
    font-family: var(--mono);
    font-size: 0.6rem;
    letter-spacing: 0.34em;
    text-transform: uppercase;
    color: var(--label-dim);
    font-weight: 700;
    height: 14px;
    display: inline-flex;
    align-items: center;
  }

  .bezel-mix {
    position: absolute;
    top: -0.5rem;
    right: 0.65rem;
    background: var(--bg);
    padding: 0 0.05rem;
    display: inline-flex;
    align-items: center;
    height: 18px;
    z-index: 2;
  }
  .mix-btn {
    font-family: var(--mono);
    font-size: 0.6rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--led-cyan);
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0.55rem;
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    background: var(--panel);
    border-radius: 1px;
    font-weight: 700;
  }
  .mix-btn:hover { color: #b0ecf6; }
  .mix-btn:active {
    border-color: var(--bezel-lo);
    border-bottom-color: var(--bezel-hi);
    border-right-color: var(--bezel-hi);
  }
  .m-icon {
    width: 11px; height: 11px;
    background: currentColor;
    -webkit-mask: var(--icon) center/contain no-repeat;
    mask: var(--icon) center/contain no-repeat;
  }

  .bezel-aux-btn {
    position: absolute;
    top: -0.5rem;
    right: 0.65rem;
    background: var(--bg);
    padding: 0 0.45rem;
    font-family: var(--mono);
    font-size: 0.58rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--label-faint);
    height: 18px;
    line-height: 18px;
    z-index: 2;
  }
  .bezel-aux-btn:hover { color: var(--led-red); }

  /* ─── pushbutton ────────────────────────────── */
  .pbtn {
    position: relative;
    display: grid;
    grid-template-columns: 22px 1fr;
    grid-template-rows: auto auto;
    grid-template-areas:
      "icon title"
      "desc  desc";
    column-gap: 0.55rem;
    row-gap: 0.2rem;
    padding: 0.55rem 0.7rem 0.7rem 0.6rem;
    background: var(--panel-2);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 1px;
    cursor: pointer;
    min-height: 78px;
    width: 100%;
    text-align: left;
  }
  .pbtn:hover .pbtn-engrave { color: #fff; }
  .pbtn:hover .pbtn-icon { animation: icon-pulse 1.4s ease-in-out infinite; }
  .pbtn:active {
    border-color: var(--bezel-lo);
    border-bottom-color: var(--bezel-hi);
    border-right-color: var(--bezel-hi);
  }
  @keyframes icon-pulse {
    0%, 100% { background: var(--label-dim); }
    50%      { background: var(--label); }
  }

  .pbtn-led {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--led-off);
    border: 1px solid var(--bezel-lo);
    position: absolute;
    top: 0.32rem;
    right: 0.4rem;
  }
  .pbtn.lit-amber .pbtn-led { background: var(--led-amber); }
  .pbtn.lit-green .pbtn-led { background: var(--led-green); }

  .pbtn-icon {
    grid-area: icon;
    width: 22px; height: 22px;
    background: var(--label-dim);
    -webkit-mask: var(--icon) center/contain no-repeat;
    mask: var(--icon) center/contain no-repeat;
    align-self: start;
    margin-top: 1px;
    transition: background 0.13s;
  }

  .pbtn-engrave {
    grid-area: title;
    font-family: var(--mono);
    font-weight: 700;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    color: var(--label);
    text-transform: uppercase;
    align-self: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-right: 1.4rem;
    min-width: 0;
  }
  .pbtn:has(.pbtn-last) .pbtn-engrave { padding-right: 2.6rem; }

  /* title row groups engrave + info badge so they share the title grid cell */
  .title-row {
    grid-area: title;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    align-self: center;
    min-width: 0;
    padding-right: 1.6rem;
  }
  .pbtn:has(.pbtn-last) .title-row { padding-right: 3rem; }
  .title-row .pbtn-engrave {
    grid-area: auto;
    align-self: auto;
    padding-right: 0;
    flex-shrink: 1;
    min-width: 0;
  }
  .info-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px; height: 16px;
    flex-shrink: 0;
    font-family: var(--mono);
    font-size: 0.62rem;
    color: var(--label-dim);
    border: 1px solid var(--bezel-hi);
    background: var(--panel);
    border-radius: 50%;
    font-weight: 700;
    letter-spacing: 0;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    z-index: 3;
    position: relative;
  }
  .info-badge:hover { color: var(--led-cyan); border-color: var(--led-cyan); }

  .pbtn-desc {
    grid-area: desc;
    font-family: var(--sans);
    font-weight: 400;
    font-size: 0.68rem;
    letter-spacing: 0;
    color: var(--label-dim);
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .pbtn-last {
    position: absolute;
    top: 0.28rem;
    right: 1.4rem;
    font-family: var(--mono);
    font-size: 0.6rem;
    letter-spacing: 0.04em;
    color: var(--label-faint);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
  .pbtn-last.subtle { color: var(--label-faint); }

  /* primary lg variant */
  .pbtn.lg {
    min-height: 96px;
    padding: 0.7rem 0.9rem 0.85rem 0.7rem;
    grid-template-columns: 28px 1fr;
    column-gap: 0.7rem;
  }
  .pbtn.lg .pbtn-icon { width: 28px; height: 28px; }
  .pbtn.lg .pbtn-engrave { font-size: 0.82rem; }
  .pbtn.lg .pbtn-desc { font-size: 0.72rem; }
  .pbtn.lg .pbtn-last { font-size: 0.66rem; top: 0.4rem; right: 1.5rem; }

  /* ─── grids ─────────────────────────────────── */
  .btn-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 0.5rem;
  }
  .btn-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
  @media (max-width: 880px) { .btn-grid.cols-3 { grid-template-columns: 1fr; } }

  .row-2 {
    display: grid;
    grid-template-columns: 9fr 7fr;
    gap: 1.05rem;
  }
  .row-2.solo { grid-template-columns: 1fr; }
  .row-3 {
    display: grid;
    grid-template-columns: 4fr 3fr 5fr;
    gap: 1.05rem;
  }
  @media (max-width: 980px) {
    .row-2, .row-3 { grid-template-columns: 1fr; }
  }

  /* ─── MFD ──────────────────────────────────── */
  .mfd-row { /* this is the section wrapper variant — disambiguated below */ }
  .mfd-screen {
    background: var(--mfd-bg);
    border: 1px solid var(--bezel-lo);
    border-radius: 2px;
    padding: 0.4rem 0.55rem;
    font-family: var(--mono);
    font-size: 0.72rem;
    color: var(--mfd-text);
    letter-spacing: 0.04em;
    display: flex;
    flex-direction: column;
  }
  .mfd-screen .mfd-row {
    display: grid;
    grid-template-columns: 14px 1fr 70px 60px 14px 18px;
    align-items: center;
    gap: 0.65rem;
    padding: 0.32rem 0.25rem;
    background: none;
    border: none;
    text-align: left;
    border-radius: 1px;
  }
  .mfd-screen > .mfd-row + .mfd-row { border-top: 1px solid rgba(108, 212, 126, 0.10); }
  .mfd-screen .mfd-row:hover { background: rgba(108, 212, 126, 0.08); }
  .mfd-screen .mfd-row[disabled] { opacity: 0.5; cursor: default; }
  .mfd-screen .pre { color: var(--mfd-dim); }
  .mfd-screen .mfd-row:hover .pre { color: var(--mfd-text); }
  .mfd-screen .name {
    color: var(--mfd-text);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mfd-screen .name .cat { color: var(--mfd-dim); margin-right: 0.45rem; }
  .mfd-screen .diff {
    color: var(--mfd-dim);
    font-size: 0.62rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    background: none;
    border: none;
    border-radius: 0;
    padding: 0;
    display: inline;
  }
  .mfd-screen .score {
    color: var(--mfd-text);
    font-variant-numeric: tabular-nums;
    text-align: right;
    font-weight: 700;
  }
  .mfd-screen .mfd-row.good .score { color: var(--led-green); }
  .mfd-screen .mfd-row.bad-2 .score { color: var(--led-red); }
  .mfd-screen .chev { color: var(--mfd-dim); text-align: center; font-family: var(--mono); }
  .mfd-screen .mfd-row:hover .chev { color: var(--mfd-text); }

  .mfd-screen .resume-btn {
    display: contents;
    cursor: pointer;
  }
  .mfd-screen .del-btn {
    color: var(--mfd-dim);
    font-family: var(--mono);
    cursor: pointer;
    text-align: center;
    transition: color 0.13s;
  }
  .mfd-screen .del-btn:hover { color: var(--led-red); }

  .mfd-more {
    color: var(--mfd-dim);
    font-family: var(--mono);
    font-size: 0.62rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    padding: 0.4rem;
    text-align: center;
    border-top: 1px solid rgba(108, 212, 126, 0.10);
    background: none;
    margin-top: 0.2rem;
  }
  .mfd-more:hover { color: var(--mfd-text); }

  @media (max-width: 600px) {
    .mfd-screen .mfd-row { grid-template-columns: 14px 1fr 50px 14px 18px; }
    .mfd-screen .diff { display: none; }
  }

  /* ─── confirm modal ───────────────────────── */
  .cockpit-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }
  .cockpit-modal {
    width: 100%;
    max-width: 380px;
    padding: 1.4rem 1.2rem 1.1rem;
    background: var(--panel);
  }
  .ccm-title {
    font-family: var(--mono);
    font-size: 0.92rem;
    letter-spacing: 0.06em;
    color: var(--label);
    font-weight: 700;
    margin-bottom: 0.55rem;
  }
  .ccm-body {
    font-family: var(--sans);
    font-size: 0.82rem;
    color: var(--label-dim);
    line-height: 1.45;
    margin-bottom: 1.05rem;
  }
  .ccm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.45rem;
  }
  .ccm-btn {
    font-family: var(--mono);
    font-weight: 700;
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    padding: 0.5rem 1rem;
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    background: var(--panel-2);
    border-radius: 1px;
    cursor: pointer;
  }
  .ccm-btn:active {
    border-color: var(--bezel-lo);
    border-bottom-color: var(--bezel-hi);
    border-right-color: var(--bezel-hi);
  }
  .ccm-btn.cancel { color: var(--label-dim); }
  .ccm-btn.cancel:hover { color: var(--label); }
  .ccm-btn.danger { color: var(--led-red); }
  .ccm-btn.danger:hover { color: #ff9b9b; }
</style>
