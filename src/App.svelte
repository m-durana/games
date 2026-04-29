<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Home from './lib/Home.svelte';
  import Round from './lib/Round.svelte';
  import Results from './lib/Results.svelte';
  import Shared from './lib/Shared.svelte';
  import Stats from './lib/Stats.svelte';
  import Settings from './lib/Settings.svelte';
  import Browse from './lib/Browse.svelte';
  import SpeedRound from './lib/SpeedRound.svelte';
  import SpeedResults from './lib/SpeedResults.svelte';
  import AchievementToast from './lib/AchievementToast.svelte';
  import TailReview from './lib/TailReview.svelte';
  import LogoReview from './lib/LogoReview.svelte';
  import AircraftReview from './lib/AircraftReview.svelte';
  import MilitaryReview from './lib/MilitaryReview.svelte';
  import AirportReview from './lib/AirportReview.svelte';
  import MilitaryWordle from './lib/MilitaryWordle.svelte';
  import MilitaryIdentify from './lib/MilitaryIdentify.svelte';
  import AirportWordle from './lib/AirportWordle.svelte';
  import AirportIdentify from './lib/AirportIdentify.svelte';
  import ReviewLock from './lib/ReviewLock.svelte';
  import HistoryDetail from './lib/HistoryDetail.svelte';
  import AircraftWordle from './lib/AircraftWordle.svelte';
  import AircraftIdentify from './lib/AircraftIdentify.svelte';
  import AtcRound from './lib/AtcRound.svelte';
  import AtcResults from './lib/AtcResults.svelte';
  import AtcRadarRound from './lib/AtcRadarRound.svelte';
  import ClearedDirectRound from './lib/ClearedDirectRound.svelte';
  import InterceptRound from './lib/InterceptRound.svelte';
  import type { Difficulty, HistoryEntry, Mode, RoundResult } from './lib/types';
  import type { AtcMode, AtcRoundResult } from './lib/atc';
  import type { RadarRoundResult } from './lib/atc-radar';
  import type { ClearedRoundResult } from './lib/cleared-direct';
  import type { InterceptRoundResult } from './lib/intercepts';
  import { readSharedFromUrl, type SharedRound } from './lib/share';
  import type { Achievement } from './lib/achievements';
  import { evaluateAchievements } from './lib/achievements';
  import { loadSettings } from './lib/engine';

  type ReviewTarget = 'tails' | 'logos' | 'aircraft' | 'military' | 'airports';
  type View =
    | { kind: 'home' }
    | { kind: 'round'; mode: Mode; difficulty: Difficulty; daily: boolean; mixed?: boolean }
    | { kind: 'results'; mode: Mode; difficulty: Difficulty; daily: boolean; mixed?: boolean; results: RoundResult[] }
    | { kind: 'speed' }
    | { kind: 'speedResults'; score: number; isNewBest: boolean }
    | { kind: 'shared'; data: SharedRound }
    | { kind: 'stats' }
    | { kind: 'settings' }
    | { kind: 'browse' }
    | { kind: 'tailReview' }
    | { kind: 'logoReview' }
    | { kind: 'aircraftReview' }
    | { kind: 'militaryReview' }
    | { kind: 'airportReview' }
    | { kind: 'reviewLock'; target: ReviewTarget }
    | { kind: 'historyDetail'; entry: HistoryEntry }
    | { kind: 'aircraftWordle'; difficulty: Difficulty }
    | { kind: 'aircraftIdentify'; difficulty: Difficulty }
    | { kind: 'militaryWordle'; difficulty: Difficulty }
    | { kind: 'militaryIdentify'; difficulty: Difficulty }
    | { kind: 'airportWordle'; difficulty: Difficulty }
    | { kind: 'airportIdentify'; difficulty: Difficulty }
    | { kind: 'atcRound'; mode: AtcMode; difficulty: Difficulty }
    | { kind: 'atcRadarRound'; difficulty: Difficulty }
    | { kind: 'clearedRound'; difficulty: Difficulty }
    | { kind: 'interceptRound'; difficulty: Difficulty }
    | { kind: 'atcResults'; mode: AtcMode; difficulty: Difficulty; results: AtcRoundResult[] | RadarRoundResult[] | ClearedRoundResult[] | InterceptRoundResult[] };

  let view: View = $state({ kind: 'home' });
  let menuOpen = $state(false);
  let toastQueue: Achievement[] = $state([]);
  const REVIEW_AUTH_KEY = 'review-pin-ok';
  const REVIEW_PIN = import.meta.env.VITE_REVIEW_PIN || 'miro-review';

  function clearShareParam() {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.has('r')) {
      url.searchParams.delete('r');
      window.history.replaceState({}, '', url.toString());
    }
  }

  function start(mode: Mode, difficulty: Difficulty) {
    clearShareParam();
    menuOpen = false;
    view = { kind: 'round', mode, difficulty, daily: false };
  }

  function startDaily() {
    clearShareParam();
    menuOpen = false;
    view = { kind: 'round', mode: 'group', difficulty: 'medium', daily: true };
  }

  function startMix() {
    clearShareParam();
    menuOpen = false;
    view = { kind: 'round', mode: 'group', difficulty: 'medium', daily: false, mixed: true };
  }

  function startSpeed() {
    clearShareParam();
    menuOpen = false;
    view = { kind: 'speed' };
  }

  function startAircraftWordle(difficulty: Difficulty) {
    clearShareParam();
    menuOpen = false;
    view = { kind: 'aircraftWordle', difficulty };
  }

  function startAircraftIdentify(difficulty: Difficulty) {
    clearShareParam();
    menuOpen = false;
    view = { kind: 'aircraftIdentify', difficulty };
  }

  function startMilitaryWordle(difficulty: Difficulty) {
    clearShareParam();
    menuOpen = false;
    view = { kind: 'militaryWordle', difficulty };
  }

  function startMilitaryIdentify(difficulty: Difficulty) {
    clearShareParam();
    menuOpen = false;
    view = { kind: 'militaryIdentify', difficulty };
  }

  function startAirportWordle(difficulty: Difficulty) {
    clearShareParam();
    menuOpen = false;
    view = { kind: 'airportWordle', difficulty };
  }

  function startAirportIdentify(difficulty: Difficulty) {
    clearShareParam();
    menuOpen = false;
    view = { kind: 'airportIdentify', difficulty };
  }

  function startAtc(mode: AtcMode, difficulty: Difficulty) {
    clearShareParam();
    menuOpen = false;
    if (mode === 'radar') view = { kind: 'atcRadarRound', difficulty };
    else if (mode === 'cleared') view = { kind: 'clearedRound', difficulty };
    else if (mode === 'intercept') view = { kind: 'interceptRound', difficulty };
    else view = { kind: 'atcRound', mode, difficulty };
  }

  function finishStandard(mode: Mode, difficulty: Difficulty, daily: boolean, mixed: boolean, results: RoundResult[]) {
    view = { kind: 'results', mode, difficulty, daily, mixed, results };
  }

  function finishAtc(mode: AtcMode, difficulty: Difficulty, results: AtcRoundResult[]) {
    view = { kind: 'atcResults', mode, difficulty, results };
  }

  function finishRadar(difficulty: Difficulty, results: RadarRoundResult[]) {
    view = { kind: 'atcResults', mode: 'radar', difficulty, results };
  }

  function finishCleared(difficulty: Difficulty, results: ClearedRoundResult[]) {
    view = { kind: 'atcResults', mode: 'cleared', difficulty, results };
  }

  function finishIntercept(difficulty: Difficulty, results: InterceptRoundResult[]) {
    view = { kind: 'atcResults', mode: 'intercept', difficulty, results };
  }

  function finishSpeed(score: number, isNewBest: boolean) {
    const newAchs = evaluateAchievements();
    if (newAchs.length > 0) toastQueue = [...toastQueue, ...newAchs];
    view = { kind: 'speedResults', score, isNewBest };
  }

  function home() {
    clearShareParam();
    menuOpen = false;
    view = { kind: 'home' };
  }

  function showStats() { menuOpen = false; view = { kind: 'stats' }; }
  function showSettings() { menuOpen = false; view = { kind: 'settings' }; }
  function showBrowse() { menuOpen = false; view = { kind: 'browse' }; }

  function reviewView(target: ReviewTarget): View {
    if (target === 'logos') return { kind: 'logoReview' };
    if (target === 'aircraft') return { kind: 'aircraftReview' };
    if (target === 'military') return { kind: 'militaryReview' };
    if (target === 'airports') return { kind: 'airportReview' };
    return { kind: 'tailReview' };
  }

  function isReviewUnlocked() {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(REVIEW_AUTH_KEY) === '1';
  }

  function openReview(target: ReviewTarget) {
    clearShareParam();
    menuOpen = false;
    view = isReviewUnlocked() ? reviewView(target) : { kind: 'reviewLock', target };
  }

  function unlockReview(target: ReviewTarget, pin: string) {
    if (pin !== REVIEW_PIN) return false;
    localStorage.setItem(REVIEW_AUTH_KEY, '1');
    view = reviewView(target);
    return true;
  }

  function onAchievements(a: Achievement[]) {
    toastQueue = [...toastQueue, ...a];
  }

  function clearToast() {
    toastQueue = toastQueue.slice(1);
  }

  // ---- Hash routing ----------------------------------------------------------
  const ROUND_MODES: Mode[] = [
    'group','alliance','hub','logo','country','reverseGroup','tail',
    'airportAirline','airlineDest','airportConn','code','whereAmI','hubOf',
  ];
  const DIFFS: Difficulty[] = ['easy','medium','hard'];
  const ATC_MODES: AtcMode[] = ['callsign','decode','compose','atcMix','radar','cleared','intercept'];

  function viewHash(v: View): string | null {
    switch (v.kind) {
      case 'home': return '';
      case 'round':
        if (v.daily) return '#/daily';
        if (v.mixed) return '#/mix';
        return `#/${v.mode}?difficulty=${v.difficulty}`;
      case 'speed': return '#/speed';
      case 'stats': return '#/stats';
      case 'settings': return '#/settings';
      case 'browse': return '#/liveries';
      case 'aircraftWordle': return `#/aircraft-wordle?difficulty=${v.difficulty}`;
      case 'aircraftIdentify': return `#/aircraft-identify?difficulty=${v.difficulty}`;
      case 'militaryWordle': return `#/military-wordle?difficulty=${v.difficulty}`;
      case 'militaryIdentify': return `#/military-identify?difficulty=${v.difficulty}`;
      case 'airportWordle': return `#/airport-wordle?difficulty=${v.difficulty}`;
      case 'airportIdentify': return `#/airport-identify?difficulty=${v.difficulty}`;
      case 'atcRound': return `#/atc/${v.mode}?difficulty=${v.difficulty}`;
      case 'atcRadarRound': return `#/atc/radar?difficulty=${v.difficulty}`;
      case 'clearedRound': return `#/atc/cleared?difficulty=${v.difficulty}`;
      case 'interceptRound': return `#/atc/intercept?difficulty=${v.difficulty}`;
      default: return null; // results / shared / review screens don't deep-link
    }
  }

  function parseHash(hash: string): View | null {
    let h = hash.replace(/^#\/?/, '');
    if (!h) return { kind: 'home' };
    let qs = '';
    const qIdx = h.indexOf('?');
    if (qIdx >= 0) {
      qs = h.slice(qIdx + 1);
      h = h.slice(0, qIdx);
    }
    const params = new URLSearchParams(qs);
    const rawDiff = params.get('difficulty');
    const d: Difficulty | null = DIFFS.includes(rawDiff as Difficulty) ? (rawDiff as Difficulty) : null;
    const [a, b] = h.split('/');

    if (a === 'daily') return { kind: 'round', mode: 'group', difficulty: 'medium', daily: true };
    if (a === 'mix') return { kind: 'round', mode: 'group', difficulty: 'medium', daily: false, mixed: true };
    if (a === 'speed') return { kind: 'speed' };
    if (a === 'stats') return { kind: 'stats' };
    if (a === 'settings') return { kind: 'settings' };
    if (a === 'liveries') return { kind: 'browse' };
    if (a === 'atc' && ATC_MODES.includes(b as AtcMode) && d) {
      if (b === 'radar') return { kind: 'atcRadarRound', difficulty: d };
      if (b === 'cleared') return { kind: 'clearedRound', difficulty: d };
      if (b === 'intercept') return { kind: 'interceptRound', difficulty: d };
      return { kind: 'atcRound', mode: b as AtcMode, difficulty: d };
    }
    if (d) {
      if (a === 'aircraft-wordle') return { kind: 'aircraftWordle', difficulty: d };
      if (a === 'aircraft-identify') return { kind: 'aircraftIdentify', difficulty: d };
      if (a === 'military-wordle') return { kind: 'militaryWordle', difficulty: d };
      if (a === 'military-identify') return { kind: 'militaryIdentify', difficulty: d };
      if (a === 'airport-wordle') return { kind: 'airportWordle', difficulty: d };
      if (a === 'airport-identify') return { kind: 'airportIdentify', difficulty: d };
      if (ROUND_MODES.includes(a as Mode)) {
        return { kind: 'round', mode: a as Mode, difficulty: d, daily: false };
      }
    }
    return null;
  }

  $effect(() => {
    const target = viewHash(view);
    if (target === null || typeof window === 'undefined') return;
    const cur = window.location.hash;
    if (cur === target) return;
    untrack(() => {
      const url = target === ''
        ? window.location.pathname + window.location.search
        : window.location.pathname + window.location.search + target;
      history.pushState({}, '', url);
    });
  });

  onMount(() => {
    document.documentElement.dataset.theme = loadSettings().darkMode ? 'dark' : 'light';
    const shared = readSharedFromUrl();
    if (shared) view = { kind: 'shared', data: shared };
    if (typeof window !== 'undefined') {
      const params = new URL(window.location.href).searchParams;
      const review = params.get('review');
      if (params.get('pin') === REVIEW_PIN) localStorage.setItem(REVIEW_AUTH_KEY, '1');
      if (review === 'airport') openReview('airports');
      if (review === 'tails' || review === 'logos' || review === 'aircraft' || review === 'military' || review === 'airports') openReview(review);
      // Restore view from URL hash on first load (e.g. someone opens a deep link).
      // Skip if a shared round or review screen already claimed the view.
      if (view.kind === 'home' && window.location.hash) {
        const fromHash = parseHash(window.location.hash);
        if (fromHash) view = fromHash;
      }
      const onPop = () => {
        const v = parseHash(window.location.hash);
        if (v) view = v;
      };
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }
  });
</script>

<AchievementToast queue={toastQueue} onClear={clearToast} />

<main class="shell">
  <div class="brand">
    <div class="brand-left">
      <a href="/">← miro.build</a>
    </div>
    <div class="brand-center">Airline Trivia</div>
    <div class="brand-right">
      {#if view.kind === 'home'}
        <button class="menu-btn" onclick={() => (menuOpen = !menuOpen)} aria-label="Menu" aria-expanded={menuOpen}>
          ⋯
        </button>
        {#if menuOpen}
          <div class="menu" role="menu">
            <button onclick={showBrowse}>Liveries</button>
            <button onclick={showStats}>Stats</button>
            <button onclick={showSettings}>Settings</button>
          </div>
        {/if}
      {/if}
      {#if view.kind === 'home'}
        <span class="crumb">games</span>
      {:else}
        <button class="crumb crumb-btn" type="button" onclick={home} aria-label="Game home" title="Game home">← games</button>
      {/if}
    </div>
  </div>

  {#if view.kind === 'home'}
    <Home
      onStart={start}
      onStartDaily={startDaily}
      onStartSpeed={startSpeed}
      onStartMix={startMix}
      onStartAircraftWordle={startAircraftWordle}
      onStartAircraftIdentify={startAircraftIdentify}
      onStartMilitaryWordle={startMilitaryWordle}
      onStartMilitaryIdentify={startMilitaryIdentify}
      onStartAirportWordle={startAirportWordle}
      onStartAirportIdentify={startAirportIdentify}
      onStartAtc={startAtc}
      onOpenHistory={(entry) => { menuOpen = false; view = { kind: 'historyDetail', entry }; }}
    />
  {:else if view.kind === 'round'}
    {@const v = view}
    <Round
      mode={v.mode}
      difficulty={v.difficulty}
      daily={v.daily}
      mixed={v.mixed ?? false}
      onFinish={(r) => finishStandard(v.mode, v.difficulty, v.daily, v.mixed ?? false, r)}
      onQuit={home}
    />
  {:else if view.kind === 'results'}
    {@const v = view}
    <Results
      mode={v.mode}
      difficulty={v.difficulty}
      daily={v.daily}
      mixed={v.mixed ?? false}
      results={v.results}
      onAgain={() => (v.mixed ? startMix() : start(v.mode, v.difficulty))}
      onHome={home}
      {onAchievements}
    />
  {:else if view.kind === 'speed'}
    <SpeedRound onFinish={finishSpeed} onQuit={home} />
  {:else if view.kind === 'speedResults'}
    {@const v = view}
    <SpeedResults score={v.score} isNewBest={v.isNewBest} onAgain={startSpeed} onHome={home} />
  {:else if view.kind === 'shared'}
    <Shared data={view.data} onHome={home} />
  {:else if view.kind === 'stats'}
    <Stats onHome={home} />
  {:else if view.kind === 'settings'}
    <Settings onHome={home} />
  {:else if view.kind === 'tailReview'}
    <TailReview onHome={home} />
  {:else if view.kind === 'logoReview'}
    <LogoReview onHome={home} />
  {:else if view.kind === 'aircraftReview'}
    <AircraftReview onHome={home} />
  {:else if view.kind === 'militaryReview'}
    <MilitaryReview onHome={home} />
  {:else if view.kind === 'airportReview'}
    <AirportReview onHome={home} />
  {:else if view.kind === 'reviewLock'}
    {@const v = view}
    <ReviewLock
      label={v.target === 'logos' ? 'Logo review' : v.target === 'aircraft' ? 'Aircraft photo review' : v.target === 'military' ? 'Military photo review' : v.target === 'airports' ? 'Airport photo review' : 'Tail review'}
      onUnlock={(pin) => unlockReview(v.target, pin)}
      onHome={home}
    />
  {:else if view.kind === 'historyDetail'}
    <HistoryDetail entry={view.entry} onHome={home} />
  {:else if view.kind === 'aircraftWordle'}
    <AircraftWordle difficulty={view.difficulty} onHome={home} />
  {:else if view.kind === 'aircraftIdentify'}
    <AircraftIdentify difficulty={view.difficulty} onHome={home} />
  {:else if view.kind === 'militaryWordle'}
    <MilitaryWordle difficulty={view.difficulty} onHome={home} />
  {:else if view.kind === 'militaryIdentify'}
    <MilitaryIdentify difficulty={view.difficulty} onHome={home} />
  {:else if view.kind === 'airportWordle'}
    <AirportWordle difficulty={view.difficulty} onHome={home} />
  {:else if view.kind === 'airportIdentify'}
    <AirportIdentify difficulty={view.difficulty} onHome={home} />
  {:else if view.kind === 'atcRound'}
    {@const v = view}
    <AtcRound
      mode={v.mode}
      difficulty={v.difficulty}
      onFinish={(r) => finishAtc(v.mode, v.difficulty, r)}
      onQuit={home}
    />
  {:else if view.kind === 'atcRadarRound'}
    {@const v = view}
    <AtcRadarRound
      difficulty={v.difficulty}
      onFinish={(r) => finishRadar(v.difficulty, r)}
      onQuit={home}
    />
  {:else if view.kind === 'clearedRound'}
    {@const v = view}
    <ClearedDirectRound
      difficulty={v.difficulty}
      onFinish={(r) => finishCleared(v.difficulty, r)}
      onQuit={home}
    />
  {:else if view.kind === 'interceptRound'}
    {@const v = view}
    <InterceptRound
      difficulty={v.difficulty}
      onFinish={(r) => finishIntercept(v.difficulty, r)}
      onQuit={home}
    />
  {:else if view.kind === 'atcResults'}
    {@const v = view}
    <AtcResults
      mode={v.mode}
      difficulty={v.difficulty}
      results={v.results}
      onAgain={() => startAtc(v.mode, v.difficulty)}
      onHome={home}
    />
  {:else}
    <Browse onHome={home} />
  {/if}
</main>

<style>
  .brand-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
  }
  .brand-center {
    flex: 0 0 auto;
    font-family: var(--font-main);
    font-size: 1rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--accent);
    text-align: center;
  }
  .crumb-btn {
    background: none;
    border: 1px solid rgba(39, 76, 119, 0.28);
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .crumb-btn:hover {
    border-color: var(--accent);
    background: var(--surface-2);
  }
  .crumb-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 2px;
  }
  .brand-right {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    position: relative;
    flex: 1;
    justify-content: flex-end;
  }
  .menu-btn {
    width: 30px;
    height: 30px;
    border-radius: 3px;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--muted);
    font-family: var(--font-main);
    font-size: 1.125rem;
    line-height: 1;
    transition: color 0.15s, border-color 0.15s;
  }
  .menu-btn:hover { color: var(--accent); border-color: var(--panel-line); }
  .menu {
    position: absolute;
    top: calc(100% + 0.4rem);
    right: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.25rem;
    display: flex;
    flex-direction: column;
    min-width: 140px;
    z-index: 50;
    box-shadow: var(--shadow);
  }
  .menu button {
    text-align: left;
    padding: 0.625rem 0.875rem;
    border-radius: 3px;
    font-size: 0.875rem;
    color: var(--text);
    background: none;
    transition: background 0.12s;
  }
  .menu button:hover { background: var(--surface-2); color: var(--accent); }
</style>
