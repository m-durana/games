<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onMount } from 'svelte';
  import {
    airportEntryByIata,
    pooledAirports,
    compareAttributes,
    fetchAirportImages,
    pickRoundAirport,
    AIRPORT_ROUND_LENGTH,
    AIRPORT_WORDLE_MAX_GUESSES,
    AIRPORT_WORDLE_HARD_MAX_GUESSES,
    ATTRIBUTE_INFO,
    regionOf,
    regionLabel,
    type AirportEntry,
    type AirportDifficulty,
    type AttributeFeedback,
  } from './airports-game';
  import AirportReveal from './AirportReveal.svelte';
  import RoundBar from './RoundBar.svelte';
  import * as Sound from './sound';
  import { loadPool, saveHistoryEntry } from './engine';
  import type { AirportWordleResult } from './types';

  const SESSION_KEY = 'wordle:airport:session';
  interface SavedSession {
    v: 1;
    difficulty: AirportDifficulty;
    pool: 'all' | 'us' | 'us_eu';
    answerIatas: string[];
    index: number;
    guessIatas: string[];
    score: number;
    scores: number[];
    recorded: AirportWordleResult[];
    solved: boolean;
    exhausted: boolean;
  }
  function loadSession(): SavedSession | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as SavedSession;
      if (s.v !== 1) return null;
      return s;
    } catch {
      return null;
    }
  }

  interface Props {
    difficulty: AirportDifficulty;
    onHome: () => void;
  }

  let { difficulty, onHome }: Props = $props();

  // svelte-ignore state_referenced_locally
  const maxGuesses = difficulty === 'hard' ? AIRPORT_WORDLE_HARD_MAX_GUESSES : AIRPORT_WORDLE_MAX_GUESSES;
  const guessableSet = $derived(pooledAirports());

  // svelte-ignore state_referenced_locally
  const savedAtMount = (() => {
    const saved = loadSession();
    // svelte-ignore state_referenced_locally
    const currentPool = loadPool();
    const canResume =
      !!saved &&
      // svelte-ignore state_referenced_locally
      saved.difficulty === difficulty &&
      saved.pool === currentPool &&
      saved.answerIatas.length > 0 &&
      saved.answerIatas.every((iata) => airportEntryByIata(iata) !== null) &&
      !(saved.scores.length >= saved.answerIatas.length);
    return canResume ? saved! : null;
  })();

  // svelte-ignore state_referenced_locally
  const initial = (() => {
    if (savedAtMount) {
      const restoredAnswers = savedAtMount.answerIatas.map((iata) => airportEntryByIata(iata)!);
      const cur = restoredAnswers[savedAtMount.index];
      const restoredGuesses = savedAtMount.guessIatas
        .map((iata) => airportEntryByIata(iata))
        .filter((a): a is AirportEntry => a !== null)
        .map((a) => ({ airport: a, feedback: compareAttributes(a, cur) }));
      return {
        answers: restoredAnswers,
        index: savedAtMount.index,
        guesses: restoredGuesses,
        solved: savedAtMount.solved,
        exhausted: savedAtMount.exhausted,
        score: savedAtMount.score,
        scores: savedAtMount.scores,
        recorded: savedAtMount.recorded,
      };
    }
    // svelte-ignore state_referenced_locally
    return {
      answers: pickRoundAirport(AIRPORT_ROUND_LENGTH, difficulty),
      index: 0,
      guesses: [] as { airport: AirportEntry; feedback: AttributeFeedback[] }[],
      solved: false,
      exhausted: false,
      score: 0,
      scores: [] as number[],
      recorded: [] as AirportWordleResult[],
    };
  })();

  let answers: AirportEntry[] = $state(initial.answers);
  let index = $state(initial.index);
  let query = $state('');
  let highlight = $state(0);
  let guesses: { airport: AirportEntry; feedback: AttributeFeedback[] }[] = $state(initial.guesses);
  let solved = $state(initial.solved);
  let exhausted = $state(initial.exhausted);
  let score = $state(initial.score);
  let scores: number[] = $state(initial.scores);
  let recorded: AirportWordleResult[] = $state(initial.recorded);
  let done = $state(false);
  let resumePending = $state(savedAtMount !== null);

  function continueSaved() {
    resumePending = false;
    setTimeout(() => inputEl?.focus(), 0);
  }

  function startFreshFromPrompt() {
    answers = pickRoundAirport(AIRPORT_ROUND_LENGTH, difficulty);
    index = 0;
    guesses = [];
    solved = false;
    exhausted = false;
    revealPhoto = null;
    score = 0;
    scores = [];
    recorded = [];
    query = '';
    highlight = 0;
    resumePending = false;
    setTimeout(() => inputEl?.focus(), 0);
  }

  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    if (done) {
      localStorage.removeItem(SESSION_KEY);
      return;
    }
    const session: SavedSession = {
      v: 1,
      difficulty,
      pool: loadPool(),
      answerIatas: answers.map((a) => a.iata),
      index,
      guessIatas: guesses.map((g) => g.airport.iata),
      score,
      scores,
      recorded,
      solved,
      exhausted,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  });

  let inputEl: HTMLInputElement | null = $state(null);
  let revealPhoto: string | null = $state(null);
  let infoLabel: string | null = $state(null);
  let showAllInfo = $state(false);

  const current = $derived(answers[index]);
  const remaining = $derived(maxGuesses - guesses.length);
  const finished = $derived(solved || exhausted);
  const allGreenButWrong = $derived(
    guesses.length > 0 &&
      !solved &&
      guesses[guesses.length - 1].feedback.every((f) => f.match === 'hit'),
  );

  $effect(() => {
    if (!finished) return;
    const target = current;
    if (!target) return;
    let cancelled = false;
    revealPhoto = null;
    void (async () => {
      const urls = await fetchAirportImages(target);
      if (cancelled) return;
      if (target.iata !== current?.iata) return;
      revealPhoto = urls[Math.floor(Math.random() * urls.length)] ?? null;
    })();
    return () => { cancelled = true; };
  });
  const infoMap = Object.fromEntries(ATTRIBUTE_INFO.map((i) => [i.label, i]));
  function toggleInfo(label: string) {
    infoLabel = infoLabel === label ? null : label;
  }

  const guessedIds = $derived(new Set(guesses.map((g) => g.airport.iata)));
  const availableOptions = $derived(guessableSet.filter((a) => !guessedIds.has(a.iata)));

  function normalize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  const suggestions = $derived.by(() => {
    const q = normalize(query);
    if (!q) return [] as AirportEntry[];
    const scored: { ap: AirportEntry; rank: number }[] = [];
    for (const a of availableOptions) {
      const n = normalize(a.name);
      const c = normalize(a.city);
      const co = normalize(a.country);
      const i = normalize(a.iata);
      const iataExact = i === q;
      const iataStart = i.startsWith(q);
      const nameStarts = n.startsWith(q) || c.startsWith(q);
      const nameHas = n.includes(q) || c.includes(q);
      const otherHas = co.includes(q);
      if (!iataStart && !nameHas && !otherHas) continue;
      const rank = iataExact ? -1 : iataStart ? 0 : nameStarts ? 1 : nameHas ? 2 : 3;
      scored.push({ ap: a, rank });
    }
    scored.sort((a, b) => a.rank - b.rank || a.ap.name.localeCompare(b.ap.name));
    return scored.map((s) => s.ap);
  });

  function commitGuess(ap: AirportEntry) {
    if (finished) return;
    const feedback = compareAttributes(ap, current);
    guesses = [...guesses, { airport: ap, feedback }];
    query = '';
    highlight = 0;

    if (ap.iata === current.iata) {
      solved = true;
      const earned = Math.max(1, maxGuesses - guesses.length + 1);
      score += earned;
      Sound.correct();
      Sound.vibrate(15);
      savePuzzle(true, earned);
    } else if (guesses.length >= maxGuesses) {
      exhausted = true;
      Sound.wrong();
      Sound.vibrate(35);
      savePuzzle(false, 0);
    } else {
      Sound.vibrate(8);
      inputEl?.focus();
    }
  }

  function submitFromInput() {
    if (suggestions.length === 0) return;
    const idx = Math.min(highlight, suggestions.length - 1);
    commitGuess(suggestions[idx]);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      if (suggestions.length > 0) submitFromInput();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      query = ''; highlight = 0;
      return;
    }
    if (suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlight = (highlight + 1) % suggestions.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlight = (highlight - 1 + suggestions.length) % suggestions.length;
    }
  }

  $effect(() => {
    void query;
    if (highlight >= suggestions.length) highlight = 0;
  });

  function savePuzzle(didSolve: boolean, earned: number) {
    const result: AirportWordleResult = {
      type: 'apt-wordle',
      airportIata: current.iata,
      airportName: current.name,
      guesses: guesses.map((g) => ({ iata: g.airport.iata, name: g.airport.name, feedback: g.feedback })),
      solved: didSolve,
      earned,
    };
    recorded = [...recorded, result];
    scores = [...scores, earned];
    saveHistoryEntry({
      mode: 'airportWordle',
      difficulty,
      score: didSolve ? 1 : 0,
      total: 1,
      ts: Date.now(),
      airportResults: [result],
    });
  }

  function next() {
    if (index + 1 >= answers.length) {
      done = true;
      return;
    }
    index += 1;
    guesses = [];
    solved = false;
    exhausted = false;
    revealPhoto = null;
    query = '';
    highlight = 0;
    setTimeout(() => inputEl?.focus(), 0);
  }

  function playAgain() {
    answers = pickRoundAirport(AIRPORT_ROUND_LENGTH, difficulty);
    index = 0;
    guesses = [];
    solved = false;
    exhausted = false;
    revealPhoto = null;
    score = 0;
    scores = [];
    recorded = [];
    done = false;
    query = '';
    highlight = 0;
  }

  function dotState(i: number): 'todo' | 'current' | 'correct' | 'wrong' {
    if (i < scores.length) return scores[i] > 0 ? 'correct' : 'wrong';
    if (i === index) return 'current';
    return 'todo';
  }
  const progressLeds = $derived(answers.map((_, i) => dotState(i)));

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Escape' && !query) onHome();
      if (e.key === 'Enter' && finished) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
