<script lang="ts">
  import { fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { onDestroy, onMount } from 'svelte';
  import type { Difficulty } from './types';
  import {
    ATC_ROUND_LENGTH,
    atcModeDescription,
    atcModeTitle,
    atcPromptLabel,
    buildAtcRound,
    type AtcMode,
    type AtcQuestion,
    type AtcRoundResult,
  } from './atc';
  import { difficultyLabel, loadPool, loadSettings } from './engine';
  import { clearProgress, progressKey, recordProgress, sessionKey } from './progress';
  import * as Sound from './sound';
  import RoundBar from './RoundBar.svelte';

  interface Props {
    mode: AtcMode;
    difficulty: Difficulty;
    onFinish: (results: AtcRoundResult[]) => void;
    onQuit: () => void;
  }

  let { mode, difficulty, onFinish, onQuit }: Props = $props();

  // svelte-ignore state_referenced_locally
  const SESSION_KEY = sessionKey('atc', difficulty, mode);
  // svelte-ignore state_referenced_locally
  const PKEY = progressKey('atc', difficulty, mode);
  interface SavedSession {
    v: 1;
    mode: AtcMode;
    difficulty: Difficulty;
    pool: 'all' | 'us' | 'us_eu';
    questions: AtcQuestion[];
    index: number;
    picked: string | null;
    results: AtcRoundResult[];
    placedIdx: number[];
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

  // svelte-ignore state_referenced_locally
  const initial = (() => {
    const saved = loadSession();
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
        results: saved!.results,
        placedIdx: saved!.placedIdx,
      };
    }
    // svelte-ignore state_referenced_locally
    return {
      questions: buildAtcRound(mode, difficulty),
      index: 0,
      picked: null as string | null,
      results: [] as AtcRoundResult[],
      placedIdx: [] as number[],
    };
  })();

  let questions: AtcQuestion[] = $state(initial.questions);
  let index = $state(initial.index);
  let picked: string | null = $state(initial.picked);
  let showInfo = $state(false);
  let results: AtcRoundResult[] = $state(initial.results);
  let advanceTimer: number | null = null;

  // Compose-mode state: which token-bank indices have been placed (in order).
  let placedIdx: number[] = $state(initial.placedIdx);

  // svelte-ignore state_referenced_locally
  const category = mode === 'callsign' ? 'Airlines' : 'ATC';

  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    if (index === 0 && results.length === 0 && (picked === null) && placedIdx.length === 0) return;
    const session: SavedSession = {
      v: 1,
      mode,
      difficulty,
      pool: loadPool(),
      questions,
      index,
      picked,
      results,
      placedIdx,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    recordProgress({
      key: PKEY,
      gameKind: 'atc',
      label: `${atcModeTitle(mode)} · ${difficulty}`,
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
  const score = $derived(results.filter((r) => r.correct).length);
  // svelte-ignore state_referenced_locally
  const showKeys = loadSettings().keyboardHints;

  function choose(option: string) {
    if (picked !== null) return;
    picked = option;
    const correct = option === current.answer;
    if (correct) {
      Sound.correct();
      Sound.vibrate(15);
    } else {
      Sound.wrong();
      Sound.vibrate(35);
    }
    const nextResults = [...results, { question: current, picked: option, correct }];
    results = nextResults;
    // Callsign is pure recall - auto-advance keeps the pace snappy. Decode is
    // a thinking mode where the player wants to read the explanation, so we
    // wait for an explicit Next / Enter / Space.
    if (current.mode === 'callsign') {
      advanceTimer = window.setTimeout(() => advance(nextResults), 1400);
    }
  }

  function placeToken(i: number) {
    if (picked !== null) return;
    if (placedIdx.includes(i)) return;
    placedIdx = [...placedIdx, i];
  }

  function unplaceToken(i: number) {
    if (picked !== null) return;
    placedIdx = placedIdx.filter((j) => j !== i);
  }

  function clearComposed() {
    if (picked !== null) return;
    placedIdx = [];
  }

  function normalizeReadback(s: string): string {
    return s.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function confirmCompose() {
    if (picked !== null) return;
    if (placedIdx.length === 0) return;
    const tokens = current.tokens ?? [];
    const assembled = placedIdx.map((j) => tokens[j]).join(' ');
    const valid = (current.answers ?? [current.answer]).map(normalizeReadback);
    const correct = valid.includes(normalizeReadback(assembled));
    picked = assembled;
    if (correct) {
      Sound.correct();
      Sound.vibrate(15);
    } else {
      Sound.wrong();
      Sound.vibrate(35);
    }
    const nextResults = [...results, { question: current, picked: assembled, correct }];
    results = nextResults;
  }

  function advance(finalResults = results) {
    if (index + 1 >= questions.length) {
      clearProgress(PKEY);
      onFinish(finalResults);
      return;
    }
    index += 1;
    picked = null;
    placedIdx = [];
  }

  function statusFor(option: string): 'idle' | 'correct' | 'wrong' | 'reveal' {
    if (picked === null) return 'idle';
    if (option === current.answer) return 'correct';
    if (option === picked) return 'wrong';
    return 'reveal';
  }

  function dotState(i: number): 'todo' | 'current' | 'correct' | 'wrong' {
    if (i < results.length) return results[i].correct ? 'correct' : 'wrong';
    if (i === index) return 'current';
    return 'todo';
  }
  const progressLeds = $derived(questions.map((_, i) => dotState(i)));

  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onQuit();
        return;
      }
      // After answering on a thinking mode (decode/compose), Enter/Space
      // advances. Callsign auto-advances so this branch is harmless there too.
      if (picked !== null) {
        if ((e.key === 'Enter' || e.key === ' ') && current.mode !== 'callsign') {
          e.preventDefault();
          advance();
        }
        return;
      }
      // Chip-builder modes are touch/click only - no number-key shortcuts.
      if (current.mode === 'compose') return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= current.options.length) choose(current.options[n - 1]);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  onDestroy(() => {
    if (advanceTimer !== null) clearTimeout(advanceTimer);
  });
</script>

<RoundBar progress={progressLeds} {score} total={ATC_ROUND_LENGTH} {onQuit} />

<section class="round">
  {#key index}
    <div class="bezel q-bezel" data-label={atcModeTitle(current.mode)} in:fly={{ y: 16, duration: 220 }}>
      <span class="bezel-aux">
        Q{index + 1} / {questions.length}
        {#if mode === 'atcMix'}· MIX{/if}
      </span>
      <button
        class="info-btn"
        aria-label="About this mode"
        aria-expanded={showInfo}
        onclick={() => (showInfo = !showInfo)}
      >i</button>
      {#if showInfo}
        <p class="mode-info">{atcModeDescription(mode === 'atcMix' ? current.mode : mode)}</p>
      {/if}

      {#if current.mode === 'decode' || current.mode === 'compose'}
        <div class="atc-call">
          <img class="atc-icon" src="https://unpkg.com/lucide-static@0.469.0/icons/tower-control.svg" alt="" aria-hidden="true" />
          <div class="atc-bubble">
            <span class="prompt-label">{atcPromptLabel(current.mode)}</span>
            <h2>{current.prompt}</h2>
          </div>
        </div>
      {:else}
        <div class="prompt-block">
          <span class="prompt-label">{atcPromptLabel(current.mode)}</span>
          <h2>{current.prompt}</h2>
        </div>
      {/if}

      {#if current.mode === 'compose' && current.tokens}
        {@const tokens = current.tokens}
        {@const composed = placedIdx.map((j) => tokens[j]).join(' ')}
        {@const isCorrect = picked !== null && picked === current.answer}
        {@const isWrong = picked !== null && !isCorrect}
        <div class="compose-stage">
          <div
            class="compose-line"
            class:correct={isCorrect}
            class:wrong={isWrong}
          >
            {#if placedIdx.length === 0}
              <span class="compose-hint">Tap words below in order</span>
            {:else}
              {#each placedIdx as i (i)}
                <button
                  animate:flip={{ duration: 220 }}
                  class="chip placed"
                  disabled={picked !== null}
                  onclick={() => unplaceToken(i)}
                >{tokens[i]}</button>
              {/each}
            {/if}
          </div>
          {#if placedIdx.length > 0 && picked === null}
            <button class="compose-clear" onclick={clearComposed}>Clear</button>
          {/if}
        </div>

        {@const bankItems = tokens
          .map((tok, i) => ({ tok, i }))
          .filter(({ i }) => !placedIdx.includes(i))}
        <div class="compose-bank" class:disabled={picked !== null}>
          {#each bankItems as { tok, i } (i)}
            <button
              animate:flip={{ duration: 220 }}
              class="chip"
              disabled={picked !== null}
              onclick={() => placeToken(i)}
            >{tok}</button>
          {/each}
        </div>

        {#if picked === null}
          <button
            class="compose-confirm"
            disabled={placedIdx.length === 0}
            onclick={confirmCompose}
          >Confirm readback</button>
        {/if}

        {#if picked !== null}
          <div class="compose-feedback" class:good={isCorrect} class:bad={isWrong}>
            {#if !isCorrect}
              <div class="fb-row"><span class="fb-label">Your answer</span><span class="fb-val">{picked}</span></div>
              <div class="fb-row"><span class="fb-label">A correct readback</span><span class="fb-val correct-val">{current.answer}</span></div>
              {#if current.answers && current.answers.length > 1}
                <div class="fb-row">
                  <span class="fb-label">Other valid forms</span>
                  {#each current.answers.slice(1) as alt}
                    <span class="fb-alt">· {alt}</span>
                  {/each}
                </div>
              {/if}
            {:else if current.answers && current.answers.length > 1}
              <div class="fb-row">
                <span class="fb-label">Other valid forms</span>
                {#each current.answers.filter((a) => normalizeReadback(a) !== normalizeReadback(picked ?? '')) as alt}
                  <span class="fb-alt">· {alt}</span>
                {/each}
              </div>
            {/if}
            <p class="compose-explain">{current.explanation}</p>
            <button class="compose-next" onclick={() => advance()}>Next →</button>
          </div>
        {/if}
      {:else}
        <div class="options" class:disabled={picked !== null}>
          {#each current.options as option, i}
            {@const s = statusFor(option)}
            <button
              class="option"
              class:correct={s === 'correct'}
              class:wrong={s === 'wrong'}
              class:reveal={s === 'reveal'}
              disabled={picked !== null}
              onclick={() => choose(option)}
            >
              {#if showKeys}
                <span class="key" aria-hidden="true">{i + 1}</span>
              {/if}
              <span class="opt-text">{option}</span>
              {#if picked !== null && option === current.answer}
                <span class="opt-explain">{current.explanation}</span>
              {/if}
            </button>
          {/each}
        </div>
        {#if picked !== null && current.mode !== 'callsign'}
          <button class="compose-next" onclick={() => advance()}>Next →</button>
        {/if}
      {/if}
    </div>
  {/key}
  <div class="kb-legend" aria-hidden="true">
    {#if current?.mode !== 'compose'}
      <span><kbd>1</kbd>-<kbd>{current?.options.length ?? 4}</kbd> pick</span>
    {/if}
    <span><kbd>Esc</kbd> quit</span>
  </div>
</section>

<style>
  .q-bezel {
    width: 100%;
    padding: 1.4rem 1.2rem 1.2rem;
    position: relative;
  }
  .bezel { position: relative; background: var(--panel); border: 1px solid var(--bezel-hi); border-bottom-color: var(--bezel-lo); border-right-color: var(--bezel-lo); border-radius: 2px; }
  .bezel::before { content: attr(data-label); position: absolute; top: -0.42rem; left: 0.85rem; background: var(--bg); padding: 0 0.45rem; font-family: var(--mono); font-size: 0.6rem; letter-spacing: 0.34em; text-transform: uppercase; color: var(--label-dim); font-weight: 700; height: 14px; display: inline-flex; align-items: center; }
  .bezel-aux { position: absolute; top: -0.42rem; right: 2.4rem; background: var(--bg); padding: 0 0.45rem; font-family: var(--mono); font-size: 0.6rem; letter-spacing: 0.22em; text-transform: uppercase; color: var(--label-faint); font-weight: 700; }

  .info-btn { position: absolute; top: -0.6rem; right: 0.85rem; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-family: var(--mono); font-weight: 700; font-style: italic; font-size: 0.72rem; color: var(--label-dim); background: var(--bg); border: 1px solid var(--bezel-hi); border-bottom-color: var(--bezel-lo); border-right-color: var(--bezel-lo); border-radius: 1px; cursor: pointer; }
  .info-btn:hover { color: var(--led-cyan); border-color: var(--led-cyan); }
  .info-btn:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
  .info-btn[aria-expanded="true"] { color: var(--led-cyan); border-color: var(--led-cyan); }
  .mode-info { font-family: var(--sans); font-size: 0.82rem; line-height: 1.5; color: var(--label-2); background: var(--panel-2); border: 1px solid var(--bezel-lo); border-radius: 1px; padding: 0.7rem 0.85rem; margin: 0 0 0.6rem; }

  .round { display: flex; flex-direction: column; gap: 0.85rem; align-items: stretch; width: 100%; }

  .atc-call { display: grid; grid-template-columns: 56px 1fr; gap: 1.3rem; align-items: stretch; margin-top: 0.4rem; }
  .atc-call .atc-icon { display: block; width: auto !important; height: 100% !important; max-height: 100%; padding: 0.2rem 0.3rem 0.2rem 0; filter: invert(70%) sepia(60%) saturate(390%) hue-rotate(75deg) brightness(95%); }
  .atc-bubble { position: relative; background: var(--mfd-bg); border: 1px solid var(--bezel-lo); border-radius: 2px; padding: 0.85rem 1rem 0.95rem; }
  .atc-bubble::before { content: ""; position: absolute; left: -7px; top: 18px; width: 0; height: 0; border-top: 7px solid transparent; border-bottom: 7px solid transparent; border-right: 7px solid var(--bezel-lo); }
  .atc-bubble::after { content: ""; position: absolute; left: -6px; top: 19px; width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-right: 6px solid var(--mfd-bg); }
  .atc-bubble .prompt-label { font-family: var(--mono); font-size: 0.6rem; letter-spacing: 0.18em; color: var(--mfd-dim); text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 0.4rem; }
  .atc-bubble h2 { font-family: var(--mono); font-weight: 700; font-size: 1.02rem; color: var(--mfd-text); letter-spacing: 0.05em; line-height: 1.5; text-transform: uppercase; }

  .prompt-block { display: flex; flex-direction: column; align-items: center; gap: 0.45rem; text-align: center; padding: 0.9rem 0; }
  .prompt-block .prompt-label { font-family: var(--mono); font-size: 0.62rem; letter-spacing: 0.22em; text-transform: uppercase; color: var(--label-dim); font-weight: 700; }
  .prompt-block h2 { font-family: var(--sans); font-weight: 700; font-size: 1.6rem; color: var(--label); letter-spacing: -0.005em; line-height: 1.2; }

  /* compose stage (readback builder) */
  .compose-stage { margin-top: 0.95rem; background: var(--mfd-bg); border: 1px solid var(--bezel-lo); border-radius: 1px; padding: 0.95rem 0.85rem 0.7rem; position: relative; }
  .compose-stage::before { content: "PILOT \00b7 READBACK"; position: absolute; top: -0.42rem; left: 0.85rem; background: var(--bg); padding: 0 0.45rem; font-family: var(--mono); font-size: 0.6rem; letter-spacing: 0.28em; color: var(--mfd-dim); font-weight: 700; }
  .compose-line { min-height: 56px; display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; padding: 0.4rem 0; }
  .compose-line.correct { color: var(--mfd-text); }
  .compose-line.wrong { color: var(--led-amber); }
  .compose-hint { font-family: var(--mono); font-size: 0.7rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--mfd-dim); }
  .chip { font-family: var(--mono); font-weight: 700; font-size: 0.85rem; letter-spacing: 0.05em; text-transform: uppercase; color: var(--label); background: var(--panel-2); border: 1px solid var(--bezel-hi); border-bottom-color: var(--bezel-lo); border-right-color: var(--bezel-lo); padding: 0.5rem 0.85rem; border-radius: 1px; cursor: pointer; }
  .chip:hover { color: var(--led-cyan); }
  .chip:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
  .chip.placed { color: var(--mfd-text); background: rgba(108, 212, 126, 0.10); border-color: var(--mfd-text); }
  .chip.placed:hover { background: rgba(108, 212, 126, 0.18); }
  .compose-line.wrong .chip.placed { color: var(--led-amber); border-color: var(--led-amber); background: rgba(251, 191, 36, 0.10); }
  .compose-clear { font-family: var(--mono); font-size: 0.62rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--led-red); margin-top: 0.4rem; border-top: 1px solid var(--bezel-lo); padding-top: 0.45rem; background: none; border-left: none; border-right: none; border-bottom: none; cursor: pointer; }
  .compose-clear:hover { color: #ff9b9b; }

  .compose-bank { display: flex; flex-wrap: wrap; gap: 0.45rem; padding: 0.85rem 0; }
  .compose-bank.disabled { opacity: 0.5; pointer-events: none; }

  .compose-confirm { width: 100%; margin-top: 0.4rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; font-family: var(--mono); font-weight: 700; font-size: 0.78rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--led-cyan); padding: 0.7rem 1rem; border: 1px solid var(--bezel-hi); border-bottom-color: var(--bezel-lo); border-right-color: var(--bezel-lo); background: var(--panel); border-radius: 1px; cursor: pointer; }
  .compose-confirm:disabled { color: var(--label-faint); cursor: not-allowed; }
  .compose-confirm:not(:disabled):hover { color: #b0ecf6; }
  .compose-confirm:not(:disabled):active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }

  .compose-feedback { margin-top: 1rem; padding: 0.85rem; border: 1px solid var(--bezel-lo); border-radius: 1px; background: var(--panel-2); display: flex; flex-direction: column; gap: 0.55rem; }
  .compose-feedback.good { border-color: rgba(74, 222, 128, 0.4); background: rgba(74, 222, 128, 0.06); }
  .compose-feedback.bad { border-color: rgba(248, 113, 113, 0.4); background: rgba(248, 113, 113, 0.06); }
  .fb-row { display: flex; flex-wrap: wrap; gap: 0.4rem 0.65rem; align-items: baseline; font-family: var(--sans); font-size: 0.82rem; }
  .fb-label { font-family: var(--mono); font-size: 0.6rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--label-dim); font-weight: 700; }
  .fb-val { color: var(--label); }
  .fb-val.correct-val { color: var(--led-green); }
  .fb-alt { color: var(--label-dim); font-size: 0.78rem; }
  .compose-explain { font-family: var(--sans); font-size: 0.82rem; color: var(--label-2); line-height: 1.45; }
  .compose-next { align-self: flex-end; margin-top: 0.4rem; display: inline-flex; align-items: center; gap: 0.5rem; font-family: var(--mono); font-weight: 700; font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--led-cyan); padding: 0.5rem 0.95rem; border: 1px solid var(--bezel-hi); border-bottom-color: var(--bezel-lo); border-right-color: var(--bezel-lo); background: var(--panel); border-radius: 1px; cursor: pointer; }
  .compose-next:hover { color: #b0ecf6; }
  .compose-next:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }

  /* multi-choice options for decode/cleared/callsign */
  .options { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.55rem; margin-top: 1rem; }
  @media (max-width: 600px) { .options { grid-template-columns: 1fr; } }
  .options.disabled { pointer-events: none; }
  .option { position: relative; display: grid; grid-template-columns: 30px 1fr; align-items: center; column-gap: 0.7rem; padding: 0.8rem 0.85rem 0.8rem 0.55rem; background: var(--panel-2); border: 1px solid var(--bezel-hi); border-bottom-color: var(--bezel-lo); border-right-color: var(--bezel-lo); border-radius: 1px; cursor: pointer; text-align: left; }
  .option:hover .opt-text { color: #fff; }
  .option:hover .key { color: var(--led-cyan); border-color: var(--led-cyan); }
  .option:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
  .option[disabled] { cursor: default; }
  .key { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; font-family: var(--mono); font-size: 0.7rem; color: var(--label-dim); border: 1px solid var(--bezel-hi); border-bottom-color: var(--bezel-lo); border-right-color: var(--bezel-lo); background: var(--bg); border-radius: 1px; font-weight: 700; }
  .opt-text { font-family: var(--sans); font-weight: 400; font-size: 0.92rem; color: var(--label); line-height: 1.4; min-width: 0; }
  .opt-explain { grid-column: 2; font-family: var(--sans); font-size: 0.78rem; color: var(--led-green); margin-top: 0.4rem; line-height: 1.45; display: block; white-space: pre-line; min-width: 0; word-break: break-word; }
  .compose-explain, .explain { white-space: pre-line; }
  .option.correct { border-color: var(--led-green); background: rgba(74, 222, 128, 0.08); }
  .option.correct .opt-text { color: var(--led-green); }
  .option.correct .key { color: var(--led-green); border-color: var(--led-green); }
  .option.wrong { border-color: var(--led-red); background: rgba(248, 113, 113, 0.06); }
  .option.wrong .opt-text { color: var(--led-red); }
  .option.wrong .key { color: var(--led-red); border-color: var(--led-red); }

  .kb-legend { display: flex; justify-content: center; gap: 1.1rem; font-family: var(--mono); font-size: 0.6rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--label-faint); padding: 0.4rem 0; }
  .kb-legend kbd { font-family: var(--mono); background: var(--panel-2); border: 1px solid var(--bezel-hi); border-bottom-color: var(--bezel-lo); border-right-color: var(--bezel-lo); border-radius: 1px; padding: 0.05rem 0.32rem; color: var(--label-dim); font-weight: 700; margin: 0 0.1rem; }
</style>
