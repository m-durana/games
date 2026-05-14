<script lang="ts">
  import { tick } from 'svelte';

  type Item = { id: string; label: string; sub?: string };
  type Group = { label: string; items: Item[] };

  type Props = {
    value: string;
    groups: Group[];
    placeholder?: string;
    onchange?: (value: string) => void;
    onsubmit?: () => void;
  };

  let { value = $bindable(''), groups, placeholder = 'Type or pick…', onchange, onsubmit }: Props = $props();

  let query = $state('');
  let open = $state(false);
  let activeIdx = $state(-1);
  let inputEl: HTMLInputElement | null = $state(null);
  let listEl: HTMLDivElement | null = $state(null);

  const allItems = $derived(groups.flatMap((g) => g.items.map((it) => ({ ...it, group: g.label }))));

  // When `value` is set externally (e.g., reset to ''), reflect it in input.
  $effect(() => {
    if (!value) {
      query = '';
      return;
    }
    const found = allItems.find((it) => it.id === value);
    if (found && query !== found.label) query = found.label;
  });

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups.map((g) => ({ label: g.label, items: g.items }));
    const out: Group[] = [];
    for (const g of groups) {
      const items = g.items.filter((it) =>
        it.label.toLowerCase().includes(q) ||
        (it.sub ?? '').toLowerCase().includes(q) ||
        it.id.toLowerCase().includes(q),
      );
      if (items.length) out.push({ label: g.label, items });
    }
    return out;
  });

  // Flat list of items in displayed order; activeIdx indexes into this.
  const flat = $derived(filtered.flatMap((g) => g.items));

  function openList() {
    open = true;
    if (activeIdx < 0 && flat.length) activeIdx = 0;
  }

  function closeList() {
    open = false;
    activeIdx = -1;
  }

  function commit(idx: number) {
    const it = flat[idx];
    if (!it) return;
    value = it.id;
    query = it.label;
    onchange?.(it.id);
    closeList();
  }

  async function scrollActiveIntoView() {
    await tick();
    if (!listEl) return;
    const el = listEl.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) openList();
      if (flat.length) {
        activeIdx = activeIdx < 0 ? 0 : Math.min(flat.length - 1, activeIdx + 1);
        scrollActiveIntoView();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) openList();
      if (flat.length) {
        activeIdx = activeIdx <= 0 ? flat.length - 1 : activeIdx - 1;
        scrollActiveIntoView();
      }
    } else if (e.key === 'Home' && open) {
      e.preventDefault();
      if (flat.length) { activeIdx = 0; scrollActiveIntoView(); }
    } else if (e.key === 'End' && open) {
      e.preventDefault();
      if (flat.length) { activeIdx = flat.length - 1; scrollActiveIntoView(); }
    } else if (e.key === 'PageDown' && open) {
      e.preventDefault();
      if (flat.length) { activeIdx = Math.min(flat.length - 1, (activeIdx < 0 ? 0 : activeIdx) + 8); scrollActiveIntoView(); }
    } else if (e.key === 'PageUp' && open) {
      e.preventDefault();
      if (flat.length) { activeIdx = Math.max(0, (activeIdx < 0 ? 0 : activeIdx) - 8); scrollActiveIntoView(); }
    } else if (e.key === 'Enter') {
      if (open && activeIdx >= 0) {
        e.preventDefault();
        commit(activeIdx);
      } else if (!open && value) {
        onsubmit?.();
      }
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); closeList(); }
    } else if (e.key === 'Tab') {
      closeList();
    }
  }

  function onInput(e: Event) {
    query = (e.currentTarget as HTMLInputElement).value;
    open = true;
    activeIdx = flat.length ? 0 : -1;
    // Clearing the input clears any committed value.
    if (!query) {
      if (value !== '') {
        value = '';
        onchange?.('');
      }
      return;
    }
    // Exact (case-insensitive) match auto-commits the value but keeps list open.
    const exact = flat.find((it) => it.label.toLowerCase() === query.toLowerCase());
    if (exact) {
      if (value !== exact.id) {
        value = exact.id;
        onchange?.(exact.id);
      }
    } else if (value !== '') {
      value = '';
      onchange?.('');
    }
  }

  function onBlur() {
    // Delay to allow mousedown on item to fire before closing.
    setTimeout(() => { open = false; }, 120);
  }
</script>

<div class="cb">
  <input
    bind:this={inputEl}
    type="text"
    role="combobox"
    aria-expanded={open}
    aria-autocomplete="list"
    aria-controls="cb-listbox"
    autocomplete="off"
    autocapitalize="off"
    autocorrect="off"
    spellcheck="false"
    {placeholder}
    value={query}
    oninput={onInput}
    onfocus={openList}
    onclick={openList}
    onkeydown={onKeyDown}
    onblur={onBlur}
    class="cb-input"
  />
  {#if open && filtered.length > 0}
    <div bind:this={listEl} id="cb-listbox" role="listbox" class="cb-list">
      {#each filtered as g}
        <div class="cb-group" role="presentation">{g.label}</div>
        {#each g.items as it}
          {@const idx = flat.indexOf(it)}
          <div
            data-idx={idx}
            role="option"
            aria-selected={value === it.id}
            class="cb-item"
            class:active={idx === activeIdx}
            class:picked={value === it.id}
            onmousedown={(e) => { e.preventDefault(); commit(idx); }}
            onmouseenter={() => { activeIdx = idx; }}
          >
            <span class="cb-item-label">{it.label}</span>
            {#if it.sub}<span class="cb-item-sub">{it.sub}</span>{/if}
          </div>
        {/each}
      {/each}
    </div>
  {:else if open}
    <div class="cb-list cb-empty">No matches</div>
  {/if}
</div>

<style>
  .cb {
    position: relative;
    flex: 1;
    min-width: 0;
  }
  .cb-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--mfd-bg);
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
    padding: 0.65rem 0.85rem;
    font-family: var(--mono);
    font-size: 0.82rem;
    color: var(--mfd-text);
    letter-spacing: 0.04em;
    outline: none;
    text-transform: uppercase;
  }
  .cb-input::placeholder {
    color: var(--mfd-dim);
    text-transform: uppercase;
  }
  .cb-input:focus { border-color: var(--mfd-text); }

  .cb-list {
    position: absolute;
    z-index: 50;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    max-height: 18rem;
    overflow-y: auto;
    background: var(--mfd-bg);
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
    font-family: var(--mono);
    font-size: 0.8rem;
  }
  .cb-empty {
    padding: 0.55rem 0.75rem;
    color: var(--mfd-dim);
  }

  .cb-group {
    position: sticky;
    top: 0;
    background: var(--mfd-bg);
    color: var(--mfd-dim);
    font-weight: 700;
    padding: 0.35rem 0.75rem;
    border-bottom: 1px solid var(--bezel-lo);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.72rem;
  }

  .cb-item {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.45rem 0.75rem;
    color: var(--mfd-text);
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .cb-item.active {
    background: var(--bezel-lo);
    color: var(--mfd-text);
  }
  .cb-item.picked {
    color: var(--led-cyan, var(--mfd-text));
  }
  .cb-item-sub {
    color: var(--mfd-dim);
    font-size: 0.72rem;
    white-space: nowrap;
  }
</style>
