<script lang="ts">
  import type { HistoryEntry, Mode } from './types';
  import {
    airportLabel,
    difficultyLabel,
    explainAnswer,
    modeTitle,
    ROUND_LENGTH,
  } from './engine';
  import Logo from './Logo.svelte';

  interface Props {
    entry: HistoryEntry;
    onHome: () => void;
  }
  let { entry, onHome }: Props = $props();

  let expanded: number | null = $state(null);

  function fmt(v: string, m: Mode): string {
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

{#if !entry.results || entry.results.length === 0}
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
    font-size: 0.6875rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    background: var(--surface-2);
    padding: 0.3rem 0.6rem;
    border-radius: 999px;
  }
  .pill.subtle { background: var(--surface); }
  h1 {
    font-size: 2.25rem;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .of { color: var(--muted); font-size: 1.25rem; }
  .muted { color: var(--muted); text-align: center; padding: 1rem; }

  .recap { display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.5rem; }
  .row {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 0.625rem 0.75rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
  }
  .row:hover { border-color: #3f3f46; }
  .row.bad { border-color: rgba(239, 68, 68, 0.35); }
  .row.open { background: var(--surface-2); }
  .num {
    width: 1.4rem;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    font-size: 0.75rem;
    padding-top: 0.15rem;
  }
  .row-body { flex: 1; display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
  .airline { font-size: 0.9rem; font-weight: 500; }
  .ans { font-size: 0.8125rem; color: var(--muted); display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
  .ans.good { color: var(--good, #34d399); }
  .picked { color: #f87171; text-decoration: line-through; }
  .arrow { color: var(--muted); }
  .correct { color: var(--good, #34d399); }
  .chev { color: var(--muted); padding-top: 0.1rem; }
  .explain {
    font-size: 0.8125rem;
    color: var(--text);
    margin-top: 0.5rem;
    padding: 0.5rem 0.6rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .facts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3rem 0.75rem;
    margin-top: 0.5rem;
    font-size: 0.75rem;
  }
  .facts div { display: flex; flex-direction: column; }
  .facts dt { color: var(--muted); font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.06em; }
  .facts dd { color: var(--text); }

  .actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
  .secondary {
    flex: 1;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 0.75rem 1rem;
    border-radius: 12px;
    font-size: 0.9375rem;
  }
</style>
