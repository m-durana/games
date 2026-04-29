<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onMount } from 'svelte';
  import {
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
  import * as Sound from './sound';
  import { saveHistoryEntry } from './engine';
  import type { AircraftWordleResult } from './types';

  interface Props {
    difficulty: AircraftDifficulty;
    onHome: () => void;
  }

  let { difficulty, onHome }: Props = $props();

  // svelte-ignore state_referenced_locally
  const maxGuesses = difficulty === 'hard' ? WORDLE_HARD_MAX_GUESSES : WORDLE_MAX_GUESSES;
  const guessableSet = $derived(pooledAircraft());

  // svelte-ignore state_referenced_locally
  // svelte-ignore state_referenced_locally
  let answers: Aircraft[] = $state(pickRoundAircraft(AIRCRAFT_ROUND_LENGTH, difficulty));
  let index = $state(0);
  let query = $state('');
  let highlight = $state(0);
  let guesses: { aircraft: Aircraft; feedback: AttributeFeedback[] }[] = $state([]);
  let solved = $state(false);
  let exhausted = $state(false);
  let score = $state(0);
  let scores: number[] = $state([]);
  let recorded: AircraftWordleResult[] = $state([]);
  let done = $state(false);

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
    return scored.slice(0, 8).map((s) => s.plane);
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
    } else if (guesses.length >= maxGuesses) {
      exhausted = true;
      Sound.wrong();
      Sound.vibrate(35);
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

  function next() {
    const earned = solved ? Math.max(1, maxGuesses - guesses.length + 1) : 0;
    const result: AircraftWordleResult = {
      type: 'wordle',
      aircraftId: current.id,
      aircraftName: current.name,
      guesses: guesses.map((g) => ({ id: g.aircraft.id, name: g.aircraft.name, feedback: g.feedback })),
      solved,
      earned,
    };
    const nextRecorded = [...recorded, result];
    scores = [...scores, earned];
    recorded = nextRecorded;
    if (index + 1 >= answers.length) {
      done = true;
      saveHistoryEntry({
        mode: 'aircraftWordle',
        difficulty,
        score: nextRecorded.filter((r) => r.solved).length,
        total: answers.length,
        ts: Date.now(),
        aircraftResults: nextRecorded,
      });
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

  function dotState(i: number): 'todo' | 'now' | 'correct' | 'wrong' {
    if (i < scores.length) return scores[i] > 0 ? 'correct' : 'wrong';
    if (i === index) return 'now';
    return 'todo';
  }

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

<header class="bar">
  <button class="quit" onclick={onHome} aria-label="Quit">✕</button>
  <div class="dots" aria-label="Progress">
    {#each answers as _, i}
      {@const s = dotState(i)}
      <span class="dot dot-{s}"></span>
    {/each}
  </div>
  <span class="meta">{score} pts</span>
</header>

<section class="round">
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
        </div>

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
  .bar {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0 0.25rem;
  }
  .quit {
    width: 32px; height: 32px;
    border-radius: 4px;
    color: var(--muted);
    background: var(--surface);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.875rem;
    border: 1px solid var(--border);
    flex-shrink: 0;
  }
  .quit:hover { color: var(--accent); border-color: var(--panel-line); }
  .dots {
    flex: 1;
    display: flex;
    gap: 5px;
    justify-content: center;
  }
  .dot {
    width: 10px; height: 10px;
    border-radius: 4px;
    background: var(--surface-2);
    transition: background 0.2s, transform 0.2s;
  }
  .dot-correct { background: var(--good); }
  .dot-wrong { background: var(--bad); }
  .dot-now {
    background: var(--accent);
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50%      { transform: scale(1.4); opacity: 0.65; }
  }
  .meta {
    font-size: 0.8125rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .round {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
  }
  .card {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.25rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  @media (min-width: 720px) {
    .card { padding: 1.75rem 2rem; }
  }
  .card-head {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .mode-pill, .round-pill, .diff-pill {
    font-size: 0.6875rem;
    font-family: var(--font-main);
    text-transform: uppercase;
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
  }
  .mode-pill { color: var(--muted); background: var(--surface-2); }
  .round-pill { color: var(--accent); background: rgba(163, 206, 241, 0.42); }
  .diff-pill { color: var(--muted); background: var(--surface-2); margin-left: auto; }
  .diff-easy { color: var(--good); background: rgba(34, 197, 94, 0.16); }
  .diff-hard { color: var(--bad); background: rgba(239, 68, 68, 0.12); }

  .prompt {
    font-size: 0.9375rem;
    color: var(--muted);
    line-height: 1.45;
  }
  .remaining { color: var(--accent); font-weight: 600; }

  .board {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    overflow-x: auto;
  }
  .board-head, .board-row {
    display: grid;
    grid-template-columns: minmax(140px, 1.4fr) repeat(7, minmax(54px, 1fr));
    gap: 0.25rem;
    align-items: stretch;
    min-width: 540px;
  }
  .cell-label {
    font-family: var(--font-main);
    font-size: 0.625rem;
    text-transform: uppercase;
    color: var(--muted);
    text-align: center;
    padding: 0.2rem 0.1rem;
  }
  .cell-label:first-child { text-align: left; padding-left: 0.4rem; }
  .cell-label-btn {
    background: transparent;
    border: none;
    color: var(--muted);
    font: inherit;
    cursor: pointer;
    padding: 0.2rem 0.1rem;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
  }
  .cell-label-btn:hover { color: var(--accent); }
  .cell-label-btn.active { color: var(--accent); background: rgba(163, 206, 241, 0.18); }
  .info-mark { font-size: 0.7em; opacity: 0.6; margin-left: 0.1em; }
  .attr-info {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin: 0.5rem 0;
    padding: 0.7rem 0.85rem;
    background: rgba(163, 206, 241, 0.18);
    border: 1px solid rgba(96, 150, 186, 0.4);
    border-radius: 6px;
  }
  .attr-info-title {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--accent);
    font-weight: 600;
  }
  .attr-info-desc {
    font-size: 0.875rem;
    color: var(--text);
    line-height: 1.4;
  }
  .attr-info-values {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .attr-info-chip {
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
  }
  .guess-name {
    font-size: 0.8125rem;
    font-weight: 500;
    padding: 0.5rem 0.625rem;
    background: var(--surface-2);
    border-radius: 4px;
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cell {
    padding: 0.4rem 0.25rem;
    border-radius: 4px;
    font-size: 0.6875rem;
    font-family: var(--font-main);
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.1rem;
    line-height: 1.15;
    min-height: 44px;
  }
  .cell-val {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .cell-mobile-label {
    display: none;
    font-size: 0.55rem;
    font-family: var(--font-main);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.7;
    line-height: 1;
  }
  .attr-help-btn {
    display: none;
    align-self: center;
    background: transparent;
    border: 1px dashed var(--border);
    color: var(--muted);
    padding: 0.4rem 0.85rem;
    border-radius: 6px;
    font-size: 0.8125rem;
    margin-top: 0.25rem;
  }
  .attr-help-btn.active { color: var(--accent); border-color: rgba(96, 150, 186, 0.55); background: rgba(163, 206, 241, 0.15); }
  .attr-info-all { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.25rem; }
  @media (max-width: 640px) {
    .board { overflow-x: visible; }
    .board-head { display: none; }
    .board-row {
      grid-template-columns: repeat(2, 1fr);
      min-width: 0;
      gap: 0.35rem;
    }
    .guess-name { grid-column: 1 / -1; }
    .cell { min-height: 56px; padding: 0.45rem 0.4rem; }
    .cell-mobile-label { display: block; }
    .cell-val { font-size: 0.8125rem; }
    .attr-help-btn { display: inline-flex; }
  }
  .arrow { font-size: 0.625rem; opacity: 0.85; }
  .cell-hit {
    background: rgba(34, 197, 94, 0.22);
    color: var(--good);
    border: 1px solid rgba(34, 197, 94, 0.55);
  }
  .cell-close {
    background: rgba(234, 179, 8, 0.22);
    color: #b45309;
    border: 1px solid rgba(234, 179, 8, 0.55);
  }
  :global([data-theme='dark']) .cell-close { color: #facc15; }
  .cell-miss {
    background: var(--surface-2);
    color: var(--muted);
    border: 1px solid var(--border);
  }

  .combobox {
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .combobox-input {
    width: 100%;
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.7rem 0.875rem;
    font-size: 0.9375rem;
    font-family: inherit;
  }
  .combobox-input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .suggestions {
    list-style: none;
    margin: 0.35rem 0 0;
    padding: 0.25rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    max-height: 280px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .suggestions li {
    padding: 0.5rem 0.625rem;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .suggestions li.active {
    background: rgba(163, 206, 241, 0.22);
    border: 1px solid rgba(96, 150, 186, 0.5);
    padding: calc(0.5rem - 1px) calc(0.625rem - 1px);
  }
  .sugg-name {
    font-size: 0.875rem;
    color: var(--text);
    font-weight: 500;
  }
  .sugg-meta {
    font-size: 0.6875rem;
    color: var(--muted);
  }
  .no-match {
    margin-top: 0.35rem;
    color: var(--muted);
    font-size: 0.8125rem;
    padding: 0.4rem 0.625rem;
  }

  .btn-primary {
    background: var(--accent);
    color: var(--bg);
    border: none;
    padding: 0.7rem 1.1rem;
    border-radius: 6px;
    font-size: 0.9375rem;
    font-weight: 600;
    transition: opacity 0.15s, transform 0.1s;
  }
  .btn-primary:disabled { opacity: 0.4; cursor: default; }
  .btn-primary:not(:disabled):active { transform: scale(0.98); }
  .btn-ghost {
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 0.7rem 1.1rem;
    border-radius: 6px;
    font-size: 0.9375rem;
  }
  .next-btn { align-self: stretch; }

  .legend {
    display: flex;
    gap: 0.875rem;
    align-items: center;
    font-size: 0.75rem;
    color: var(--muted);
    flex-wrap: wrap;
  }
  .swatch {
    display: inline-block;
    width: 12px; height: 12px;
    border-radius: 3px;
    margin-right: 0.25rem;
    vertical-align: middle;
  }
  .swatch-hit { background: rgba(34, 197, 94, 0.55); }
  .swatch-close { background: rgba(234, 179, 8, 0.55); }
  .swatch-miss { background: var(--surface-2); border: 1px solid var(--border); }

  .finale {
    text-align: center;
    align-items: center;
    gap: 0.75rem;
  }
  .finale h2 {
    font-size: 1.5rem;
    font-weight: 600;
  }
  .finale-score {
    font-family: var(--font-main);
    font-size: 1.75rem;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .finale-sub { color: var(--muted); font-size: 0.9375rem; }
  .finale-actions {
    display: flex;
    gap: 0.625rem;
    margin-top: 0.5rem;
  }
</style>
