<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onMount } from 'svelte';
  import {
    airportAerialUrl,
    airportApprovedPhotos,
    airportEntryByIata,
    pooledAirports,
    airportsForDifficulty,
    pickRoundAirport,
    AIRPORT_ROUND_LENGTH,
    regionOf,
    regionLabel,
    type AirportEntry,
    type AirportDifficulty,
  } from './airports-game';
  import AirportReveal from './AirportReveal.svelte';
  import * as Sound from './sound';
  import { loadPool, saveHistoryEntry } from './engine';
  import type { AirportIdentifyResult } from './types';

  const SESSION_KEY = 'identify:airport:session';
  interface SavedSession {
    v: 1;
    difficulty: AirportDifficulty;
    pool: 'all' | 'us' | 'us_eu';
    answerIatas: string[];
    index: number;
    stage: number;
    picked: string | null;
    revealed: boolean;
    wrongPicks: string[];
    lastWrong: string | null;
    totalScore: number;
    scores: number[];
    recorded: AirportIdentifyResult[];
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

  const pool = $derived(airportsForDifficulty(difficulty));

  // svelte-ignore state_referenced_locally
  const initial = (() => {
    const saved = loadSession();
    // svelte-ignore state_referenced_locally
    const currentPool = loadPool();
    const canResume =
      !!saved &&
      // svelte-ignore state_referenced_locally
      saved.difficulty === difficulty &&
      saved.pool === currentPool &&
      saved.answerIatas.length > 0 &&
      saved.answerIatas.every((iata) => airportEntryByIata(iata) !== null);
    if (canResume) {
      return {
        answers: saved!.answerIatas.map((iata) => airportEntryByIata(iata)!),
        index: saved!.index,
        stage: saved!.stage,
        picked: saved!.picked,
        revealed: saved!.revealed,
        wrongPicks: saved!.wrongPicks,
        lastWrong: saved!.lastWrong,
        totalScore: saved!.totalScore,
        scores: saved!.scores,
        recorded: saved!.recorded,
      };
    }
    // svelte-ignore state_referenced_locally
    return {
      answers: pickRoundAirport(AIRPORT_ROUND_LENGTH, difficulty),
      index: 0,
      stage: 0,
      picked: null as string | null,
      revealed: false,
      wrongPicks: [] as string[],
      lastWrong: null as string | null,
      totalScore: 0,
      scores: [] as number[],
      recorded: [] as AirportIdentifyResult[],
    };
  })();

  let answers: AirportEntry[] = $state(initial.answers);
  let index = $state(initial.index);
  // stage: 0 = photo only, 1 = + maker, 2 = + role+origin, 3 = multiple choice
  let stage = $state(initial.stage);
  let picked: string | null = $state(initial.picked);
  let guessId = $state('');
  let revealed = $state(initial.revealed);
  let wrongPicks: string[] = $state(initial.wrongPicks);
  let lastWrong: string | null = $state(initial.lastWrong);
  let totalScore = $state(initial.totalScore);
  let scores: number[] = $state(initial.scores);
  let recorded: AirportIdentifyResult[] = $state(initial.recorded);
  let done = $state(false);

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
      stage,
      picked,
      revealed,
      wrongPicks,
      lastWrong,
      totalScore,
      scores,
      recorded,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  });
  let showGallery = $state(false);

  const current = $derived(answers[index]);
  const aerialUrl = $derived(current ? airportAerialUrl(current.iata) : null);
  const groundPhotos = $derived(current ? airportApprovedPhotos(current.iata) : []);

  const stagePoints = $derived(
    difficulty === 'easy' ? [3, 2, 2, 1] : difficulty === 'hard' ? [6, 4, 2, 0] : [4, 3, 2, 1],
  );
  const maxStage = $derived(difficulty === 'hard' ? 2 : 3);

  // Group dropdown by region for fast scanning.
  const groupedOptions = $derived(groupByRegion(pooledAirports()));
  function groupByRegion(list: AirportEntry[]): { region: string; airports: AirportEntry[] }[] {
    const map = new Map<string, AirportEntry[]>();
    for (const a of list) {
      const r = regionOf(a.country);
      const label = r ? regionLabel(r) : 'Other';
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(a);
    }
    return [...map.entries()]
      .map(([region, airports]) => ({ region, airports: airports.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.region.localeCompare(b.region));
  }

  const choices = $derived(buildChoices(current));
  function buildChoices(answer: AirportEntry): string[] {
    if (!answer) return [];
    if (difficulty === 'easy') {
      const others = shuffle(pool.filter((a) => a.iata !== answer.iata));
      const distractors = others.slice(0, 3).map((a) => a.name);
      return shuffle([answer.name, ...distractors]);
    }
    const ar = regionOf(answer.country);
    const sameCountry = pool.filter((a) => a.iata !== answer.iata && a.country === answer.country);
    const sameRegion = pool.filter(
      (a) => a.iata !== answer.iata && a.country !== answer.country && regionOf(a.country) === ar,
    );
    const others = pool.filter(
      (a) => a.iata !== answer.iata && regionOf(a.country) !== ar,
    );
    const ranked = [...shuffle(sameCountry), ...shuffle(sameRegion), ...shuffle(others)];
    const distractors = ranked.slice(0, 3).map((a) => a.name);
    return shuffle([answer.name, ...distractors]);
  }

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  $effect(() => {
    // Each new airport: collapse the gallery so the player starts on the aerial.
    void current;
    showGallery = false;
  });

  function nextHint() { if (stage < maxStage) stage += 1; }

  function pickChoice(option: string) {
    if (picked) return;
    const isCorrect = option === current.name;
    if (isCorrect) {
      picked = option;
      totalScore += stagePoints[stage];
      revealed = true;
      Sound.correct();
      Sound.vibrate(15);
      return;
    }
    Sound.wrong();
    Sound.vibrate(35);
    if (!wrongPicks.includes(option)) wrongPicks = [...wrongPicks, option];
    lastWrong = option;
    if (stage < maxStage) {
      stage += 1;
      guessId = '';
    } else {
      picked = option;
      revealed = true;
    }
  }

  function submitDropdownGuess() {
    if (!guessId || picked) return;
    const guess = pooledAirports().find((a) => a.iata === guessId);
    if (!guess) return;
    pickChoice(guess.name);
  }

  function nextQuestion() {
    const isCorrect = picked === current.name;
    const earned = isCorrect ? stagePoints[stage] : 0;
    const result: AirportIdentifyResult = {
      type: 'apt-identify',
      airportIata: current.iata,
      airportName: current.name,
      picked,
      hintStage: stage,
      correct: isCorrect,
      earned,
    };
    const nextRecorded = [...recorded, result];
    scores = [...scores, earned];
    recorded = nextRecorded;
    if (index + 1 >= answers.length) {
      done = true;
      saveHistoryEntry({
        mode: 'airportIdentify',
        difficulty,
        score: nextRecorded.filter((r) => r.correct).length,
        total: answers.length,
        ts: Date.now(),
        airportResults: nextRecorded,
      });
      return;
    }
    index += 1;
    stage = 0;
    picked = null;
    guessId = '';
    revealed = false;
    wrongPicks = [];
    lastWrong = null;
  }

  function playAgain() {
    answers = pickRoundAirport(AIRPORT_ROUND_LENGTH, difficulty);
    index = 0; stage = 0; picked = null; guessId = ''; revealed = false;
    wrongPicks = []; lastWrong = null;
    totalScore = 0; scores = []; recorded = []; done = false;
  }

  function dotState(i: number): 'todo' | 'now' | 'correct' | 'wrong' | 'partial' {
    if (i < scores.length) {
      if (scores[i] === 0) return 'wrong';
      if (scores[i] === stagePoints[0]) return 'correct';
      return 'partial';
    }
    if (i === index) return 'now';
    return 'todo';
  }

  const correct = $derived(picked === current?.name);
  const maxScore = $derived(AIRPORT_ROUND_LENGTH * stagePoints[0]);

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Escape') onHome();
      if (e.key === 'Enter' && revealed) { e.preventDefault(); nextQuestion(); }
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
  <span class="meta">{totalScore} pts</span>
</header>

<section class="round">
  {#if done}
    <div class="card finale" in:fly={{ y: 16, duration: 220 }}>
      <h2>Round complete</h2>
      <p class="finale-score">{totalScore} / {maxScore}</p>
      <p class="finale-sub">{scores.filter((s) => s > 0).length} of {answers.length} identified</p>
      <div class="finale-actions">
        <button class="btn-primary" onclick={playAgain}>Play again</button>
        <button class="btn-ghost" onclick={onHome}>Home</button>
      </div>
    </div>
  {:else}
    {#key index}
      <div class="card" in:fly={{ y: 16, duration: 220 }}>
        <div class="card-head">
          <span class="mode-pill">Airport Identify</span>
          <span class="round-pill">{index + 1} / {answers.length}</span>
          <span class="points-pill">
            {revealed ? `+${picked === current.name ? stagePoints[stage] : 0}` : `+${stagePoints[stage]} pts`}
          </span>
        </div>

        <div class="photo-stage">
          {#if aerialUrl}
            <img src={aerialUrl} alt="Airport aerial to identify" class="photo" />
            {#if groundPhotos.length > 0 && !revealed}
              <button class="photo-cycle" onclick={() => (showGallery = !showGallery)} aria-expanded={showGallery}>
                {showGallery ? 'Hide images' : `Show me images (${groundPhotos.length})`}
              </button>
            {/if}
          {:else}
            <div class="photo-loading">No aerial available for this airport.</div>
          {/if}
        </div>

        {#if showGallery && groundPhotos.length > 0 && !revealed}
          <div class="gallery">
            {#each groundPhotos as url, i}
              <img src={url} alt={`${current.name} photo ${i + 1}`} loading="lazy" />
            {/each}
          </div>
        {/if}

        {#if !revealed}
          <div class="hints">
            {#if stage >= 1}
              <div class="hint">
                <span class="hint-tag">Hint 1 - Country</span>
                <p>In <strong>{current.country}</strong>.</p>
              </div>
            {/if}
            {#if stage >= 2}
              <div class="hint">
                <span class="hint-tag">Hint 2 - Hub alliance & city</span>
                <p>Hub for <strong>{current.hubAlliance}</strong> · {current.city}</p>
              </div>
            {/if}
          </div>

          {#if lastWrong}
            <div class="wrong-note">Not <strong>{lastWrong}</strong>. {stage < maxStage ? 'Here\'s another hint - try again.' : ''}</div>
          {/if}

          <div class="prompt-row">
            <p class="ask">Which airport is this?</p>
            {#if stage < maxStage}
              {@const cost = stagePoints[stage] - stagePoints[stage + 1]}
              {@const costLabel = cost > 0 ? ` (−${cost} pt)` : ' (free)'}
              <button class="btn-ghost hint-btn" onclick={nextHint}>
                {stage === 0 ? `Show country${costLabel}` : stage === 1 ? `Show alliance & city${costLabel}` : `Narrow to 4 choices${costLabel}`}
              </button>
            {/if}
          </div>

          {#if stage < 3}
            <div class="guess-row">
              <select bind:value={guessId} class="guess-select">
                <option value="">Pick an airport…</option>
                {#each groupedOptions as group}
                  <optgroup label={group.region}>
                    {#each group.airports as a}
                      <option value={a.iata}>{a.name} ({a.iata})</option>
                    {/each}
                  </optgroup>
                {/each}
              </select>
              <button class="btn-primary" disabled={!guessId} onclick={submitDropdownGuess}>Guess</button>
            </div>
          {:else}
            <p class="ask">Pick the correct airport:</p>
            <div class="options">
              {#each choices as option}
                {@const isWrong = wrongPicks.includes(option)}
                <button class="option" class:option-wrong={isWrong} disabled={isWrong} onclick={() => pickChoice(option)}>
                  <span class="opt-text">{option}</span>
                </button>
              {/each}
            </div>
          {/if}
        {:else}
          <AirportReveal airport={current} {correct} photoUrl={null} />
          <button class="btn-primary next-btn" onclick={nextQuestion}>
            {index + 1 >= answers.length ? 'Finish round' : 'Next airport'}
          </button>
        {/if}
      </div>
    {/key}
  {/if}
</section>

<style>
  .bar { width: 100%; display: flex; align-items: center; gap: 0.625rem; padding: 0 0.25rem; }
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
  .dots { flex: 1; display: flex; gap: 5px; justify-content: center; }
  .dot {
    width: 10px; height: 10px;
    border-radius: 4px;
    background: var(--surface-2);
    transition: background 0.2s, transform 0.2s;
  }
  .dot-correct { background: var(--good); }
  .dot-wrong { background: var(--bad); }
  .dot-partial { background: var(--accent); opacity: 0.7; }
  .dot-now { background: var(--accent); animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50%      { transform: scale(1.4); opacity: 0.65; }
  }
  .meta { font-size: 0.8125rem; color: var(--muted); font-variant-numeric: tabular-nums; flex-shrink: 0; }
  .round { flex: 1; display: flex; flex-direction: column; width: 100%; }
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
  @media (min-width: 720px) { .card { padding: 1.75rem 2rem; } }
  .card-head { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
  .mode-pill, .round-pill, .points-pill {
    font-size: 0.6875rem;
    font-family: var(--font-main);
    text-transform: uppercase;
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
  }
  .mode-pill { color: var(--muted); background: var(--surface-2); }
  .round-pill { color: var(--accent); background: rgba(163, 206, 241, 0.42); }
  .points-pill {
    color: var(--good);
    background: rgba(34, 197, 94, 0.16);
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }
  .photo-stage {
    position: relative;
    width: 100%;
    height: clamp(220px, 42vh, 380px);
    background: var(--surface-2);
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .photo-cycle {
    position: absolute;
    bottom: 0.5rem;
    right: 0.5rem;
    background: rgba(3, 7, 10, 0.72);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.35rem 0.625rem;
    font-size: 0.75rem;
    font-family: var(--font-main);
    backdrop-filter: blur(4px);
  }
  .photo-cycle:hover { border-color: var(--accent); color: var(--accent); }
  .photo { width: 100%; height: 100%; object-fit: contain; display: block; }
  .photo-loading { color: var(--muted); font-size: 0.875rem; padding: 1rem; text-align: center; }
  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.4rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.5rem;
  }
  .gallery img {
    width: 100%;
    aspect-ratio: 1 / 1;
    object-fit: cover;
    border-radius: 4px;
    background: #fff;
    cursor: zoom-in;
  }
  .hints { display: flex; flex-direction: column; gap: 0.5rem; }
  .hint {
    padding: 0.625rem 0.75rem;
    background: rgba(163, 206, 241, 0.18);
    border: 1px solid rgba(96, 150, 186, 0.32);
    border-radius: 6px;
    display: flex; flex-direction: column; gap: 0.2rem;
  }
  .hint-tag {
    font-family: var(--font-main);
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--accent);
  }
  .hint p { font-size: 0.875rem; color: var(--text); }
  .prompt-row {
    display: flex; align-items: center; justify-content: space-between;
    gap: 0.75rem; flex-wrap: wrap;
  }
  .ask { color: var(--muted); font-size: 0.9375rem; }
  .hint-btn { font-size: 0.8125rem; padding: 0.5rem 0.75rem; }
  .guess-row { display: flex; gap: 0.5rem; align-items: stretch; }
  .guess-select {
    flex: 1;
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.7rem 0.75rem;
    font-size: 0.9375rem;
    font-family: inherit;
  }
  .guess-select:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .options { display: flex; flex-direction: column; gap: 0.5rem; }
  @media (min-width: 720px) { .options { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; } }
  .option {
    display: flex; align-items: center; gap: 0.75rem;
    text-align: left;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.875rem 1.125rem;
    min-height: 52px;
    font-size: 1rem;
    transition: background 0.15s, border-color 0.15s, transform 0.1s;
  }
  .option:hover { border-color: var(--panel-line); background: var(--surface-3, var(--surface-2)); }
  .option:active { transform: scale(0.98); }
  .option-wrong { opacity: 0.45; text-decoration: line-through; cursor: not-allowed; }
  .option-wrong:hover { border-color: var(--border); background: var(--surface-2); }
  .wrong-note {
    padding: 0.55rem 0.75rem;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.32);
    border-radius: 6px;
    font-size: 0.8125rem;
    color: var(--text);
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
  .btn-primary:not(:disabled):active { transform: scale(0.98); }
  .btn-ghost {
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 0.5rem 0.875rem;
    border-radius: 6px;
    font-size: 0.875rem;
  }
  .btn-ghost:hover { border-color: var(--panel-line); }
  .next-btn { align-self: stretch; }
  .finale { text-align: center; align-items: center; gap: 0.75rem; }
  .finale h2 { font-size: 1.5rem; font-weight: 600; }
  .finale-score {
    font-family: var(--font-main);
    font-size: 1.75rem;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .finale-sub { color: var(--muted); font-size: 0.9375rem; }
  .finale-actions { display: flex; gap: 0.625rem; margin-top: 0.5rem; }
</style>
