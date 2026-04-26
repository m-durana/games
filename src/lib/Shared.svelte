<script lang="ts">
  import type { SharedRound } from './share';
  import { airlines, airportLabel, difficultyLabel, modeTitle } from './engine';
  import Logo from './Logo.svelte';

  interface Props {
    data: SharedRound;
    onHome: () => void;
  }

  let { data, onHome }: Props = $props();

  // svelte-ignore state_referenced_locally
  const score = data.qs.filter((q) => q.a === q.p).length;
  // svelte-ignore state_referenced_locally
  const grid = data.qs.map((q) => (q.a === q.p ? '🟩' : '🟥')).join('');

  function airlineFor(iata: string) {
    return airlines.find((a) => a.iata === iata);
  }

  function fmt(v: string, m: string): string {
    return m === 'hub' ? airportLabel(v) : v;
  }
</script>

<header class="head">
  <span class="tag">Shared result</span>
  <div class="pills">
    {#if data.daily}
      <span class="pill daily">Daily · {data.date}</span>
    {:else}
      <span class="pill">{modeTitle(data.m)}</span>
      <span class="pill subtle">{difficultyLabel(data.d)}</span>
    {/if}
  </div>
  <h1>{score}<span class="of">/{data.qs.length}</span></h1>
  <p class="grid">{grid}</p>
</header>

<section class="recap">
  {#each data.qs as q, i}
    {@const airline = airlineFor(q.i)}
    <div class="row" class:bad={q.a !== q.p}>
      <span class="num">{i + 1}</span>
      {#if airline}
        <Logo iata={airline.iata} name={airline.name} />
      {:else}
        <span class="missing-logo">{q.i}</span>
      {/if}
      <div class="row-body">
        <span class="airline">{airline?.name ?? q.i}</span>
        {#if q.a === q.p}
          <span class="ans good">{fmt(q.a, q.md)}</span>
        {:else}
          <span class="ans">
            <span class="picked">{fmt(q.p, q.md)}</span>
            <span class="arrow">→</span>
            <span class="correct">{fmt(q.a, q.md)}</span>
          </span>
        {/if}
      </div>
    </div>
  {/each}
</section>

<footer class="actions">
  <button class="primary" onclick={onHome}>Play your own round</button>
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
  .tag {
    font-size: 0.6875rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .pills { display: flex; gap: 0.4rem; flex-wrap: wrap; justify-content: center; }
  .pill {
    font-size: 0.6875rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    background: var(--surface-2);
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
  }
  .pill.subtle { background: transparent; border: 1px solid var(--border); }
  .pill.daily { color: var(--accent); background: rgba(245, 197, 66, 0.12); }
  .head h1 {
    font-size: 4rem;
    font-weight: 600;
    letter-spacing: 0;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .of { color: var(--muted); font-weight: 400; }
  .grid { letter-spacing: 0.1rem; font-size: 1.125rem; }

  .recap {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.5rem;
  }
  .row {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 0.625rem 0.625rem;
    border-radius: 6px;
  }
  .num {
    color: var(--muted);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    min-width: 1.5ch;
    padding-top: 0.875rem;
  }
  .missing-logo {
    width: 48px;
    height: 48px;
    border-radius: 6px;
    background: var(--surface-2);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
    font-size: 0.75rem;
  }
  .row-body { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
  .airline { font-size: 0.9375rem; font-weight: 500; }
  .ans { font-size: 0.8125rem; color: var(--muted); }
  .ans.good { color: var(--good); }
  .ans .picked { color: var(--bad); text-decoration: line-through; }
  .ans .arrow { color: var(--muted); margin: 0 0.4rem; }
  .ans .correct { color: var(--good); }
  .row:not(.bad) .ans { color: var(--good); }

  .actions { padding-top: 0.75rem; }
  .actions button {
    width: 100%;
    min-height: 52px;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 500;
    transition: transform 0.1s, background 0.15s;
  }
  .actions button:active { transform: scale(0.98); }
  .primary { background: var(--accent); color: var(--bg); }
  .primary:hover { background: #ffe18a; }
</style>
