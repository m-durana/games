<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onMount } from 'svelte';
  import {
    aircraft,
    aircraftById,
    aircraftForDifficulty,
    pooledAircraft,
    fetchAircraftImages,
    pickRoundAircraft,
    AIRCRAFT_ROUND_LENGTH,
    type Aircraft,
    type AircraftDifficulty,
  } from './aircraft';
  import AircraftReveal from './AircraftReveal.svelte';
  import RoundBar from './RoundBar.svelte';
  import Lightbox from './Lightbox.svelte';
  import * as Sound from './sound';
  import { loadPool, saveHistoryEntry } from './engine';
  import { clearProgress, progressKey, recordProgress, sessionKey } from './progress';
  import type { AircraftIdentifyResult } from './types';
  interface SavedSession {
    v: 1;
    difficulty: AircraftDifficulty;
    pool: 'all' | 'us' | 'us_eu';
    answerIds: string[];
    index: number;
    stage: number;
    picked: string | null;
    revealed: boolean;
    wrongPicks: string[];
    lastWrong: string | null;
    totalScore: number;
    scores: number[];
    recorded: AircraftIdentifyResult[];
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
  const SESSION_KEY = sessionKey('aircraftIdentify', difficulty);
  // svelte-ignore state_referenced_locally
  const PKEY = progressKey('aircraftIdentify', difficulty);

  const aircraftPool = $derived(aircraftForDifficulty(difficulty));

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
      saved.answerIds.length > 0 &&
      saved.answerIds.every((id) => aircraftById(id) !== null);
    if (canResume) {
      return {
        answers: saved!.answerIds.map((id) => aircraftById(id)!),
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
      answers: pickRoundAircraft(AIRCRAFT_ROUND_LENGTH, difficulty),
      index: 0,
      stage: 0,
      picked: null as string | null,
      revealed: false,
      wrongPicks: [] as string[],
      lastWrong: null as string | null,
      totalScore: 0,
      scores: [] as number[],
      recorded: [] as AircraftIdentifyResult[],
    };
  })();

  let answers: Aircraft[] = $state(initial.answers);
  let showInfo = $state(false);
  let lightboxSrc: string | null = $state(null);
  let index = $state(initial.index);
  // stage: 0 = photo only, 1 = + manufacturer, 2 = + family, 3 = multiple choice
  let stage = $state(initial.stage);
  let picked: string | null = $state(initial.picked);
  let guessId = $state('');
  let revealed = $state(initial.revealed);
  let wrongPicks: string[] = $state(initial.wrongPicks);
  let lastWrong: string | null = $state(initial.lastWrong);
  let totalScore = $state(initial.totalScore);
  let scores: number[] = $state(initial.scores);
  let recorded: AircraftIdentifyResult[] = $state(initial.recorded);
  let done = $state(false);

  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    if (done) {
      clearProgress(PKEY);
      return;
    }
    if (index === 0 && recorded.length === 0 && stage === 0 && !revealed && wrongPicks.length === 0) return;
    const session: SavedSession = {
      v: 1,
      difficulty,
      pool: loadPool(),
      answerIds: answers.map((a) => a.id),
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
    recordProgress({
      key: PKEY,
      gameKind: 'aircraftIdentify',
      label: `Aircraft Identify · ${difficulty}`,
      category: 'Aircraft',
      difficulty,
      currentIndex: index,
      total: answers.length,
      savedAt: 0,
      sessionStorageKey: SESSION_KEY,
    });
  });
  let photoUrls: string[] = $state([]);
  let photoIndex = $state(0);
  let photoLoading = $state(true);

  const photoUrl = $derived(photoUrls.length > 0 ? photoUrls[photoIndex % photoUrls.length] : null);
  const hasMultiplePhotos = $derived(photoUrls.length > 1);

  const current = $derived(answers[index]);

  // Stage points scale with difficulty: Easy gives a softer curve, Hard rewards
  // a no-hint solve more and removes the multiple-choice fallback entirely.
  const stagePoints = $derived(
    difficulty === 'easy' ? [3, 2, 2, 1] : difficulty === 'hard' ? [6, 4, 2, 0] : [4, 3, 2, 1],
  );
  const maxStage = $derived(difficulty === 'hard' ? 2 : 3);

  // Grouped dropdown options - full aircraft list (a guess outside the easy pool is allowed but limits learning).
  const groupedOptions = $derived(groupByManufacturer(pooledAircraft()));

  function groupByManufacturer(list: Aircraft[]): { manufacturer: string; planes: Aircraft[] }[] {
    const map = new Map<string, Aircraft[]>();
    for (const a of list) {
      if (!map.has(a.manufacturer)) map.set(a.manufacturer, []);
      map.get(a.manufacturer)!.push(a);
    }
    return [...map.entries()]
      .map(([manufacturer, planes]) => ({ manufacturer, planes }))
      .sort((a, b) => a.manufacturer.localeCompare(b.manufacturer));
  }

  // Distractors for stage 3 multiple choice - prefer same family or same body class
  const choices = $derived(buildChoices(current));

  function buildChoices(answer: Aircraft): string[] {
    if (!answer) return [];
    const pool = aircraftPool;
    if (difficulty === 'easy') {
      const others = shuffle(pool.filter((a) => a.id !== answer.id));
      const distractors = others.slice(0, 3).map((a) => a.name);
      return shuffle([answer.name, ...distractors]);
    }
    const sameFamily = pool.filter((a) => a.id !== answer.id && a.family === answer.family);
    const sameBody = pool.filter(
      (a) => a.id !== answer.id && a.body === answer.body && a.family !== answer.family,
    );
    const others = pool.filter(
      (a) => a.id !== answer.id && a.family !== answer.family && a.body !== answer.body,
    );
    const ranked = [...shuffle(sameFamily), ...shuffle(sameBody), ...shuffle(others)];
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

  function shufflePhotos(urls: string[]): string[] {
    const a = [...urls];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async function loadPhoto(plane: Aircraft) {
    photoLoading = true;
    photoUrls = [];
    photoIndex = 0;
    const urls = await fetchAircraftImages(plane);
    if (plane.id === current?.id) {
      photoUrls = shufflePhotos(urls);
      photoLoading = false;
    }
  }

  function cyclePhoto() {
    if (photoUrls.length > 1) photoIndex = (photoIndex + 1) % photoUrls.length;
  }

  $effect(() => {
    if (current) loadPhoto(current);
  });

  function nextHint() {
    if (stage < maxStage) stage += 1;
  }

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
    const guess = aircraft.find((a) => a.id === guessId);
    if (!guess) return;
    pickChoice(guess.name);
  }

  function nextQuestion() {
    const isCorrect = picked === current.name;
    const earned = isCorrect ? stagePoints[stage] : 0;
    const result: AircraftIdentifyResult = {
      type: 'identify',
      aircraftId: current.id,
      aircraftName: current.name,
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
        mode: 'aircraftIdentify',
        difficulty,
        score: nextRecorded.filter((r) => r.correct).length,
        total: answers.length,
        ts: Date.now(),
        aircraftResults: nextRecorded,
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
    answers = pickRoundAircraft(AIRCRAFT_ROUND_LENGTH, difficulty);
    index = 0;
    stage = 0;
    picked = null;
    guessId = '';
    revealed = false;
    wrongPicks = [];
    lastWrong = null;
    totalScore = 0;
    scores = [];
    recorded = [];
    done = false;
  }

  function dotState(i: number): 'todo' | 'current' | 'correct' | 'wrong' | 'partial' {
    if (i < scores.length) {
      if (scores[i] === 0) return 'wrong';
      if (scores[i] === stagePoints[0]) return 'correct';
      return 'partial';
    }
    if (i === index) return 'current';
    return 'todo';
  }
  const progressLeds = $derived(answers.map((_, i) => dotState(i)));

  const correct = $derived(picked === current?.name);
  const maxScore = $derived(AIRCRAFT_ROUND_LENGTH * stagePoints[0]);

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Escape') onHome();
      if (e.key === 'Enter' && revealed) {
        e.preventDefault();
        nextQuestion();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
</script>

<RoundBar progress={progressLeds} score={totalScore} total={0} scoreLabel="PTS" onQuit={onHome} />

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
          <span class="mode-pill">Aircraft Identify</span>
          <span class="round-pill">{index + 1} / {answers.length}</span>
          <span class="points-pill">
            {revealed ? `+${picked === current.name ? stagePoints[stage] : 0}` : `+${stagePoints[stage]} pts`}
          </span>
        <button
          class="info-btn"
          aria-label="About this mode"
          aria-expanded={showInfo}
          onclick={() => (showInfo = !showInfo)}
        >i</button>
      
        </div>
      {#if showInfo}
        <p class="mode-info">Identify an aircraft from a photo. Take optional hints (maker, then family) at a point cost, then read the structured breakdown.</p>
      {/if}

        <div class="photo-stage">
          {#if photoUrl}
            <img src={photoUrl} alt="Aircraft to identify" class="photo zoomable" onclick={() => (lightboxSrc = photoUrl)} />
            {#if hasMultiplePhotos && !revealed}
              <button class="photo-cycle" onclick={cyclePhoto} aria-label="Show a different photo of this aircraft">
                Different photo ({(photoIndex % photoUrls.length) + 1}/{photoUrls.length})
              </button>
            {/if}
          {:else if photoLoading}
            <div class="photo-loading">Loading photo…</div>
          {:else}
            <div class="photo-loading">No photo available - see <a href="https://en.wikipedia.org/wiki/{current.wikipedia.replaceAll(' ', '_')}" target="_blank" rel="noreferrer">Wikipedia</a>.</div>
          {/if}
        </div>

        {#if !revealed}
          <div class="hints">
            {#if stage >= 1}
              <div class="hint">
                <span class="hint-tag">Hint 1 - Maker</span>
                <p>This is a <strong>{current.manufacturer}</strong>.</p>
              </div>
            {/if}
            {#if stage >= 2}
              <div class="hint">
                <span class="hint-tag">Hint 2 - Family</span>
                <p>It belongs to the <strong>{current.family}</strong> family.</p>
              </div>
            {/if}
          </div>

          {#if lastWrong}
            <div class="wrong-note">Not <strong>{lastWrong}</strong>. {stage < maxStage ? 'Here\'s another hint - try again.' : ''}</div>
          {/if}

          <div class="prompt-row">
            <p class="ask">Which aircraft is this?</p>
            {#if stage < maxStage}
              {@const cost = stagePoints[stage] - stagePoints[stage + 1]}
              {@const costLabel = cost > 0 ? ` (−${cost} pt)` : ' (free)'}
              <button class="btn-ghost hint-btn" onclick={nextHint}>
                {stage === 0 ? `Show maker${costLabel}` : stage === 1 ? `Show family${costLabel}` : `Narrow to 4 choices${costLabel}`}
              </button>
            {/if}
          </div>

          {#if stage < 3}
            <div class="guess-row">
              <select bind:value={guessId} class="guess-select">
                <option value="">Pick an aircraft…</option>
                {#each groupedOptions as group}
                  <optgroup label={group.manufacturer}>
                    {#each group.planes as a}
                      <option value={a.id}>{a.name}</option>
                    {/each}
                  </optgroup>
                {/each}
              </select>
              <button class="btn-primary" disabled={!guessId} onclick={submitDropdownGuess}>Guess</button>
            </div>
          {:else}
            <p class="ask">Pick the correct aircraft:</p>
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
          <AircraftReveal plane={current} {correct} photoUrl={null} />
          <button class="btn-primary next-btn" onclick={nextQuestion}>
            {index + 1 >= answers.length ? 'Finish round' : 'Next aircraft'}
          </button>
        {/if}
      </div>
    {/key}
  {/if}
</section>

{#if lightboxSrc}
  <Lightbox src={lightboxSrc} alt={current?.name ?? ''} onClose={() => (lightboxSrc = null)} />
{/if}

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
  .mode-pill, .round-pill, .points-pill {
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
  .points-pill { color: var(--led-green); }

  /* photo stage = camera frame */
  .photo-stage {
    position: relative;
    background: #1a1d22;
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .photo {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #0c0e11;
  }
  .photo.zoomable { cursor: zoom-in; }
  .photo-loading {
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--label-dim);
  }
  .photo-cycle {
    position: absolute;
    bottom: 0.5rem;
    right: 0.5rem;
    font-family: var(--mono);
    font-size: 0.6rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--label);
    background: rgba(12, 14, 17, 0.78);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    padding: 0.32rem 0.55rem;
    border-radius: 1px;
    cursor: pointer;
  }
  .photo-cycle:hover { color: var(--led-cyan); }

  /* hints */
  .hints {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .hint {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0.7rem;
    background: var(--panel-2);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 1px;
    cursor: pointer;
    text-align: left;
  }
  .hint:hover { color: var(--label); }
  .hint:active {
    border-color: var(--bezel-lo);
    border-bottom-color: var(--bezel-hi);
    border-right-color: var(--bezel-hi);
  }
  .hint[disabled] {
    background: rgba(74, 222, 128, 0.06);
    border-color: rgba(74, 222, 128, 0.4);
    cursor: default;
  }
  .hint-tag {
    font-family: var(--mono);
    font-size: 0.6rem;
    letter-spacing: 0.18em;
    color: var(--label-dim);
    text-transform: uppercase;
    font-weight: 700;
  }

  .ask, .prompt-row {
    font-family: var(--mono);
    font-size: 0.78rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    text-align: center;
    color: var(--led-cyan);
    font-weight: 700;
    margin-top: 0.4rem;
  }

  .guess-row {
    display: flex;
    gap: 0.4rem;
    align-items: stretch;
  }
  .guess-select {
    flex: 1;
    background: var(--mfd-bg);
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
    padding: 0.65rem 0.85rem;
    font-family: var(--mono);
    font-size: 0.82rem;
    color: var(--mfd-text);
    letter-spacing: 0.04em;
    outline: none;
    appearance: none;
    -webkit-appearance: none;
    text-transform: uppercase;
  }
  .guess-select:focus { border-color: var(--mfd-text); }
  .guess-select option { background: var(--mfd-bg); color: var(--mfd-text); }
  .guess-select optgroup { color: var(--mfd-dim); font-style: normal; font-weight: 700; }

  .options {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.55rem;
  }
  @media (max-width: 600px) { .options { grid-template-columns: 1fr; } }
  .options.disabled { pointer-events: none; }
  .option {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.8rem 0.85rem;
    background: var(--panel-2);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 1px;
    cursor: pointer;
    text-align: left;
  }
  .option:hover .opt-text { color: #fff; }
  .option:active {
    border-color: var(--bezel-lo);
    border-bottom-color: var(--bezel-hi);
    border-right-color: var(--bezel-hi);
  }
  .option-wrong {
    border-color: var(--led-red);
    background: rgba(248, 113, 113, 0.06);
    cursor: default;
  }
  .option-wrong .opt-text { color: var(--led-red); }
  .opt-text {
    font-family: var(--sans);
    font-weight: 700;
    font-size: 0.92rem;
    color: var(--label);
  }

  .wrong-note {
    font-family: var(--sans);
    font-size: 0.78rem;
    color: var(--led-amber);
    background: rgba(251, 191, 36, 0.06);
    border: 1px solid rgba(251, 191, 36, 0.35);
    border-radius: 1px;
    padding: 0.55rem 0.7rem;
    line-height: 1.45;
  }

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
  .finale-actions { display: flex; justify-content: center; gap: 0.45rem; margin-top: 0.4rem; }

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
  .btn-primary:disabled { color: var(--label-faint); cursor: not-allowed; }
  .btn-primary:not(:disabled):hover { color: #b0ecf6; }
  .btn-primary:not(:disabled):active {
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

  .info-btn { margin-left: auto; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-family: var(--mono); font-weight: 700; font-style: italic; font-size: 0.72rem; color: var(--label-dim); background: var(--panel-2); border: 1px solid var(--bezel-hi); border-bottom-color: var(--bezel-lo); border-right-color: var(--bezel-lo); border-radius: 1px; cursor: pointer; }
  .info-btn:hover { color: var(--led-cyan); border-color: var(--led-cyan); }
  .info-btn:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
  .info-btn[aria-expanded="true"] { color: var(--led-cyan); border-color: var(--led-cyan); }
  .mode-info { font-family: var(--sans); font-size: 0.82rem; line-height: 1.5; color: var(--label-2); background: var(--panel-2); border: 1px solid var(--bezel-lo); border-radius: 1px; padding: 0.7rem 0.85rem; margin: 0; }
</style>
