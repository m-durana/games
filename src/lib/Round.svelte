<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onMount } from 'svelte';
  import type { Difficulty, Mode, Question, RoundResult } from './types';
  import {
    airportLabel,
    airportLabelWithCountry,
    buildDailyRound,
    buildMixedRound,
    buildRound,
    explainAnswer,
    loadPool,
    loadSettings,
    modeLabel,
    modeTitle,
    ROUND_LENGTH,
    saveBestStreak,
    tailEntry,
    todayKey,
  } from './engine';
  import { recordModePlayed } from './achievements';
  import { clearProgress, progressKey, recordProgress, sessionKey } from './progress';
  import * as Sound from './sound';
  import Logo from './Logo.svelte';
  import AllianceLogo from './AllianceLogo.svelte';
  import { airlines as allAirlines } from './engine';

  interface Props {
    mode: Mode;
    difficulty: Difficulty;
    daily?: boolean;
    mixed?: boolean;
    onFinish: (results: RoundResult[]) => void;
    onQuit: () => void;
  }

  let { mode, difficulty, daily = false, mixed = false, onFinish, onQuit }: Props = $props();

  // svelte-ignore state_referenced_locally
  const SESSION_KEY = sessionKey('standard', difficulty, mode);
  // svelte-ignore state_referenced_locally
  const PKEY = progressKey('standard', difficulty, mode);
  interface SavedRound {
    v: 1;
    mode: Mode;
    difficulty: Difficulty;
    pool: 'all' | 'us' | 'us_eu';
    questions: Question[];
    index: number;
    picked: string | null;
    selected: string[];
    submitted: boolean;
    results: RoundResult[];
    streak: number;
  }
  function loadRoundSession(): SavedRound | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as SavedRound;
      if (s.v !== 1) return null;
      return s;
    } catch {
      return null;
    }
  }

  // svelte-ignore state_referenced_locally
  const initial = (() => {
    if (daily || mixed) {
      return {
        // svelte-ignore state_referenced_locally
        questions: daily ? buildDailyRound(todayKey()) : buildMixedRound(),
        index: 0,
        picked: null as string | null,
        selected: [] as string[],
        submitted: false,
        results: [] as RoundResult[],
        streak: 0,
      };
    }
    const saved = loadRoundSession();
    // svelte-ignore state_referenced_locally
    const currentPool = loadPool();
    const canResume =
      !!saved &&
      // svelte-ignore state_referenced_locally
      saved.mode === mode &&
      // svelte-ignore state_referenced_locally
      saved.difficulty === difficulty &&
      saved.pool === currentPool &&
      saved.questions.length > 0 &&
      saved.index < saved.questions.length;
    if (canResume) {
      return {
        questions: saved!.questions,
        index: saved!.index,
        picked: saved!.picked,
        selected: saved!.selected,
        submitted: saved!.submitted,
        results: saved!.results,
        streak: saved!.streak,
      };
    }
    // svelte-ignore state_referenced_locally
    return {
      questions: buildRound(mode, difficulty),
      index: 0,
      picked: null as string | null,
      selected: [] as string[],
      submitted: false,
      results: [] as RoundResult[],
      streak: 0,
    };
  })();

  let questions: Question[] = $state(initial.questions);
  let index = $state(initial.index);
  let picked: string | null = $state(initial.picked);
  let selected: string[] = $state(initial.selected);
  let submitted = $state(initial.submitted);
  let results: RoundResult[] = $state(initial.results);
  let streak = $state(initial.streak);
  let advanceTimer: number | null = null;

  const AIRLINE_MODES = new Set<Mode>(['group','alliance','hub','logo','country','reverseGroup','tail']);
  // svelte-ignore state_referenced_locally
  const category = AIRLINE_MODES.has(mode) ? 'Airlines' : 'Airports';

  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    if (daily || mixed) return;
    if (index === 0 && results.length === 0) return;
    const session: SavedRound = {
      v: 1,
      mode,
      difficulty,
      pool: loadPool(),
      questions,
      index,
      picked,
      selected,
      submitted,
      results,
      streak,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    recordProgress({
      key: PKEY,
      gameKind: 'standard',
      label: `${modeTitle(mode)} · ${difficulty}`,
      category,
      mode,
      difficulty,
      currentIndex: index,
      total: questions.length,
      savedAt: 0,
      sessionStorageKey: SESSION_KEY,
    });
  });

  const current = $derived(questions[index]);
  const isMulti = $derived(current?.mode === 'reverseGroup' && Array.isArray(current?.answers));
  const correctSet = $derived(new Set(current?.answers ?? []));
  const requiredCount = $derived(current?.answers?.length ?? 0);

  // svelte-ignore state_referenced_locally
  const showKeys = loadSettings().keyboardHints;

  const score = $derived(results.filter((r) => r.correct).length);
  const explainModes = new Set<Mode>(['country', 'reverseGroup', 'tail']);
  const inlineAskModes = new Set<Mode>(['reverseGroup', 'airportAirline', 'airportConn', 'whereAmI', 'hubOf', 'code']);
  const showQAsk = $derived(
    !!current
    && !inlineAskModes.has(current.mode)
    && !(current.mode === 'country' && current.promptKind === 'airport')
  );

  // svelte-ignore state_referenced_locally
  if (!daily) recordModePlayed(mode);

  function choose(option: string) {
    if (isMulti) {
      if (submitted) return;
      if (selected.includes(option)) {
        selected = selected.filter((s) => s !== option);
      } else {
        selected = [...selected, option];
      }
      return;
    }
    if (picked !== null) return;
    picked = option;
    const correct = option === current.answer;
    if (correct) {
      streak += 1;
      // svelte-ignore state_referenced_locally
      saveBestStreak(daily ? 'daily' : mode, streak);
      Sound.correct();
      Sound.vibrate(15);
    } else {
      streak = 0;
      Sound.wrong();
      Sound.vibrate(35);
    }
    const nextResults = [...results, { question: current, picked: option, correct }];
    results = nextResults;
    advanceTimer = window.setTimeout(() => advance(nextResults), 1400);
  }

  function submitMulti() {
    if (!isMulti || submitted) return;
    if (selected.length === 0) return;
    submitted = true;
    const sel = new Set(selected);
    let correct = sel.size === correctSet.size;
    if (correct) for (const a of correctSet) if (!sel.has(a)) { correct = false; break; }
    if (correct) {
      streak += 1;
      saveBestStreak(daily ? 'daily' : mode, streak);
      Sound.correct();
      Sound.vibrate(15);
    } else {
      streak = 0;
      Sound.wrong();
      Sound.vibrate(35);
    }
    const nextResults = [...results, { question: current, picked: selected.join(', '), correct }];
    results = nextResults;
    advanceTimer = window.setTimeout(() => advance(nextResults), 1800);
  }

  function advance(finalResults = results) {
    if (index + 1 >= questions.length) {
      if (!daily && !mixed) {
        clearProgress(PKEY);
      }
      onFinish(finalResults);
      return;
    }
    index += 1;
    picked = null;
    selected = [];
    submitted = false;
  }

  function statusFor(option: string): 'idle' | 'selected' | 'correct' | 'wrong' | 'reveal' | 'missed' {
    if (isMulti) {
      if (!submitted) return selected.includes(option) ? 'selected' : 'idle';
      const isCorrect = correctSet.has(option);
      const wasSelected = selected.includes(option);
      if (wasSelected && isCorrect) return 'correct';
      if (wasSelected && !isCorrect) return 'wrong';
      if (!wasSelected && isCorrect) return 'missed';
      return 'reveal';
    }
    if (picked === null) return 'idle';
    if (option === current.answer) return 'correct';
    if (option === picked) return 'wrong';
    return 'reveal';
  }

  function ledClass(i: number): string {
    if (i < results.length) return results[i].correct ? 'correct' : 'wrong';
    if (i === index) return 'current';
    return '';
  }

  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onQuit(); return; }
      if (isMulti) {
        if (submitted) return;
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= current.options.length) {
          choose(current.options[n - 1]);
        } else if (e.key === 'Enter' && selected.length > 0) {
          submitMulti();
        }
        return;
      }
      if (picked !== null) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= current.options.length) {
        choose(current.options[n - 1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
</script>

<!-- HEADER bar: quit (left), progress LEDs, score+streak -->
<header class="r-bar">
  <button class="quit-btn" type="button" onclick={onQuit} aria-label="Quit">✕ Quit</button>
  <span class="progress-leds" aria-label="Progress">
    {#each questions as _, i}
      <span class="p-led {ledClass(i)}"></span>
    {/each}
  </span>
  <span class="r-meta">
    {#if streak >= 3}
      <span class="r-streak" title="Streak">🔥 ×{streak}</span>
    {/if}
    <span class="r-score">SCORE <b>{score}</b>/{ROUND_LENGTH}</span>
  </span>
</header>

<section class="r-section">
  {#key index}
    <div class="bezel q-bezel" data-label={modeTitle(current.mode)} in:fly={{ y: 16, duration: 220 }}>
      <span class="bezel-aux">
        Q{index + 1} / {questions.length}
        {#if daily}· DAILY{/if}
        {#if mixed}· MIX{/if}
      </span>

      <div class="q-stage">
        {#if current.mode === 'logo'}
          <div class="logo-stage">
            <Logo iata={current.airline.iata} name={current.airline.name} big />
          </div>
        {:else if current.mode === 'tail'}
          {@const t = tailEntry(current.airline.iata)}
          {#if t}
            {#if t.crop}
              <div class="tail-stage">
                <img
                  src={t.thumb ?? t.url}
                  alt="Aircraft tail"
                  class="tail-crop"
                  style="width:{100 / t.crop.w}%; height:{100 / t.crop.h}%; left:{(-t.crop.x / t.crop.w) * 100}%; top:{(-t.crop.y / t.crop.h) * 100}%;"
                />
              </div>
            {:else}
              <div class="tail-stage">
                <img src={t.thumb ?? t.url} alt="Aircraft tail" class="tail-fill" />
              </div>
            {/if}
          {/if}
        {:else if current.mode === 'reverseGroup'}
          <div class="prompt-block">
            <span class="prompt-label">Select all airlines that belong to</span>
            <h2>{current.airline.group}</h2>
          </div>
        {:else if current.mode === 'airportAirline' || current.mode === 'airportConn'}
          <div class="prompt-block">
            <span class="prompt-label">{modeLabel(current.mode)}</span>
            <h2>
              {current.mode === 'airportConn'
                ? airportLabelWithCountry(current.airport ?? current.airline.hub)
                : airportLabel(current.airport ?? current.airline.hub)}
            </h2>
          </div>
        {:else if current.mode === 'whereAmI'}
          <div class="prompt-block">
            <span class="prompt-label">Top destinations from this airport</span>
            <ul class="dest-list">
              {#each current.destinations ?? [] as code}
                <li>{airportLabelWithCountry(code)}</li>
              {/each}
            </ul>
            <span class="prompt-inline-ask">→ Which airport is this?</span>
          </div>
        {:else if current.mode === 'hubOf'}
          <div class="prompt-block">
            <span class="prompt-label">Primary hub for which airline?</span>
            <h2>{airportLabelWithCountry(current.airport ?? current.airline.hub)}</h2>
          </div>
        {:else if current.mode === 'country' && current.promptKind === 'airport'}
          <div class="prompt-block">
            <span class="prompt-label">Which country is this airport in?</span>
            <h2>{airportLabel(current.airport ?? current.airline.hub)}</h2>
          </div>
        {:else if current.mode === 'code'}
          <div class="prompt-block">
            <span class="prompt-label">
              {#if current.promptKind === 'icao'}ICAO code
              {:else if current.promptKind === 'callsign'}Radio callsign
              {:else}IATA code{/if}
            </span>
            <div class="code-stage">{current.prompt}</div>
            <span class="prompt-inline-ask">→ Which airline?</span>
          </div>
        {:else if current.mode === 'airlineDest'}
          <div class="airline">
            <Logo iata={current.airline.iata} name={current.airline.name} />
            <div class="airline-text">
              <h2>{current.airline.name}</h2>
              <span class="country">{current.airline.country} · {current.airline.iata}</span>
            </div>
          </div>
        {:else}
          <div class="airline">
            <Logo iata={current.airline.iata} name={current.airline.name} />
            <div class="airline-text">
              <h2>{current.airline.name}</h2>
              <span class="country">
                {#if current.mode === 'country' || current.mode === 'hub'}
                  {current.airline.iata}
                {:else}
                  {current.airline.country} · {current.airline.iata}
                {/if}
              </span>
            </div>
          </div>
        {/if}
      </div>

      {#if showQAsk}
        <p class="q-ask">→ {modeLabel(current.mode)}?</p>
      {/if}

      <div class="opts" class:disabled={isMulti ? submitted : picked !== null}>
        {#each current.options as option, i}
          {@const s = statusFor(option)}
          <button
            class="opt"
            class:selected={s === 'selected'}
            class:correct={s === 'correct'}
            class:wrong={s === 'wrong'}
            class:reveal={s === 'reveal'}
            class:missed={s === 'missed'}
            disabled={isMulti ? submitted : picked !== null}
            onclick={() => choose(option)}
          >
            <span class="opt-key">{i + 1}</span>
            <span class="opt-body">
              {#if current.mode === 'alliance'}
                <span class="opt-alliance"><AllianceLogo alliance={option} /><span class="opt-text">{option}</span></span>
              {:else if current.mode === 'airportConn'}
                <span class="opt-text">{airportLabelWithCountry(option)}</span>
              {:else if current.mode === 'hub' || current.mode === 'airlineDest'}
                <span class="opt-text">{airportLabel(option)}</span>
              {:else if current.mode === 'whereAmI'}
                <span class="opt-text">{airportLabelWithCountry(option)}</span>
              {:else if current.mode === 'airportAirline'}
                {@const airlineForOpt = allAirlines.find((x) => x.iata === option)}
                <span class="opt-with-logo">
                  {#if airlineForOpt}
                    <Logo iata={airlineForOpt.iata} name={airlineForOpt.name} />
                  {/if}
                  <span class="opt-text">{airlineForOpt?.name ?? option}</span>
                </span>
              {:else}
                <span class="opt-text">{option}</span>
              {/if}
              {#if isMulti && submitted && s === 'wrong'}
                {@const aw = allAirlines.find((x) => x.name === option)}
                <span class="opt-explain">Belongs to {aw?.group ?? 'no group'}</span>
              {/if}
              {#if isMulti && submitted && s === 'missed'}
                <span class="opt-explain missed-note">You missed this one</span>
              {/if}
              {#if !isMulti && explainModes.has(current.mode) && picked !== null && picked !== current.answer && option === current.answer}
                <span class="opt-explain">{explainAnswer(current)}</span>
              {/if}
            </span>
            <span class="opt-led"></span>
          </button>
        {/each}
      </div>

      {#if isMulti && !submitted}
        <button
          class="confirm-btn"
          disabled={selected.length === 0}
          onclick={submitMulti}
        >
          Confirm{selected.length > 0 ? ` · ${selected.length} selected` : ''}
        </button>
      {/if}
    </div>
  {/key}

  {#if showKeys}
    <div class="kb-legend" aria-hidden="true">
      <span><kbd>1</kbd>–<kbd>{current?.options.length ?? 4}</kbd> pick</span>
      {#if isMulti}<span><kbd>Enter</kbd> confirm</span>{/if}
      <span><kbd>Esc</kbd> quit</span>
    </div>
  {/if}
</section>

<style>
  /* ─── header bar ─────────────────────────── */
  .r-bar {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.5rem 0.65rem;
    background: var(--panel-2);
    border: 1px solid var(--bezel-lo);
    border-radius: 2px;
  }
  .progress-leds {
    flex: 1;
    display: inline-flex;
    gap: 0.32rem;
  }
  .p-led {
    width: 14px; height: 14px;
    border-radius: 50%;
    background: var(--led-off);
    border: 1px solid var(--bezel-lo);
  }
  .p-led.correct { background: var(--led-green); }
  .p-led.wrong   { background: var(--led-red); }
  .p-led.current {
    background: var(--led-cyan);
    animation: blink 1.1s ease-in-out infinite;
  }
  @keyframes blink {
    0%, 100% { opacity: 0.45; }
    50%      { opacity: 1; }
  }

  .r-meta {
    display: inline-flex;
    align-items: center;
    gap: 0.85rem;
    font-family: var(--mono);
    font-size: 0.72rem;
    color: var(--label);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .r-score b { color: var(--led-green); font-weight: 700; }
  .r-streak { color: var(--led-amber); font-weight: 700; }

  .quit-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--mono);
    font-size: 0.65rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--led-red);
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    background: var(--panel);
    border-radius: 1px;
    flex-shrink: 0;
  }
  .quit-btn:hover { color: #ff9b9b; }
  .quit-btn:active {
    border-color: var(--bezel-lo);
    border-bottom-color: var(--bezel-hi);
    border-right-color: var(--bezel-hi);
  }

  /* ─── question bezel ──────────────────────── */
  .r-section {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    align-items: stretch;
  }

  .q-bezel {
    padding: 1.4rem 1.2rem 1.2rem;
  }

  .q-stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.15rem;
  }

  .logo-stage {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0.8rem 0;
  }
  .logo-stage :global(.logo) { width: 110px; height: 110px; }

  .tail-stage {
    width: 100%;
    max-width: 420px;
    aspect-ratio: 16 / 9;
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
    overflow: hidden;
    position: relative;
    background: var(--panel-2);
  }
  .tail-stage img.tail-fill { width: 100%; height: 100%; object-fit: cover; }
  .tail-stage img.tail-crop { position: absolute; max-width: none; object-fit: cover; }

  .prompt-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.45rem;
    text-align: center;
    padding: 0.4rem 0;
  }
  .prompt-block .prompt-label {
    font-family: var(--mono);
    font-size: 0.62rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--label-dim);
    font-weight: 700;
  }
  .prompt-block h2 {
    font-family: var(--sans);
    font-weight: 700;
    font-size: 1.6rem;
    color: var(--label);
    letter-spacing: -0.005em;
    line-height: 1.2;
  }
  .dest-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-family: var(--sans);
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--label);
    margin-top: 0.25rem;
    text-align: center;
  }
  .dest-list li { padding: 0.1rem 0; }

  .prompt-inline-ask {
    font-family: var(--mono);
    font-size: 0.78rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--led-cyan);
    font-weight: 700;
    margin-top: 0.85rem;
    display: inline-block;
  }

  .code-stage {
    font-family: var(--mono);
    font-weight: 700;
    font-size: 2.4rem;
    color: var(--led-cyan);
    letter-spacing: 0.15em;
    padding: 0.6rem 1.2rem;
    background: var(--mfd-bg);
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
    margin-top: 0.2rem;
  }

  .airline {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.4rem 0;
  }
  .airline :global(.logo) { width: 64px; height: 64px; flex-shrink: 0; }
  .airline-text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    align-items: flex-start;
  }
  .airline-text h2 {
    font-family: var(--sans);
    font-weight: 700;
    font-size: 1.35rem;
    color: var(--label);
    letter-spacing: -0.005em;
  }
  .airline-text .country {
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    color: var(--label-dim);
  }

  .q-ask {
    font-family: var(--mono);
    font-size: 0.78rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    text-align: center;
    color: var(--led-cyan);
    font-weight: 700;
    margin-top: 1.1rem;
    margin-bottom: 0.85rem;
  }

  /* ─── options grid ────────────────────────── */
  .opts {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.55rem;
  }
  @media (max-width: 600px) { .opts { grid-template-columns: 1fr; } }
  .opts.disabled { pointer-events: none; }

  .opt {
    position: relative;
    display: grid;
    grid-template-columns: 30px 1fr 18px;
    align-items: center;
    column-gap: 0.7rem;
    padding: 0.85rem 0.95rem 0.85rem 0.6rem;
    background: var(--panel-2);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 1px;
    cursor: pointer;
    text-align: left;
    min-height: 64px;
    transition: background 0.13s, border-color 0.13s;
  }
  .opt:hover .opt-text { color: #fff; }
  .opt:hover .opt-key { color: var(--led-cyan); border-color: var(--led-cyan); }
  .opt:active {
    border-color: var(--bezel-lo);
    border-bottom-color: var(--bezel-hi);
    border-right-color: var(--bezel-hi);
  }
  .opt[disabled] { cursor: default; }

  .opt-key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px; height: 24px;
    font-family: var(--mono);
    font-size: 0.7rem;
    color: var(--label-dim);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    background: var(--bg);
    border-radius: 1px;
    font-weight: 700;
    transition: color 0.13s, border-color 0.13s;
  }

  .opt-body { display: flex; flex-direction: column; gap: 0.18rem; min-width: 0; }
  .opt-text {
    font-family: var(--sans);
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--label);
    letter-spacing: -0.005em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .opt-alliance { display: inline-flex; align-items: center; gap: 0.55rem; }
  .opt-alliance :global(.alliance-logo) { width: 22px; height: 22px; flex-shrink: 0; }
  .opt-with-logo { display: inline-flex; align-items: center; gap: 0.55rem; min-width: 0; }
  .opt-with-logo :global(.logo) { width: 26px; height: 26px; flex-shrink: 0; }
  .opt-explain {
    font-family: var(--sans);
    font-size: 0.72rem;
    color: var(--label-dim);
    letter-spacing: 0.005em;
    white-space: pre-line;
    line-height: 1.45;
    margin-top: 0.1rem;
  }
  .opt-explain.missed-note { color: var(--led-amber); }

  .opt-led {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--led-off);
    border: 1px solid var(--bezel-lo);
    justify-self: center;
  }

  /* reveal / verdict states */
  .opt.correct {
    border-color: var(--led-green);
    background: rgba(74, 222, 128, 0.08);
  }
  .opt.correct .opt-text { color: var(--led-green); }
  .opt.correct .opt-led  { background: var(--led-green); }
  .opt.correct .opt-key  { color: var(--led-green); border-color: var(--led-green); }

  .opt.wrong {
    border-color: var(--led-red);
    background: rgba(248, 113, 113, 0.06);
  }
  .opt.wrong .opt-text { color: var(--led-red); }
  .opt.wrong .opt-led  { background: var(--led-red); }
  .opt.wrong .opt-key  { color: var(--led-red); border-color: var(--led-red); }

  .opt.selected {
    border-color: var(--led-cyan);
    background: rgba(96, 216, 240, 0.08);
  }
  .opt.selected .opt-led { background: var(--led-cyan); }
  .opt.selected .opt-key { color: var(--led-cyan); border-color: var(--led-cyan); }

  .opt.missed {
    border-color: var(--led-amber);
    background: rgba(251, 191, 36, 0.08);
  }
  .opt.missed .opt-text { color: var(--led-amber); }
  .opt.missed .opt-led  { background: var(--led-amber); }
  .opt.missed .opt-key  { color: var(--led-amber); border-color: var(--led-amber); }

  .confirm-btn {
    margin-top: 0.85rem;
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-family: var(--mono);
    font-weight: 700;
    font-size: 0.78rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--led-cyan);
    padding: 0.7rem 1rem;
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    background: var(--panel);
    border-radius: 1px;
  }
  .confirm-btn:disabled {
    color: var(--label-faint);
    cursor: not-allowed;
  }
  .confirm-btn:not(:disabled):hover { color: #b0ecf6; }
  .confirm-btn:not(:disabled):active {
    border-color: var(--bezel-lo);
    border-bottom-color: var(--bezel-hi);
    border-right-color: var(--bezel-hi);
  }

  /* ─── kb legend ───────────────────────────── */
  .kb-legend {
    display: flex;
    justify-content: center;
    gap: 1.1rem;
    font-family: var(--mono);
    font-size: 0.6rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--label-faint);
    padding: 0.4rem 0;
  }
  .kb-legend kbd {
    font-family: var(--mono);
    background: var(--panel-2);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 1px;
    padding: 0.05rem 0.32rem;
    color: var(--label-dim);
    font-weight: 700;
    margin: 0 0.1rem;
  }
</style>
