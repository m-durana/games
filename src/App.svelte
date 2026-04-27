<script lang="ts">
  import { onMount } from 'svelte';
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
  import ReviewLock from './lib/ReviewLock.svelte';
  import HistoryDetail from './lib/HistoryDetail.svelte';
  import type { Difficulty, HistoryEntry, Mode, RoundResult } from './lib/types';
  import { readSharedFromUrl, type SharedRound } from './lib/share';
  import type { Achievement } from './lib/achievements';
  import { evaluateAchievements } from './lib/achievements';
  import { loadSettings } from './lib/engine';

  type ReviewTarget = 'tails' | 'logos';
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
    | { kind: 'reviewLock'; target: ReviewTarget }
    | { kind: 'historyDetail'; entry: HistoryEntry };

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

  function finishStandard(mode: Mode, difficulty: Difficulty, daily: boolean, mixed: boolean, results: RoundResult[]) {
    view = { kind: 'results', mode, difficulty, daily, mixed, results };
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
    return target === 'logos' ? { kind: 'logoReview' } : { kind: 'tailReview' };
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

  onMount(() => {
    document.documentElement.dataset.theme = loadSettings().darkMode ? 'dark' : 'light';
    const shared = readSharedFromUrl();
    if (shared) view = { kind: 'shared', data: shared };
    if (typeof window !== 'undefined') {
      const params = new URL(window.location.href).searchParams;
      const review = params.get('review');
      if (params.get('pin') === REVIEW_PIN) localStorage.setItem(REVIEW_AUTH_KEY, '1');
      if (review === 'tails' || review === 'logos') openReview(review);
    }
  });
</script>

<AchievementToast queue={toastQueue} onClear={clearToast} />

<main class="shell">
  <div class="brand">
    <div class="brand-left">
      <a href="/">← miro.build</a>
      {#if view.kind !== 'home'}
        <button class="home-link" type="button" onclick={home} aria-label="Game home" title="Game home">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 10.8 12 3l9 7.8" />
            <path d="M5.5 9.5V21h13V9.5" />
            <path d="M9.5 21v-6h5v6" />
          </svg>
        </button>
      {/if}
    </div>
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
      <span class="crumb">games</span>
    </div>
  </div>

  {#if view.kind === 'home'}
    <Home
      onStart={start}
      onStartDaily={startDaily}
      onStartSpeed={startSpeed}
      onStartMix={startMix}
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
  {:else if view.kind === 'reviewLock'}
    {@const v = view}
    <ReviewLock
      label={v.target === 'logos' ? 'Logo review' : 'Tail review'}
      onUnlock={(pin) => unlockReview(v.target, pin)}
      onHome={home}
    />
  {:else if view.kind === 'historyDetail'}
    <HistoryDetail entry={view.entry} onHome={home} />
  {:else}
    <Browse onHome={home} />
  {/if}
</main>

<style>
  .brand-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .home-link {
    color: var(--text);
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 4px;
  }
  .home-link svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .home-link:hover {
    color: var(--accent);
    background: var(--surface);
  }
  .home-link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .brand-right {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    position: relative;
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
