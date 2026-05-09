<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Home from './lib/Home.svelte';
  import Round from './lib/Round.svelte';
  import AchievementToast from './lib/AchievementToast.svelte';
  import { getIntro } from './lib/intros';
  // Non-Home routes are lazy: only Home + Round are eager so first paint stays small.
  const ResultsLazy = () => import('./lib/Results.svelte');
  const SharedLazy = () => import('./lib/Shared.svelte');
  const StatsLazy = () => import('./lib/Stats.svelte');
  const SettingsLazy = () => import('./lib/Settings.svelte');
  const BrowseLazy = () => import('./lib/Browse.svelte');
  const SpeedRoundLazy = () => import('./lib/SpeedRound.svelte');
  const SpeedResultsLazy = () => import('./lib/SpeedResults.svelte');
  const TailReviewLazy = () => import('./lib/TailReview.svelte');
  const LogoReviewLazy = () => import('./lib/LogoReview.svelte');
  const AircraftReviewLazy = () => import('./lib/AircraftReview.svelte');
  const MilitaryReviewLazy = () => import('./lib/MilitaryReview.svelte');
  const AirportReviewLazy = () => import('./lib/AirportReview.svelte');
  const MilitaryWordleLazy = () => import('./lib/MilitaryWordle.svelte');
  const MilitaryIdentifyLazy = () => import('./lib/MilitaryIdentify.svelte');
  const AirportWordleLazy = () => import('./lib/AirportWordle.svelte');
  const AirportIdentifyLazy = () => import('./lib/AirportIdentify.svelte');
  const ReviewLockLazy = () => import('./lib/ReviewLock.svelte');
  const HistoryDetailLazy = () => import('./lib/HistoryDetail.svelte');
  const AircraftWordleLazy = () => import('./lib/AircraftWordle.svelte');
  const AircraftIdentifyLazy = () => import('./lib/AircraftIdentify.svelte');
  const IntroLazy = () => import('./lib/Intro.svelte');
  const IntroImageReviewLazy = () => import('./lib/IntroImageReview.svelte');
  const AtcRoundLazy = () => import('./lib/AtcRound.svelte');
  const AtcResultsLazy = () => import('./lib/AtcResults.svelte');
  // Radarscope/instrument-heavy routes are loaded lazily so the Home bundle
  // doesn't pull in the full PFD widget set on first paint.
  const AtcRadarRoundLazy = () => import('./lib/AtcRadarRound.svelte');
  const ClearedDirectRoundLazy = () => import('./lib/ClearedDirectRound.svelte');
  const SequencingRoundLazy = () => import('./lib/SequencingRound.svelte');
  const InterceptStableRoundLazy = () => import('./lib/InterceptStableRound.svelte');
  const InterceptMinimumsRoundLazy = () => import('./lib/InterceptMinimumsRound.svelte');
  const InterceptFmaRoundLazy = () => import('./lib/InterceptFmaRound.svelte');
  const PfdLabLazy = () => import('./lib/PfdLab.svelte');
  import type { Difficulty, HistoryEntry, Mode, RoundResult } from './lib/types';
  import type { AtcMode, AtcRoundResult } from './lib/atc';
  import type { RadarRoundResult } from './lib/atc-radar';
  import type { ClearedRoundResult } from './lib/cleared-direct';
  import type { SequenceRoundResult } from './lib/sequencing';
  import type { InterceptStableResult } from './lib/intercept-stable';
  import type { InterceptMinimumsResult } from './lib/intercept-minimums';
  import type { InterceptFmaResult } from './lib/intercept-fma';
  import { readSharedFromUrl, type SharedRound } from './lib/share';
  import type { Achievement } from './lib/achievements';
  import { evaluateAchievements } from './lib/achievements';
  import { loadSettings } from './lib/engine';
  import {
    clearProgress,
    getProgress,
    listProgress,
    progressKey,
    type ProgressEntry,
  } from './lib/progress';

  type ReviewTarget = 'tails' | 'logos' | 'aircraft' | 'military' | 'airports' | 'introImages';
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
    | { kind: 'introImageReview' }
    | { kind: 'reviewLock'; target: ReviewTarget }
    | { kind: 'historyDetail'; entry: HistoryEntry }
    | { kind: 'aircraftWordle'; difficulty: Difficulty }
    | { kind: 'aircraftIdentify'; difficulty: Difficulty }
    | { kind: 'militaryWordle'; difficulty: Difficulty }
    | { kind: 'militaryIdentify'; difficulty: Difficulty }
    | { kind: 'airportWordle'; difficulty: Difficulty }
    | { kind: 'airportIdentify'; difficulty: Difficulty }
    | { kind: 'atcRound'; mode: AtcMode; difficulty: Difficulty }
    | { kind: 'atcRadarRound'; radarMode: 'conflict'; difficulty: Difficulty }
    | { kind: 'clearedRound'; difficulty: Difficulty }
    | { kind: 'sequenceRound'; difficulty: Difficulty }
    | { kind: 'interceptStableRound'; difficulty: Difficulty }
    | { kind: 'interceptMinimumsRound'; difficulty: Difficulty }
    | { kind: 'interceptFmaRound'; difficulty: Difficulty }
    | { kind: 'atcResults'; mode: AtcMode; difficulty: Difficulty; results: AtcRoundResult[] | RadarRoundResult[] | ClearedRoundResult[] | SequenceRoundResult[] | InterceptStableResult[] | InterceptMinimumsResult[] | InterceptFmaResult[] }
    | { kind: 'intro'; intro: IntroKey; difficulty: Difficulty }
    | { kind: 'pfdLab' };

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

  const INTRO_TITLES: Record<IntroKey, string> = {
    aircraftIdentify: 'Aircraft Identify · Field guide',
    militaryIdentify: 'Military Identify · Field guide',
    atcDecode: 'Decode ATC · Phraseology primer',
    atcCompose: 'Readback Builder · How readbacks work',
    atcCleared: 'Cleared Direct · Bearings & headings',
    radarConflict: 'Conflict Spot · Reading the scope',
    radarSequence: 'Sequencing · Order them onto the runway',
    interceptStable: 'Stable or Go-around · The 1000 ft gate',
    interceptMinimums: 'At Minimums · The DA call',
    interceptFma: 'FMA Watch · CAT IIIb autoland',
  };

  function introSlides(key: IntroKey) {
    return getIntro(key);
  }

  function startFromIntro(key: IntroKey, d: Difficulty) {
    switch (key) {
      case 'aircraftIdentify': startAircraftIdentify(d); return;
      case 'militaryIdentify': startMilitaryIdentify(d); return;
      case 'atcDecode': startAtc('decode', d); return;
      case 'atcCompose': startAtc('compose', d); return;
      case 'atcCleared': startAtc('cleared', d); return;
      case 'radarConflict': startAtc('conflict', d); return;
      case 'radarSequence': startAtc('sequence', d); return;
      case 'interceptStable': startAtc('interceptStable', d); return;
      case 'interceptMinimums': startAtc('interceptMinimums', d); return;
      case 'interceptFma': startAtc('interceptFma', d); return;
    }
  }

  function openIntro(key: IntroKey, d: Difficulty) {
    clearShareParam();
    menuOpen = false;
    view = { kind: 'intro', intro: key, difficulty: d };
  }

  let view: View = $state({ kind: 'home' });
  let menuOpen = $state(false);
  let toastQueue: Achievement[] = $state([]);
  let pendingStart: { entry: ProgressEntry; proceed: () => void } | null = $state(null);

  function maybeStart(key: string, proceed: () => void) {
    const entry = getProgress(key);
    if (entry && entry.currentIndex < entry.total) {
      pendingStart = { entry, proceed };
    } else {
      proceed();
    }
  }

  function resumePending() {
    const p = pendingStart;
    pendingStart = null;
    if (p) p.proceed();
  }

  function startOverPending() {
    const p = pendingStart;
    pendingStart = null;
    if (!p) return;
    clearProgress(p.entry.key);
    p.proceed();
  }

  function cancelPending() {
    pendingStart = null;
  }
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
    maybeStart(progressKey('standard', difficulty, mode), () => {
      clearShareParam();
      menuOpen = false;
      view = { kind: 'round', mode, difficulty, daily: false };
    });
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
    maybeStart(progressKey('aircraftIdentify', difficulty), () => {
      clearShareParam();
      menuOpen = false;
      view = { kind: 'aircraftIdentify', difficulty };
    });
  }

  function startMilitaryWordle(difficulty: Difficulty) {
    clearShareParam();
    menuOpen = false;
    view = { kind: 'militaryWordle', difficulty };
  }

  function startMilitaryIdentify(difficulty: Difficulty) {
    maybeStart(progressKey('militaryIdentify', difficulty), () => {
      clearShareParam();
      menuOpen = false;
      view = { kind: 'militaryIdentify', difficulty };
    });
  }

  function startAirportWordle(difficulty: Difficulty) {
    clearShareParam();
    menuOpen = false;
    view = { kind: 'airportWordle', difficulty };
  }

  function startAirportIdentify(difficulty: Difficulty) {
    maybeStart(progressKey('airportIdentify', difficulty), () => {
      clearShareParam();
      menuOpen = false;
      view = { kind: 'airportIdentify', difficulty };
    });
  }

  function atcProgressKey(mode: AtcMode, difficulty: Difficulty): string {
    if (mode === 'conflict') return progressKey('radar', difficulty, mode);
    if (mode === 'sequence') return progressKey('sequence', difficulty);
    if (mode === 'cleared') return progressKey('cleared', difficulty);
    if (mode === 'interceptStable') return progressKey('interceptStable', difficulty);
    if (mode === 'interceptMinimums') return progressKey('interceptMinimums', difficulty);
    if (mode === 'interceptFma') return progressKey('interceptFma', difficulty);
    return progressKey('atc', difficulty, mode);
  }

  function startAtc(mode: AtcMode, difficulty: Difficulty) {
    maybeStart(atcProgressKey(mode, difficulty), () => {
      clearShareParam();
      menuOpen = false;
      if (mode === 'conflict') view = { kind: 'atcRadarRound', radarMode: 'conflict', difficulty };
      else if (mode === 'sequence') view = { kind: 'sequenceRound', difficulty };
      else if (mode === 'cleared') view = { kind: 'clearedRound', difficulty };
      else if (mode === 'interceptStable') view = { kind: 'interceptStableRound', difficulty };
      else if (mode === 'interceptMinimums') view = { kind: 'interceptMinimumsRound', difficulty };
      else if (mode === 'interceptFma') view = { kind: 'interceptFmaRound', difficulty };
      else view = { kind: 'atcRound', mode, difficulty };
    });
  }

  function resumeFromEntry(entry: ProgressEntry) {
    clearShareParam();
    menuOpen = false;
    const d = entry.difficulty as Difficulty;
    switch (entry.gameKind) {
      case 'standard':
        view = { kind: 'round', mode: entry.mode as Mode, difficulty: d, daily: false };
        return;
      case 'aircraftIdentify':
        view = { kind: 'aircraftIdentify', difficulty: d };
        return;
      case 'militaryIdentify':
        view = { kind: 'militaryIdentify', difficulty: d };
        return;
      case 'airportIdentify':
        view = { kind: 'airportIdentify', difficulty: d };
        return;
      case 'atc':
        view = { kind: 'atcRound', mode: entry.mode as AtcMode, difficulty: d };
        return;
      case 'radar':
        view = { kind: 'atcRadarRound', radarMode: 'conflict', difficulty: d };
        return;
      case 'cleared':
        view = { kind: 'clearedRound', difficulty: d };
        return;
      case 'sequence':
        view = { kind: 'sequenceRound', difficulty: d };
        return;
      case 'interceptStable':
        view = { kind: 'interceptStableRound', difficulty: d };
        return;
      case 'interceptMinimums':
        view = { kind: 'interceptMinimumsRound', difficulty: d };
        return;
      case 'interceptFma':
        view = { kind: 'interceptFmaRound', difficulty: d };
        return;
    }
  }

  function finishStandard(mode: Mode, difficulty: Difficulty, daily: boolean, mixed: boolean, results: RoundResult[]) {
    view = { kind: 'results', mode, difficulty, daily, mixed, results };
  }

  function finishAtc(mode: AtcMode, difficulty: Difficulty, results: AtcRoundResult[]) {
    view = { kind: 'atcResults', mode, difficulty, results };
  }

  function finishRadar(difficulty: Difficulty, results: RadarRoundResult[]) {
    view = { kind: 'atcResults', mode: 'conflict', difficulty, results };
  }

  function finishCleared(difficulty: Difficulty, results: ClearedRoundResult[]) {
    view = { kind: 'atcResults', mode: 'cleared', difficulty, results };
  }

  function finishSequence(difficulty: Difficulty, results: SequenceRoundResult[]) {
    view = { kind: 'atcResults', mode: 'sequence', difficulty, results };
  }

  function finishInterceptStable(difficulty: Difficulty, results: InterceptStableResult[]) {
    view = { kind: 'atcResults', mode: 'interceptStable', difficulty, results };
  }
  function finishInterceptMinimums(difficulty: Difficulty, results: InterceptMinimumsResult[]) {
    view = { kind: 'atcResults', mode: 'interceptMinimums', difficulty, results };
  }
  function finishInterceptFma(difficulty: Difficulty, results: InterceptFmaResult[]) {
    view = { kind: 'atcResults', mode: 'interceptFma', difficulty, results };
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
    if (target === 'introImages') return { kind: 'introImageReview' };
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
  const ATC_MODES: AtcMode[] = ['callsign','decode','compose','atcMix','cleared','conflict','sequence','interceptStable','interceptMinimums','interceptFma'];

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
      case 'atcRadarRound': return `#/atc/${v.radarMode}?difficulty=${v.difficulty}`;
      case 'clearedRound': return `#/atc/cleared?difficulty=${v.difficulty}`;
      case 'sequenceRound': return `#/atc/sequence?difficulty=${v.difficulty}`;
      case 'interceptStableRound': return `#/atc/interceptStable?difficulty=${v.difficulty}`;
      case 'interceptMinimumsRound': return `#/atc/interceptMinimums?difficulty=${v.difficulty}`;
      case 'interceptFmaRound': return `#/atc/interceptFma?difficulty=${v.difficulty}`;
      case 'pfdLab': return '#/pfd-lab';
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
    if (a === 'pfd-lab') return { kind: 'pfdLab' };
    if (a === 'atc' && ATC_MODES.includes(b as AtcMode) && d) {
      if (b === 'conflict') return { kind: 'atcRadarRound', radarMode: 'conflict', difficulty: d };
      if (b === 'sequence') return { kind: 'sequenceRound', difficulty: d };
      if (b === 'cleared') return { kind: 'clearedRound', difficulty: d };
      if (b === 'interceptStable') return { kind: 'interceptStableRound', difficulty: d };
      if (b === 'interceptMinimums') return { kind: 'interceptMinimumsRound', difficulty: d };
      if (b === 'interceptFma') return { kind: 'interceptFmaRound', difficulty: d };
      return { kind: 'atcRound', mode: b as AtcMode, difficulty: d };
    }
    // Retired modes redirect to FMA Watch (closest surviving relative).
    if (a === 'atc' && (b === 'interceptDiamonds' || b === 'shift') && d) {
      return { kind: 'interceptFmaRound', difficulty: d };
    }
    // Legacy: redirect old #/atc/radar, #/atc/direct, #/atc/intercept links.
    if (a === 'atc' && (b === 'radar' || b === 'direct') && d) {
      return { kind: 'atcRadarRound', radarMode: 'conflict', difficulty: d };
    }
    if (a === 'atc' && b === 'intercept' && d) {
      // The old top-down Intercept mode is retired; route to its instrument-driven successor.
      return { kind: 'interceptStableRound', difficulty: d };
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
    // Sweep stale registry entries from retired modes (e.g. 'wake') so they
    // don't appear in the in-progress list after deploys that cut the mode.
    if (typeof localStorage !== 'undefined') {
      const valid = new Set([
        'standard','aircraftIdentify','militaryIdentify','airportIdentify',
        'atc','radar','cleared','sequence',
        'interceptStable','interceptMinimums','interceptFma',
      ]);
      for (const e of listProgress()) {
        // Drop registry entries from retired gameKinds (vector/resolve/depart/intercept),
        // and the retired 'direct' radar mode whose sessionStorageKey contains
        // ':direct:'. Surviving entries from kinds we still ship pass through.
        const isRetiredDirect = e.gameKind === 'radar' && e.mode === 'direct';
        if (!valid.has(e.gameKind) || isRetiredDirect) clearProgress(e.key);
      }
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith('session:wake:') ||
            k.startsWith('session:vector:') ||
            k.startsWith('session:resolve:') ||
            k.startsWith('session:depart:') ||
            k.startsWith('session:radar:direct:') ||
            k.startsWith('session:intercept:') ||
            k.startsWith('session:interceptDiamonds:') ||
            k.startsWith('session:shift:')) {
          localStorage.removeItem(k);
        }
      }
    }
    const shared = readSharedFromUrl();
    if (shared) view = { kind: 'shared', data: shared };
    if (typeof window !== 'undefined') {
      const params = new URL(window.location.href).searchParams;
      const review = params.get('review');
      if (params.get('pin') === REVIEW_PIN) localStorage.setItem(REVIEW_AUTH_KEY, '1');
      if (review === 'airport') openReview('airports');
      if (review === 'tails' || review === 'logos' || review === 'aircraft' || review === 'military' || review === 'airports' || review === 'introImages') openReview(review);
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
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && pendingStart) cancelPending();
      };
      window.addEventListener('popstate', onPop);
      window.addEventListener('keydown', onKey);
      return () => {
        window.removeEventListener('popstate', onPop);
        window.removeEventListener('keydown', onKey);
      };
    }
  });
