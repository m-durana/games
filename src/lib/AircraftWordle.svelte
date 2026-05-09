<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onMount } from 'svelte';
  import {
    aircraftById,
    pooledAircraft,
    compareAttributes,
    fetchAircraftImages,
    pickRoundAircraft,
    AIRCRAFT_ROUND_LENGTH,
    WORDLE_MAX_GUESSES,
    WORDLE_HARD_MAX_GUESSES,
    ATTRIBUTE_INFO,
    type Aircraft,
    type AircraftDifficulty,
    type AttributeFeedback,
  } from './aircraft';
  import AircraftReveal from './AircraftReveal.svelte';
  import RoundBar from './RoundBar.svelte';
  import * as Sound from './sound';
  import { loadPool, saveHistoryEntry } from './engine';
  import type { AircraftWordleResult } from './types';

  const SESSION_KEY = 'wordle:aircraft:session';
  interface SavedSession {
    v: 1;
    difficulty: AircraftDifficulty;
    pool: 'all' | 'us' | 'us_eu';
    answerIds: string[];
    index: number;
    guessIds: string[];
    score: number;
    scores: number[];
    recorded: AircraftWordleResult[];
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
    difficulty: AircraftDifficulty;
    onHome: () => void;
  }

  let { difficulty, onHome }: Props = $props();

  // svelte-ignore state_referenced_locally
  const maxGuesses = difficulty === 'hard' ? WORDLE_HARD_MAX_GUESSES : WORDLE_MAX_GUESSES;
  const guessableSet = $derived(pooledAircraft());

  // Restore an in-progress session if difficulty + region match. Otherwise pick
  // a fresh round. Resolved synchronously so the initial `$state` values are
  // correct on first render.
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
      saved.answerIds.length > 0 &&
      saved.answerIds.every((id) => aircraftById(id) !== null) &&
      !(saved.scores.length >= saved.answerIds.length) &&
      // Only treat as resumable if real progress was made; an untouched
      // fresh-start session shouldn't trigger the dialog.
      (saved.index > 0 || saved.guessIds.length > 0 || saved.scores.length > 0);
    return canResume ? saved! : null;
  })();

  // svelte-ignore state_referenced_locally
  const initial = (() => {
    if (savedAtMount) {
      const restoredAnswers = savedAtMount.answerIds.map((id) => aircraftById(id)!);
      const cur = restoredAnswers[savedAtMount.index];
      const restoredGuesses = savedAtMount.guessIds
        .map((id) => aircraftById(id))
        .filter((a): a is Aircraft => a !== null)
        .map((a) => ({ aircraft: a, feedback: compareAttributes(a, cur) }));
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
      answers: pickRoundAircraft(AIRCRAFT_ROUND_LENGTH, difficulty),
      index: 0,
      guesses: [] as { aircraft: Aircraft; feedback: AttributeFeedback[] }[],
      solved: false,
      exhausted: false,
      score: 0,
      scores: [] as number[],
      recorded: [] as AircraftWordleResult[],
    };
  })();

  let answers: Aircraft[] = $state(initial.answers);
  let showInfo = $state(false);
  let index = $state(initial.index);
  let query = $state('');
  let highlight = $state(0);
  let guesses: { aircraft: Aircraft; feedback: AttributeFeedback[] }[] = $state(initial.guesses);
  let solved = $state(initial.solved);
  let exhausted = $state(initial.exhausted);
  let score = $state(initial.score);
  let scores: number[] = $state(initial.scores);
  let recorded: AircraftWordleResult[] = $state(initial.recorded);
  let done = $state(false);
  let resumePending = $state(savedAtMount !== null);

  function continueSaved() {
    resumePending = false;
    setTimeout(() => inputEl?.focus(), 0);
  }

  function startFreshFromPrompt() {
    answers = pickRoundAircraft(AIRCRAFT_ROUND_LENGTH, difficulty);
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
      answerIds: answers.map((a) => a.id),
      index,
      guessIds: guesses.map((g) => g.aircraft.id),
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

  // When the round ends, fetch a photo of the answer to show in the reveal.
  $effect(() => {
    if (!finished) return;
    const target = current;
    if (!target) return;
    let cancelled = false;
    revealPhoto = null;
    void (async () => {
      const urls = await fetchAircraftImages(target);
      if (cancelled) return;
      if (target.id !== current?.id) return;
      revealPhoto = urls[Math.floor(Math.random() * urls.length)] ?? null;
    })();
    return () => { cancelled = true; };
  });
  const infoMap = Object.fromEntries(ATTRIBUTE_INFO.map((i) => [i.label, i]));
  function toggleInfo(label: string) {
    infoLabel = infoLabel === label ? null : label;
  }

  const current = $derived(answers[index]);
  const remaining = $derived(maxGuesses - guesses.length);
  const finished = $derived(solved || exhausted);
  // True when the most recent guess has every attribute green but is still
  // the wrong aircraft - this surprises players, so call it out explicitly.
  const allGreenButWrong = $derived(
    guesses.length > 0 &&
      !solved &&
      guesses[guesses.length - 1].feedback.every((f) => f.match === 'hit'),
  );

  const guessedIds = $derived(new Set(guesses.map((g) => g.aircraft.id)));
  const availableOptions = $derived(guessableSet.filter((a) => !guessedIds.has(a.id)));

  function normalize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  const suggestions = $derived.by(() => {
    const q = normalize(query);
    if (!q) return [] as Aircraft[];
    const scored: { plane: Aircraft; rank: number }[] = [];
    for (const a of availableOptions) {
      const n = normalize(a.name);
      const m = normalize(a.manufacturer);
      const f = normalize(a.family);
      const nameStarts = n.startsWith(q);
      const nameHas = n.includes(q);
      const otherHas = m.includes(q) || f.includes(q);
      if (!nameHas && !otherHas) continue;
      const rank = nameStarts ? 0 : nameHas ? 1 : 2;
      scored.push({ plane: a, rank });
    }
    scored.sort((a, b) => a.rank - b.rank || a.plane.name.localeCompare(b.plane.name));
    return scored.map((s) => s.plane);
  });

  function commitGuess(plane: Aircraft) {
    if (finished) return;
    const feedback = compareAttributes(plane, current);
    guesses = [...guesses, { aircraft: plane, feedback }];
    query = '';
    highlight = 0;

    if (plane.id === current.id) {
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
      e.preventDefault();
      e.stopPropagation();
      if (suggestions.length > 0) submitFromInput();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      query = '';
      highlight = 0;
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
    const result: AircraftWordleResult = {
      type: 'wordle',
      aircraftId: current.id,
      aircraftName: current.name,
      guesses: guesses.map((g) => ({ id: g.aircraft.id, name: g.aircraft.name, feedback: g.feedback })),
      solved: didSolve,
      earned,
    };
    recorded = [...recorded, result];
    scores = [...scores, earned];
    saveHistoryEntry({
      mode: 'aircraftWordle',
      difficulty,
      score: didSolve ? 1 : 0,
      total: 1,
      ts: Date.now(),
      aircraftResults: [result],
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
    answers = pickRoundAircraft(AIRCRAFT_ROUND_LENGTH, difficulty);
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
    <div class="resume-overlay" role="presentation">
      <div class="bezel resume-card" data-label="Resume" role="dialog" aria-modal="true" aria-labelledby="resume-title" in:fly={{ y: 16, duration: 220 }}>
        <h2 id="resume-title">Resume game?</h2>
        <p class="resume-sub">
          You have a {difficulty} round in progress —
          aircraft {savedAtMount.index + 1} of {savedAtMount.answerIds.length},
          {savedAtMount.guessIds.length} {savedAtMount.guessIds.length === 1 ? 'guess' : 'guesses'} so far,
          {savedAtMount.score} pts.
        </p>
        <div class="resume-actions">
          <button class="btn-ghost" onclick={startFreshFromPrompt}>Start fresh</button>
          <button class="btn-primary" onclick={continueSaved}>Continue</button>
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
          <span class="mode-pill">Aircraft Wordle</span>
          <span class="round-pill">{index + 1} / {answers.length}</span>
          <span class="diff-pill diff-{difficulty}">{difficulty}</span>
        <button
          class="info-btn"
          aria-label="About this mode"
          aria-expanded={showInfo}
          onclick={() => (showInfo = !showInfo)}
        >i</button>
      
        </div>
      {#if showInfo}
        <p class="mode-info">Deduce a mystery aircraft from attribute feedback. Type a guess, see how close you are on maker, body, length, engines, tail, and era.</p>
      {/if}

        <p class="prompt">
          Guess the mystery aircraft. Each guess reveals how close you are on six attributes.
          {#if !finished}
            <span class="remaining">{remaining} {remaining === 1 ? 'guess' : 'guesses'} left.</span>
          {/if}
        </p>

        {#if guesses.length > 0}
          <div class="board">
            <div class="board-head">
              <span class="cell-label">Plane</span>
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
                <span class="guess-name">{g.aircraft.name}</span>
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
              All attributes match - but it's still not the mystery aircraft. Variants in
              the same family share the same maker, body, engines, etc.; the answer is a
              different one. Keep guessing.
            </div>
          {/if}
          <div class="combobox">
            <input
              bind:this={inputEl}
              bind:value={query}
              onkeydown={onKeydown}
              type="text"
              placeholder="Type to search aircraft (e.g. A321, 737, Embraer)"
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
                    <span class="sugg-name">{s.name}</span>
                    <span class="sugg-meta">{s.manufacturer} · {s.family}</span>
                  </li>
                {/each}
              </ul>
            {:else if query.trim()}
              <p class="no-match">No matches.</p>
            {/if}
          </div>
          <p class="legend">
            <span class="swatch swatch-hit"></span> match
            <span class="swatch swatch-close"></span> close (±1)
            <span class="swatch swatch-miss"></span> off
          </p>
        {:else}
          <AircraftReveal plane={current} correct={solved} photoUrl={revealPhoto} />
          <button class="btn-primary next-btn" onclick={next}>
            {index + 1 >= answers.length ? 'Finish round' : 'Next aircraft'}
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
    position: relative;
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
  .resume-card.bezel::before {
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
    color: var(--led-cyan);
    font-weight: 700;
    height: 14px;
    display: inline-flex;
    align-items: center;
  }
  .resume-card h2, .finale h2 { font-family: var(--sans); font-size: 1.1rem; letter-spacing: -0.005em; color: var(--label); font-weight: 700; }
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

  .info-btn { margin-left: auto; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-family: var(--mono); font-weight: 700; font-style: italic; font-size: 0.72rem; color: var(--label-dim); background: var(--panel-2); border: 1px solid var(--bezel-hi); border-bottom-color: var(--bezel-lo); border-right-color: var(--bezel-lo); border-radius: 1px; cursor: pointer; }
  .info-btn:hover { color: var(--led-cyan); border-color: var(--led-cyan); }
  .info-btn:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
  .info-btn[aria-expanded="true"] { color: var(--led-cyan); border-color: var(--led-cyan); }
  .mode-info { font-family: var(--sans); font-size: 0.82rem; line-height: 1.5; color: var(--label-2); background: var(--panel-2); border: 1px solid var(--bezel-lo); border-radius: 1px; padding: 0.7rem 0.85rem; margin: 0; }
</style>