</script>

<RoundBar progress={progressLeds} {score} total={0} scoreLabel="PTS" onQuit={onHome} />

<section class="round">
  {#if resumePending && savedAtMount}
    <div class="resume-overlay" role="dialog" aria-modal="true" aria-labelledby="resume-title">
      <div class="resume-card" in:fly={{ y: 16, duration: 220 }}>
        <h2 id="resume-title">Resume game?</h2>
        <p class="resume-sub">
          You have a {difficulty} round in progress
          - airport {savedAtMount.index + 1} of {savedAtMount.answerIatas.length},
          {savedAtMount.guessIatas.length} {savedAtMount.guessIatas.length === 1 ? 'guess' : 'guesses'} so far,
          {savedAtMount.score} pts.
        </p>
        <div class="resume-actions">
          <button class="btn-primary" onclick={continueSaved}>Continue</button>
          <button class="btn-ghost" onclick={startFreshFromPrompt}>Start fresh</button>
        </div>
      </div>
    </div>
  {/if}
  {#if done}
    <div class="card finale" in:fly={{ y: 16, duration: 220 }}>
      <h2>Round complete</h2>
      <p class="finale-score">{score} / {answers.length * maxGuesses} points</p>
      <p class="finale-sub">{scores.filter((s) => s > 0).length} of {answers.length} solved</p>
      <div class="finale-actions">
        <button class="btn-primary" onclick={playAgain}>Play again</button>
        <button class="btn-ghost" onclick={onHome}>Home</button>
      </div>
    </div>
  {:else}
    {#key index}
      <div class="card" in:fly={{ y: 16, duration: 220 }}>
        <div class="card-head">
          <span class="mode-pill">Airport Wordle</span>
          <span class="round-pill">{index + 1} / {answers.length}</span>
          <span class="diff-pill diff-{difficulty}">{difficulty}</span>
        </div>

        <p class="prompt">
          Guess the mystery airport. Each guess reveals how close you are on seven attributes.
          {#if !finished}
            <span class="remaining">{remaining} {remaining === 1 ? 'guess' : 'guesses'} left.</span>
          {/if}
        </p>

        {#if guesses.length > 0}
          <div class="board">
            <div class="board-head">
              <span class="cell-label">Airport</span>
              {#each guesses[0].feedback as fb}
                <button
                  type="button"
                  class="cell-label cell-label-btn"
                  class:active={infoLabel === fb.label}
                  onclick={() => toggleInfo(fb.label)}
                  aria-expanded={infoLabel === fb.label}
                  title="What does this attribute mean?"
                >{fb.label} <span class="info-mark" aria-hidden="true">ⓘ</span></button>
              {/each}
            </div>
            {#if infoLabel && infoMap[infoLabel]}
              <div class="attr-info" role="region" aria-label={`About ${infoLabel}`}>
                <span class="attr-info-title">{infoLabel}</span>
                <span class="attr-info-desc">{infoMap[infoLabel].description}</span>
                <div class="attr-info-values">
                  {#each infoMap[infoLabel].values as v}
                    <span class="attr-info-chip">{v}</span>
                  {/each}
                </div>
              </div>
            {/if}
            {#each guesses as g}
              <div class="board-row">
                <span class="guess-name">{g.airport.name} ({g.airport.iata})</span>
                {#each g.feedback as fb}
                  <span class="cell cell-{fb.match}" title={fb.guessValue}>
                    <span class="cell-mobile-label">{fb.label}</span>
                    <span class="cell-val">{fb.guessValue}</span>
                    {#if fb.hint && fb.match === 'close'}
                      <span class="arrow" aria-label={fb.hint === 'higher' ? 'answer is higher' : 'answer is lower'}>
                        {fb.hint === 'higher' ? '▲' : '▼'}
                      </span>
                    {/if}
                  </span>
                {/each}
              </div>
            {/each}
          </div>
          <button
            type="button"
            class="attr-help-btn"
            class:active={showAllInfo}
            onclick={() => (showAllInfo = !showAllInfo)}
            aria-expanded={showAllInfo}
          >ⓘ {showAllInfo ? 'Hide' : 'Attribute help'}</button>
          {#if showAllInfo}
            <div class="attr-info-all" role="region" aria-label="All attributes">
              {#each ATTRIBUTE_INFO as info}
                <div class="attr-info">
                  <span class="attr-info-title">{info.label}</span>
                  <span class="attr-info-desc">{info.description}</span>
                  <div class="attr-info-values">
                    {#each info.values as v}
                      <span class="attr-info-chip">{v}</span>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {/if}

        {#if !finished}
          {#if allGreenButWrong}
            <div class="green-note">
              All attributes match - but it's still not the mystery airport. Different
              airports can share country, region, alliance, traffic tier, etc.; the
              answer is a different one. Keep guessing.
            </div>
          {/if}
          <div class="combobox">
            <input
              bind:this={inputEl}
              bind:value={query}
              onkeydown={onKeydown}
              type="text"
              placeholder="Type to search airports (e.g. JFK, Heathrow, Tokyo)"
              autocomplete="off"
              spellcheck="false"
              class="combobox-input"
            />
            {#if suggestions.length > 0}
              <ul class="suggestions" role="listbox">
                {#each suggestions as s, i}
                  <li
                    role="option"
                    aria-selected={i === highlight}
                    class:active={i === highlight}
                    onmouseenter={() => (highlight = i)}
                    onmousedown={(e) => { e.preventDefault(); commitGuess(s); }}
                  >
                    <span class="sugg-name">{s.name} ({s.iata})</span>
                    <span class="sugg-meta">{s.city} · {s.country}{regionOf(s.country) ? ` · ${regionLabel(regionOf(s.country)!)}` : ''}</span>
                  </li>
                {/each}
              </ul>
            {:else if query.trim()}
              <p class="no-match">No matches.</p>
            {/if}
          </div>
          <p class="legend">
            <span class="swatch swatch-hit"></span> match
            <span class="swatch swatch-close"></span> close
            <span class="swatch swatch-miss"></span> off
          </p>
        {:else}
          <AirportReveal airport={current} correct={solved} photoUrl={revealPhoto} />
          <button class="btn-primary next-btn" onclick={next}>
            {index + 1 >= answers.length ? 'Finish round' : 'Next airport'}
          </button>
        {/if}
      </div>
    {/key}
  {/if}
</section>

<style>
  .round { display: flex; flex-direction: column; gap: 0.85rem; align-items: stretch; width: 100%; }

  .card {
    width: 100%;
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 2px;
    padding: 1.4rem 1.2rem 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .card-head { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
  .mode-pill, .round-pill, .diff-pill {
    font-family: var(--mono);
    font-size: 0.62rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--label-dim);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    background: var(--panel-2);
    padding: 0.22rem 0.5rem;
    border-radius: 1px;
    font-weight: 700;
  }
  .mode-pill { color: var(--label); letter-spacing: 0.22em; }
  .diff-pill { color: var(--led-amber); }

  .prompt {
    font-family: var(--sans);
    font-size: 0.85rem;
    color: var(--label-2);
    line-height: 1.5;
  }
  .prompt .remaining { color: var(--led-cyan); font-family: var(--mono); font-weight: 700; letter-spacing: 0.04em; margin-left: 0.4rem; }

  /* board */
  .board { display: flex; flex-direction: column; gap: 0; }
  .board-head, .board-row {
    display: grid;
    grid-template-columns: 1.6fr repeat(var(--cols, 6), 0.9fr);
    gap: 1px;
    background: var(--bezel-lo);
  }
  .board-head { border: 1px solid var(--bezel-lo); border-bottom: none; }
  .board-row { border-left: 1px solid var(--bezel-lo); border-right: 1px solid var(--bezel-lo); border-bottom: 1px solid var(--bezel-lo); }
  .board-row:nth-of-type(2) { border-top: 1px solid var(--bezel-lo); }

  .cell-label {
    font-family: var(--mono);
    font-size: 0.6rem;
    letter-spacing: 0.18em;
    color: var(--label-dim);
    text-transform: uppercase;
    font-weight: 700;
    background: var(--panel-2);
    padding: 0.5rem 0.5rem;
    text-align: center;
    cursor: pointer;
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
  }
  .cell-label:first-child { text-align: left; padding-left: 0.4rem; justify-content: flex-start; }
  .cell-label-btn:hover { color: var(--led-cyan); }
  .cell-label-btn.active { color: var(--led-cyan); background: var(--panel); }
  .info-mark { font-size: 0.6rem; opacity: 0.7; margin-left: 0.2rem; }

  .guess-name {
    font-family: var(--sans);
    font-weight: 700;
    font-size: 0.82rem;
    color: var(--label);
    background: var(--panel-2);
    padding: 0.5rem 0.5rem;
    display: flex;
    align-items: center;
    min-height: 38px;
  }

  .cell {
    background: var(--panel-2);
    padding: 0.4rem 0.3rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.1rem;
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.02em;
    color: var(--label);
    min-height: 38px;
    text-align: center;
  }
  .cell-mobile-label {
    font-family: var(--mono);
    font-size: 0.55rem;
    letter-spacing: 0.16em;
    color: var(--label-dim);
    text-transform: uppercase;
    font-weight: 700;
    display: none;
  }
  .cell-val { font-weight: 700; line-height: 1.1; text-align: center; }
  .cell-hit { background: rgba(74, 222, 128, 0.12); color: var(--led-green); }
  .cell-close { background: rgba(251, 191, 36, 0.10); color: var(--led-amber); }
  .cell-miss { background: var(--panel-2); color: var(--label-faint); }
  .arrow { font-size: 0.78rem; color: var(--led-amber); margin-top: 0.05rem; }

  /* attribute info panel */
  .attr-info {
    background: var(--panel-2);
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
    padding: 0.6rem 0.75rem;
    margin-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .attr-info-title {
    font-family: var(--mono);
    font-size: 0.65rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--led-cyan);
    font-weight: 700;
  }
  .attr-info-desc { font-family: var(--sans); font-size: 0.78rem; color: var(--label-2); line-height: 1.45; }
  .attr-info-values { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .attr-info-chip {
    font-family: var(--mono);
    font-size: 0.6rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.18rem 0.4rem;
    border: 1px solid var(--bezel-hi);
    background: var(--bg);
    border-radius: 1px;
    color: var(--label-dim);
  }
  .attr-help-btn {
    align-self: flex-start;
    margin-top: 0.4rem;
    font-family: var(--mono);
    font-size: 0.62rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--label-dim);
    padding: 0.32rem 0.55rem;
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    background: var(--panel-2);
    border-radius: 1px;
    cursor: pointer;
  }
  .attr-help-btn:hover, .attr-help-btn.active { color: var(--led-cyan); border-color: var(--led-cyan); }
  .attr-info-all { display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.4rem; }

  /* combobox + suggestions (MFD-green) */
  .combobox { position: relative; display: flex; flex-direction: column; gap: 0; }
  .combobox-input {
    width: 100%;
    background: var(--mfd-bg);
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
    padding: 0.65rem 0.85rem;
    font-family: var(--mono);
    font-size: 0.82rem;
    color: var(--mfd-text);
    letter-spacing: 0.04em;
    outline: none;
  }
  .combobox-input::placeholder { color: var(--mfd-dim); }
  .combobox-input:focus { border-color: var(--mfd-text); }

  .suggestions {
    list-style: none;
    margin-top: 0.4rem;
    background: var(--panel-2);
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
    overflow: hidden;
    max-height: 240px;
    overflow-y: auto;
  }
  .suggestions li {
    padding: 0.5rem 0.7rem;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.08rem;
  }
  .suggestions li + li { border-top: 1px solid var(--bezel-lo); }
  .suggestions li:hover, .suggestions li.active { background: var(--hover, var(--bezel-hi)); }
  .sugg-name { font-family: var(--sans); font-weight: 700; font-size: 0.85rem; color: var(--label); }
  .sugg-meta { font-family: var(--mono); font-size: 0.62rem; letter-spacing: 0.04em; color: var(--label-dim); }
  .no-match { padding: 0.55rem 0.7rem; font-family: var(--mono); font-size: 0.7rem; color: var(--label-dim); text-align: center; }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.85rem;
    font-family: var(--mono);
    font-size: 0.62rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--label-dim);
    margin-top: 0.2rem;
  }
  .swatch {
    display: inline-block;
    width: 10px; height: 10px;
    margin-right: 0.32rem;
    border-radius: 1px;
    vertical-align: middle;
  }
  .swatch-hit { background: var(--led-green); }
  .swatch-close { background: var(--led-amber); }
  .swatch-miss { background: var(--label-faint); }

  .green-note {
    font-family: var(--sans);
    font-size: 0.78rem;
    color: var(--led-amber);
    background: rgba(251, 191, 36, 0.06);
    border: 1px solid rgba(251, 191, 36, 0.35);
    border-radius: 1px;
    padding: 0.65rem 0.8rem;
    line-height: 1.45;
  }

  /* finale + resume overlays */
  .resume-overlay, .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }
  .resume-card, .modal {
    width: 100%;
    max-width: 380px;
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 2px;
    padding: 1.4rem 1.2rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }
  .resume-card h2, .finale h2 { font-family: var(--mono); font-size: 0.92rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--label); font-weight: 700; }
  .resume-sub { font-family: var(--sans); font-size: 0.82rem; color: var(--label-dim); line-height: 1.45; }
  .resume-actions, .finale-actions { display: flex; justify-content: flex-end; gap: 0.45rem; margin-top: 0.4rem; }

  .finale {
    align-items: center;
    text-align: center;
  }
  .finale-score {
    font-family: var(--mono);
    font-size: 1.6rem;
    letter-spacing: 0.04em;
    color: var(--led-green);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .finale-sub { font-family: var(--sans); font-size: 0.85rem; color: var(--label-dim); }

  .btn-primary {
    font-family: var(--mono);
    font-weight: 700;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--led-cyan);
    padding: 0.55rem 1.1rem;
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    background: var(--panel);
    border-radius: 1px;
    cursor: pointer;
  }
  .btn-primary:hover { color: #b0ecf6; }
  .btn-primary:active {
    border-color: var(--bezel-lo);
    border-bottom-color: var(--bezel-hi);
    border-right-color: var(--bezel-hi);
  }
  .btn-ghost {
    font-family: var(--mono);
    font-weight: 700;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--label-dim);
    padding: 0.55rem 1.1rem;
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    background: var(--panel-2);
    border-radius: 1px;
    cursor: pointer;
  }
  .btn-ghost:hover { color: var(--label); }

  .next-btn { align-self: stretch; margin-top: 0.5rem; }

  @media (max-width: 600px) {
    .board-head { display: none; }
    .board-row {
      grid-template-columns: 1fr 1fr;
      grid-auto-rows: auto;
    }
    .guess-name { grid-column: 1 / -1; min-height: auto; padding: 0.4rem 0.5rem; }
    .cell-mobile-label { display: block; }
    .cell { min-height: 56px; padding: 0.45rem 0.4rem; }
    .cell-val { font-size: 0.8125rem; }
  }
</style>
