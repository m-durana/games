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
  .head { padding: 0.4rem 0.1rem 0.6rem; }
  .head h1 {
    font-family: var(--mono);
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--label);
    margin-bottom: 0.4rem;
  }
  .head p { color: var(--label-dim); font-family: var(--sans); font-size: 0.85rem; }

  .search {
    background: var(--panel-2);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 1px;
    padding: 0.7rem 0.95rem;
    color: var(--label);
    font-family: var(--sans);
    font-size: 0.9rem;
    appearance: none;
    -webkit-appearance: none;
    margin-bottom: 0.85rem;
  }
  .search:focus {
    outline: none;
    border-color: var(--led-cyan);
  }
  .search::placeholder { color: var(--label-dim); }

  .list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .row {
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 1px;
    overflow: hidden;
  }
  summary {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.7rem;
    align-items: center;
    padding: 0.6rem 0.85rem;
    cursor: pointer;
    list-style: none;
  }
  summary:hover { background: var(--panel-2); }
  summary::-webkit-details-marker { display: none; }
  .info { display: flex; flex-direction: column; min-width: 0; }
  .name { font-family: var(--sans); font-size: 0.92rem; font-weight: 700; color: var(--label); letter-spacing: -0.005em; }
  .meta { font-family: var(--mono); font-size: 0.66rem; letter-spacing: 0.06em; color: var(--label-dim); }
  .chev {
    color: var(--label-dim);
    font-size: 0.75rem;
    transition: transform 0.18s, color 0.15s;
  }
  details[open] .chev { transform: rotate(180deg); color: var(--led-cyan); }
  details[open] summary { background: var(--panel-2); border-bottom: 1px solid var(--bezel-lo); }

  .facts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem 0.85rem;
    padding: 0.7rem 0.85rem 0.85rem;
    background: var(--panel-2);
    font-family: var(--sans);
    font-size: 0.82rem;
  }
  .facts > div { display: flex; flex-direction: column; gap: 0.18rem; min-width: 0; }
  .facts dt {
    font-family: var(--mono);
    font-size: 0.6rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--label-dim);
    font-weight: 700;
  }
  .facts dd { color: var(--label); word-break: break-word; font-weight: 700; }

  .empty {
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--label-dim);
    text-align: center;
    padding: 1.5rem;
  }

  .actions { padding-top: 1rem; }
  .actions button {
    width: 100%;
    min-height: 48px;
    border-radius: 1px;
    font-family: var(--mono);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    background: var(--panel);
    color: var(--led-cyan);
    border: 1px solid var(--led-cyan);
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .actions button:hover { color: #b0ecf6; border-color: #b0ecf6; background: rgba(96, 216, 240, 0.08); }
  .actions button:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
</style>