</script>

<AchievementToast queue={toastQueue} onClear={clearToast} />

<main class="shell">
  <div class="brand">
    <div class="brand-left">
      {#if view.kind === 'home'}
        <span class="crumb">Flight Deck</span>
      {:else}
        <button class="crumb crumb-btn" type="button" onclick={home} aria-label="Flight Deck home" title="Flight Deck home"><span class="back-arrow" aria-hidden="true">←</span> Flight Deck</button>
      {/if}
    </div>
    <div class="brand-right">
      {#if view.kind === 'home'}
        <button class="icon-btn" onclick={() => (menuOpen = !menuOpen)} aria-label="Menu" aria-expanded={menuOpen}>
          <img src="https://unpkg.com/lucide-static@0.469.0/icons/settings.svg" alt="" aria-hidden="true" />
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
        <a class="up-link mockup-link" href="/games/flight-deck/mockup/" title="Preview design mockup">mockup →</a>
      {/if}
      <a class="up-link" href="/"><span aria-hidden="true">←</span> miro.build</a>
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
      onOpenIntro={openIntro}
      onOpenHistory={(entry) => { menuOpen = false; view = { kind: 'historyDetail', entry }; }}
      onResumeProgress={resumeFromEntry}
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
    {#await ResultsLazy() then m}
      {@const C = m.default}
      <C
        mode={v.mode}
        difficulty={v.difficulty}
        daily={v.daily}
        mixed={v.mixed ?? false}
        results={v.results}
        onAgain={() => (v.mixed ? startMix() : start(v.mode, v.difficulty))}
        onHome={home}
        {onAchievements}
      />
    {/await}
  {:else if view.kind === 'speed'}
    {#await SpeedRoundLazy() then m}
      {@const C = m.default}
      <C onFinish={finishSpeed} onQuit={home} />
    {/await}
  {:else if view.kind === 'speedResults'}
    {@const v = view}
    {#await SpeedResultsLazy() then m}
      {@const C = m.default}
      <C score={v.score} isNewBest={v.isNewBest} onAgain={startSpeed} onHome={home} />
    {/await}
  {:else if view.kind === 'shared'}
    {#await SharedLazy() then m}
      {@const C = m.default}
      <C data={view.data} onHome={home} />
    {/await}
  {:else if view.kind === 'stats'}
    {#await StatsLazy() then m}
      {@const C = m.default}
      <C onHome={home} />
    {/await}
  {:else if view.kind === 'settings'}
    {#await SettingsLazy() then m}
      {@const C = m.default}
      <C onHome={home} />
    {/await}
  {:else if view.kind === 'tailReview'}
    {#await TailReviewLazy() then m}
      {@const C = m.default}
      <C onHome={home} />
    {/await}
  {:else if view.kind === 'logoReview'}
    {#await LogoReviewLazy() then m}
      {@const C = m.default}
      <C onHome={home} />
    {/await}
  {:else if view.kind === 'aircraftReview'}
    {#await AircraftReviewLazy() then m}
      {@const C = m.default}
      <C onHome={home} />
    {/await}
  {:else if view.kind === 'militaryReview'}
    {#await MilitaryReviewLazy() then m}
      {@const C = m.default}
      <C onHome={home} />
    {/await}
  {:else if view.kind === 'airportReview'}
    {#await AirportReviewLazy() then m}
      {@const C = m.default}
      <C onHome={home} />
    {/await}
  {:else if view.kind === 'introImageReview'}
    {#await IntroImageReviewLazy() then m}
      {@const C = m.default}
      <C onHome={home} />
    {/await}
  {:else if view.kind === 'reviewLock'}
    {@const v = view}
    {#await ReviewLockLazy() then m}
      {@const C = m.default}
      <C
        label={v.target === 'logos' ? 'Logo review' : v.target === 'aircraft' ? 'Aircraft photo review' : v.target === 'military' ? 'Military photo review' : v.target === 'airports' ? 'Airport photo review' : v.target === 'introImages' ? 'Intro image review' : 'Tail review'}
        onUnlock={(pin) => unlockReview(v.target, pin)}
        onHome={home}
      />
    {/await}
  {:else if view.kind === 'historyDetail'}
    {#await HistoryDetailLazy() then m}
      {@const C = m.default}
      <C entry={view.entry} onHome={home} />
    {/await}
  {:else if view.kind === 'aircraftWordle'}
    {#await AircraftWordleLazy() then m}
      {@const C = m.default}
      <C difficulty={view.difficulty} onHome={home} />
    {/await}
  {:else if view.kind === 'aircraftIdentify'}
    {#await AircraftIdentifyLazy() then m}
      {@const C = m.default}
      <C difficulty={view.difficulty} onHome={home} />
    {/await}
  {:else if view.kind === 'militaryWordle'}
    {#await MilitaryWordleLazy() then m}
      {@const C = m.default}
      <C difficulty={view.difficulty} onHome={home} />
    {/await}
  {:else if view.kind === 'militaryIdentify'}
    {#await MilitaryIdentifyLazy() then m}
      {@const C = m.default}
      <C difficulty={view.difficulty} onHome={home} />
    {/await}
  {:else if view.kind === 'airportWordle'}
    {#await AirportWordleLazy() then m}
      {@const C = m.default}
      <C difficulty={view.difficulty} onHome={home} />
    {/await}
  {:else if view.kind === 'airportIdentify'}
    {#await AirportIdentifyLazy() then m}
      {@const C = m.default}
      <C difficulty={view.difficulty} onHome={home} />
    {/await}
  {:else if view.kind === 'atcRound'}
    {@const v = view}
    {#await AtcRoundLazy() then m}
      {@const C = m.default}
      <C
        mode={v.mode}
        difficulty={v.difficulty}
        onFinish={(r) => finishAtc(v.mode, v.difficulty, r)}
        onQuit={home}
      />
    {/await}
  {:else if view.kind === 'atcRadarRound'}
    {@const v = view}
    {#await AtcRadarRoundLazy() then m}
      {@const C = m.default}
      <C
        mode={v.radarMode}
        difficulty={v.difficulty}
        onFinish={(r) => finishRadar(v.difficulty, r)}
        onQuit={home}
      />
    {/await}
  {:else if view.kind === 'clearedRound'}
    {@const v = view}
    {#await ClearedDirectRoundLazy() then m}
      {@const C = m.default}
      <C
        difficulty={v.difficulty}
        onFinish={(r) => finishCleared(v.difficulty, r)}
        onQuit={home}
      />
    {/await}
  {:else if view.kind === 'sequenceRound'}
    {@const v = view}
    {#await SequencingRoundLazy() then m}
      {@const C = m.default}
      <C
        difficulty={v.difficulty}
        onFinish={(r) => finishSequence(v.difficulty, r)}
        onQuit={home}
      />
    {/await}
  {:else if view.kind === 'interceptStableRound'}
    {@const v = view}
    {#await InterceptStableRoundLazy() then m}
      {@const C = m.default}
      <C
        difficulty={v.difficulty}
        onFinish={(r) => finishInterceptStable(v.difficulty, r)}
        onQuit={home}
      />
    {/await}
  {:else if view.kind === 'interceptMinimumsRound'}
    {@const v = view}
    {#await InterceptMinimumsRoundLazy() then m}
      {@const C = m.default}
      <C
        difficulty={v.difficulty}
        onFinish={(r) => finishInterceptMinimums(v.difficulty, r)}
        onQuit={home}
      />
    {/await}
  {:else if view.kind === 'interceptFmaRound'}
    {@const v = view}
    {#await InterceptFmaRoundLazy() then m}
      {@const C = m.default}
      <C
        difficulty={v.difficulty}
        onFinish={(r) => finishInterceptFma(v.difficulty, r)}
        onQuit={home}
      />
    {/await}
  {:else if view.kind === 'intro'}
    {@const v = view}
    {#await IntroLazy() then m}
      {@const C = m.default}
      <C
        title={INTRO_TITLES[v.intro]}
        slides={introSlides(v.intro)}
        onStart={() => startFromIntro(v.intro, v.difficulty)}
        onCancel={home}
      />
    {/await}
  {:else if view.kind === 'pfdLab'}
    {#await PfdLabLazy() then m}
      {@const C = m.default}
      <C onHome={home} />
    {/await}
  {:else if view.kind === 'atcResults'}
    {@const v = view}
    {#await AtcResultsLazy() then m}
      {@const C = m.default}
      <C
        mode={v.mode}
        difficulty={v.difficulty}
        results={v.results}
        onAgain={() => startAtc(v.mode, v.difficulty)}
        onHome={home}
      />
    {/await}
  {:else}
    {#await BrowseLazy() then m}
      {@const C = m.default}
      <C onHome={home} />
    {/await}
  {/if}

  {#if pendingStart}
    {@const p = pendingStart}
    <div
      class="modal-backdrop"
      role="presentation"
      onclick={(e) => { if (e.target === e.currentTarget) cancelPending(); }}
    >
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-modal-title"
        tabindex="-1"
      >
        <h3 id="resume-modal-title">Resume in progress?</h3>
        <p class="modal-body">
          You have an unfinished <strong>{p.entry.label}</strong> round
          ({p.entry.currentIndex} of {p.entry.total}).
        </p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" onclick={cancelPending}>Cancel</button>
          <button class="btn ghost" type="button" onclick={startOverPending}>Start over</button>
          <button class="btn primary" type="button" onclick={resumePending}>Continue</button>
        </div>
      </div>
    </div>
  {/if}
</main>

<style>
  .brand-left {
    display: flex;
    align-items: center;
  }
  .crumb-btn {
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    color: var(--text);
    transition: color 0.15s;
  }
  .crumb-btn:hover { color: var(--accent); }
  .crumb-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
    border-radius: 2px;
  }
  .back-arrow {
    color: var(--muted);
    transition: color 0.15s, transform 0.15s;
    display: inline-block;
  }
  .crumb-btn:hover .back-arrow { color: var(--accent); transform: translateX(-2px); }
  .brand-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    position: relative;
  }
  .icon-btn {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    background: none;
    border: 1px solid transparent;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .icon-btn img {
    width: 16px;
    height: 16px;
    filter: invert(78%) sepia(10%) saturate(180%) hue-rotate(170deg) brightness(95%);
  }
  .icon-btn:hover {
    color: var(--accent);
    border-color: var(--border);
    background: var(--surface);
  }
  .up-link {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .up-link span {
    color: var(--muted);
    transition: color 0.15s, transform 0.15s;
    display: inline-block;
  }
  .up-link:hover span { color: var(--text); transform: translateX(-2px); }
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

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }
  .modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.25rem 1.25rem 1rem;
    max-width: 26rem;
    width: 100%;
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .modal h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: var(--text);
  }
  .modal-body {
    margin: 0;
    color: var(--muted);
    font-size: 0.875rem;
    line-height: 1.5;
  }
  .modal-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    flex-wrap: wrap;
    margin-top: 0.25rem;
  }
  .modal-actions .btn {
    padding: 0.5rem 0.875rem;
    border-radius: 4px;
    font-size: 0.875rem;
    border: 1px solid var(--border);
    cursor: pointer;
  }
  .btn.ghost {
    background: var(--surface-2);
    color: var(--text);
  }
  .btn.ghost:hover { border-color: var(--panel-line); }
  .btn.primary {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
    font-weight: 600;
  }
</style>
