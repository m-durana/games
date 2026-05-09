<script lang="ts">
  import type { HistoryEntry, Mode } from './types';
  import {
    airportLabel,
    airportLabelWithCountry,
    difficultyLabel,
    explainAnswer,
    modeTitle,
    ROUND_LENGTH,
  } from './engine';
  import Logo from './Logo.svelte';
  import AircraftReveal from './AircraftReveal.svelte';
  import { aircraftById } from './aircraft';

  interface Props {
    entry: HistoryEntry;
    onHome: () => void;
  }
  let { entry, onHome }: Props = $props();

  let expanded: number | null = $state(null);

  function fmt(v: string, m: Mode): string {
    if (m === 'airportConn') return airportLabelWithCountry(v);
    return m === 'hub' ? airportLabel(v) : v;
  }

  function toggle(i: number) {
    expanded = expanded === i ? null : i;
  }

  function fmtDate(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
</script>

<header class="head">
  <div class="pills">
    <span class="pill">{modeTitle(entry.mode)}</span>
    <span class="pill subtle">{difficultyLabel(entry.difficulty)}</span>
    <span class="pill subtle">{fmtDate(entry.ts)}</span>
  </div>
  <h1>{entry.score}<span class="of">/{entry.total ?? ROUND_LENGTH}</span></h1>
</header>

{#if entry.aircraftResults && entry.aircraftResults.length > 0}
  <section class="recap">
    {#each entry.aircraftResults as r, i}
      {@const plane = aircraftById(r.aircraftId)}
      <button class="row" class:bad={!(r.type === 'wordle' ? r.solved : r.correct)} class:open={expanded === i} onclick={() => toggle(i)}>
        <span class="num">{i + 1}</span>
        <div class="row-body">
          <span class="airline">{r.aircraftName}</span>
          {#if r.type === 'wordle'}
            <span class="ans" class:good={r.solved}>
              {r.solved ? `Solved in ${r.guesses.length} ${r.guesses.length === 1 ? 'guess' : 'guesses'}` : `Failed (${r.guesses.length} guesses)`}
              <span class="arrow">·</span>
              <span>{r.earned} pts</span>
            </span>
          {:else}
            <span class="ans" class:good={r.correct}>
              {r.correct ? `Correct at stage ${r.hintStage + 1} (+${r.earned} pt${r.earned === 1 ? '' : 's'})` : `Wrong - picked ${r.picked ?? ' - '}`}
            </span>
          {/if}
          {#if expanded === i}
            {#if r.type === 'wordle' && r.guesses.length > 0}
              <div class="wordle-recap">
                {#each r.guesses as g}
                  <div class="wordle-row">
                    <span class="wordle-name">{g.name}</span>
                    {#each g.feedback as fb}
                      <span class="wordle-cell wordle-{fb.match}">{fb.guessValue}</span>
                    {/each}
                  </div>
                {/each}
              </div>
            {/if}
            {#if plane}
              <AircraftReveal plane={plane} correct={r.type === 'wordle' ? r.solved : r.correct} />
            {/if}
          {/if}
        </div>
        <span class="chev" aria-hidden="true">{expanded === i ? '▴' : '▾'}</span>
      </button>
    {/each}
  </section>
{:else if !entry.results || entry.results.length === 0}
  <p class="muted">No per-question detail saved for this round.</p>
{:else}
  <section class="recap">
    {#each entry.results as r, i}
      <button class="row" class:bad={!r.correct} class:open={expanded === i} onclick={() => toggle(i)}>
        <span class="num">{i + 1}</span>
        <Logo iata={r.question.airline.iata} name={r.question.airline.name} />
        <div class="row-body">
          <span class="airline">{r.question.airline.name}</span>
          {#if r.correct}
            <span class="ans good">{fmt(r.question.answer, r.question.mode)}</span>
          {:else}
            <span class="ans">
              <span class="picked">{fmt(r.picked, r.question.mode)}</span>
              <span class="arrow">→</span>
              <span class="correct">{fmt(r.question.answer, r.question.mode)}</span>
            </span>
          {/if}
          {#if expanded === i}
            <p class="explain">{explainAnswer(r.question)}</p>
            <dl class="facts">
              <div><dt>Country</dt><dd>{r.question.airline.country}</dd></div>
              <div><dt>IATA</dt><dd>{r.question.airline.iata}</dd></div>
              <div><dt>Hub</dt><dd>{airportLabel(r.question.airline.hub)}</dd></div>
              <div><dt>Alliance</dt><dd>{r.question.airline.alliance ?? 'Independent'}</dd></div>
              <div><dt>Group</dt><dd>{r.question.airline.group ?? 'Independent'}</dd></div>
            </dl>
          {/if}
        </div>
        <span class="chev" aria-hidden="true">{expanded === i ? '▴' : '▾'}</span>
      </button>
    {/each}
  </section>
{/if}

<footer class="actions">
  <button class="secondary" onclick={onHome}>Back home</button>
</footer>

<style>
  .head {
    text-align: center;
    padding: 1rem 0 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  .pills { display: flex; gap: 0.4rem; flex-wrap: wrap; justify-content: center; }
  .pill {
    font-family: var(--mono);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--label-dim);
    background: var(--panel-2);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    padding: 0.28rem 0.65rem;
    border-radius: 1px;
  }
  .pill.subtle { background: var(--panel); }
  h1 {
    font-family: var(--mono);
    font-size: 2.4rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--led-green);
    font-variant-numeric: tabular-nums;
  }
  .of { font-family: var(--mono); color: var(--label-dim); font-size: 1.2rem; }
  .muted { font-family: var(--sans); color: var(--label-dim); text-align: center; padding: 1rem; }

  .recap { display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.6rem; }
  .row {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.55rem 0.7rem;
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 1px;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
  }
  .row:hover { border-color: var(--led-cyan); }
  .row.bad { border-color: var(--bezel-hi); }
  .row.open { border-color: var(--led-cyan); background: rgba(96, 216, 240, 0.04); }
  .num {
    width: 1.4rem;
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    color: var(--label-dim);
    font-size: 0.78rem;
    padding-top: 0.15rem;
  }
  .row-body { flex: 1; display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
  .airline { font-family: var(--sans); font-size: 0.9rem; font-weight: 700; color: var(--label); letter-spacing: -0.005em; }
  .ans { font-family: var(--sans); font-size: 0.8rem; color: var(--label-dim); display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
  .ans.good { color: var(--led-green); }
  .picked { color: var(--led-red); text-decoration: line-through; }
  .arrow { color: var(--label-dim); }
  .correct { color: var(--led-green); }
  .chev { color: var(--label-dim); padding-top: 0.1rem; }
  .explain {
    font-family: var(--sans);
    font-size: 0.8rem;
    line-height: 1.45;
    color: var(--label-2);
    margin-top: 0.5rem;
    padding: 0.55rem 0.7rem;
    background: var(--panel-2);
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
    white-space: pre-line;
  }
  .facts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem 0.85rem;
    margin-top: 0.5rem;
    font-family: var(--sans);
    font-size: 0.78rem;
  }
  .facts div { display: flex; flex-direction: column; gap: 0.15rem; }
  .facts dt { font-family: var(--mono); color: var(--label-dim); font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.18em; }
  .facts dd { color: var(--label); font-weight: 700; }

  .wordle-recap {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-top: 0.5rem;
    overflow-x: auto;
  }
  .wordle-row {
    display: flex;
    gap: 0.25rem;
    align-items: stretch;
    min-width: max-content;
  }
  .wordle-name {
    min-width: 130px;
    padding: 0.3rem 0.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 1px;
    font-size: 0.75rem;
    white-space: nowrap;
  }
  .wordle-cell {
    padding: 0.3rem 0.4rem;
    border-radius: 1px;
    font-size: 0.6875rem;
    font-family: var(--font-main);
    text-align: center;
    min-width: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .wordle-hit {
    background: rgba(34, 197, 94, 0.22);
    color: var(--good);
    border: 1px solid rgba(34, 197, 94, 0.55);
  }
  .wordle-close {
    background: rgba(234, 179, 8, 0.22);
    color: #b45309;
    border: 1px solid rgba(234, 179, 8, 0.55);
  }
  :global([data-theme='dark']) .wordle-close { color: #facc15; }
  .wordle-miss {
    background: var(--surface);
    color: var(--muted);
    border: 1px solid var(--border);
  }

  .actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
  .secondary {
    flex: 1;
    background: var(--panel);
    color: var(--label-dim);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    padding: 0.7rem 1rem;
    border-radius: 1px;
    font-family: var(--mono);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    cursor: pointer;
    min-height: 48px;
    transition: color 0.15s, border-color 0.15s;
  }
  .secondary:hover { color: var(--led-cyan); border-color: var(--led-cyan); }
  .secondary:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
</style>
