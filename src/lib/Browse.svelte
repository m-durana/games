<script lang="ts">
  import { airlineMeta, airlines, airportLabel } from './engine';
  import Logo from './Logo.svelte';

  interface Props {
    onHome: () => void;
  }

  let { onHome }: Props = $props();

  let query = $state('');

  const filtered = $derived(
    query.trim().length === 0
      ? airlines
      : airlines.filter((a) => {
          const q = query.trim().toLowerCase();
          return (
            a.name.toLowerCase().includes(q) ||
            a.iata.toLowerCase().includes(q) ||
            a.country.toLowerCase().includes(q) ||
            (a.group?.toLowerCase().includes(q) ?? false) ||
            (a.alliance?.toLowerCase().includes(q) ?? false)
          );
        }),
  );
</script>

<header class="head">
  <h1>Liveries</h1>
  <p>{airlines.length} airlines. Tap to study before your next round.</p>
</header>

<input
  class="search"
  type="search"
  placeholder="Search by name, code, country, group..."
  bind:value={query}
/>

<section class="list">
  {#each filtered as a (a.iata)}
    {@const meta = airlineMeta(a.iata)}
    <details class="row">
      <summary>
        <Logo iata={a.iata} name={a.name} />
        <div class="info">
          <span class="name">{a.name}</span>
          <span class="meta">{a.country} · {a.iata}{meta.icao ? '/' + meta.icao : ''}</span>
        </div>
        <span class="chev">▾</span>
      </summary>
      <dl class="facts">
        <div><dt>Country</dt><dd>{a.country}</dd></div>
        <div><dt>Hub</dt><dd>{airportLabel(a.hub)}</dd></div>
        <div><dt>Alliance</dt><dd>{a.alliance ?? 'Independent'}</dd></div>
        <div><dt>Group</dt><dd>{a.group ?? 'Independent'}</dd></div>
        {#if meta.callsign}
          <div><dt>Callsign</dt><dd>{meta.callsign}</dd></div>
        {/if}
        {#if meta.founded}
          <div><dt>Founded</dt><dd>{meta.founded}</dd></div>
        {/if}
      </dl>
    </details>
  {/each}
  {#if filtered.length === 0}
    <p class="empty">No matches.</p>
  {/if}
</section>

<footer class="actions">
  <button onclick={onHome}>Back home</button>
</footer>

<style>
  .head { padding: 1rem 0.25rem 0.25rem; }
  .head h1 {
    font-size: 2.25rem;
    font-weight: 600;
    letter-spacing: 0;
    margin-bottom: 0.4rem;
  }
  .head p { color: var(--muted); font-size: 0.9375rem; }

  .search {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem 1rem;
    color: var(--text);
    font: inherit;
    font-size: 0.9375rem;
    appearance: none;
    -webkit-appearance: none;
  }
  .search:focus {
    outline: none;
    border-color: var(--panel-line);
  }
  .search::placeholder { color: var(--muted); }

  .list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .row {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  summary {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.625rem 0.875rem;
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker { display: none; }
  .info { display: flex; flex-direction: column; min-width: 0; }
  .name { font-size: 0.9375rem; font-weight: 500; }
  .meta { font-size: 0.75rem; color: var(--muted); }
  .chev {
    color: var(--muted);
    font-size: 0.75rem;
    transition: transform 0.18s;
  }
  details[open] .chev { transform: rotate(180deg); }

  .facts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem 0.75rem;
    padding: 0 0.875rem 0.875rem 0.875rem;
    font-size: 0.8125rem;
  }
  .facts > div { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .facts dt {
    font-size: 0.6875rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .facts dd { color: var(--text); word-break: break-word; }

  .empty {
    color: var(--muted);
    text-align: center;
    padding: 1.5rem;
  }

  .actions { padding-top: 0.75rem; }
  .actions button {
    width: 100%;
    min-height: 52px;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 500;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    transition: background 0.15s, border-color 0.15s, transform 0.1s;
  }
  .actions button:active { transform: scale(0.98); }
  .actions button:hover { border-color: var(--panel-line); background: var(--surface-2); }
</style>
