<script lang="ts">
  import {
    listIntroImageSlots,
    loadIntroOverrides,
    saveIntroOverrides,
    INTRO_LABELS,
    type IntroImageSlot,
  } from './intros';
  import aircraftPhotos from '../data/aircraft-photos.json';
  import militaryPhotos from '../data/military-photos.json';

  interface Props {
    onHome: () => void;
  }

  let { onHome }: Props = $props();

  const AIRCRAFT = aircraftPhotos as Record<string, string[]>;
  const MILITARY = militaryPhotos as Record<string, string[]>;

  const slots: IntroImageSlot[] = listIntroImageSlots();
  const knownIds = new Set(slots.map((s) => s.id));
  // Strip orphaned overrides (slots that no longer exist) on mount.
  const pruned = (() => {
    const raw = loadIntroOverrides();
    const next: Record<string, string> = {};
    for (const [id, url] of Object.entries(raw)) {
      if (knownIds.has(id)) next[id] = url;
    }
    if (Object.keys(next).length !== Object.keys(raw).length) saveIntroOverrides(next);
    return next;
  })();
  let overrides: Record<string, string> = $state(pruned);
  let filter: string = $state('all');
  let expandedId: string | null = $state(null);

  const groups = $derived(Array.from(new Set(slots.map((s) => s.introKey))));
  const filtered = $derived(
    filter === 'all' ? slots : slots.filter((s) => s.introKey === filter)
  );
  const overrideCount = $derived(Object.keys(overrides).filter((k) => overrides[k]).length);

  function currentSrc(slot: IntroImageSlot): string {
    return overrides[slot.id] || slot.defaultSrc;
  }

  function poolPhotos(slot: IntroImageSlot): { aircraftId: string; url: string }[] {
    if (!slot.pool || !slot.poolKind) return [];
    const dict = slot.poolKind === 'aircraft' ? AIRCRAFT : MILITARY;
    const out: { aircraftId: string; url: string }[] = [];
    for (const id of slot.pool) {
      for (const url of dict[id] || []) {
        out.push({ aircraftId: id, url });
      }
    }
    return out;
  }

  function poolCount(slot: IntroImageSlot): number {
    return poolPhotos(slot).length;
  }

  function pick(slot: IntroImageSlot, url: string) {
    overrides = { ...overrides, [slot.id]: url };
    saveIntroOverrides(overrides);
  }

  function clearOverride(slot: IntroImageSlot) {
    const next = { ...overrides };
    delete next[slot.id];
    overrides = next;
    saveIntroOverrides(overrides);
  }

  function toggleExpanded(slot: IntroImageSlot) {
    expandedId = expandedId === slot.id ? null : slot.id;
  }

  function exportJSON() {
    const json = JSON.stringify(overrides, null, 2);
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(json).then(() => alert('Overrides JSON copied to clipboard.'));
    } else {
      window.prompt('Copy the JSON below:', json);
    }
  }

  function importJSON() {
    const raw = window.prompt('Paste JSON object of {id: url} overrides:');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        overrides = { ...overrides, ...parsed };
        saveIntroOverrides(overrides);
      }
    } catch {
      alert('Invalid JSON.');
    }
  }

  function resetAll() {
    if (!confirm('Clear all image overrides?')) return;
    overrides = {};
    saveIntroOverrides(overrides);
  }

  // Wikimedia's thumb pipeline occasionally returns HTML errors that Firefox
  // blocks via OpaqueResponseBlocking. If the curated thumb fails, fall back
  // to the original full-size URL (no thumb path).
  function fullSizeUrl(u: string): string | null {
    if (!u) return null;
    return u.replace('/commons/thumb/', '/commons/').replace(/\/\d{1,5}px-[^/]+$/, '');
  }
  function onImgError(e: Event) {
    const img = e.currentTarget as HTMLImageElement | null;
    if (!img) return;
    const full = fullSizeUrl(img.src);
    if (full && full !== img.src) img.src = full;
  }
</script>

<div class="wrap">
  <header class="head">
    <h2>Intro image review</h2>
    <div class="head-meta">
      <span class="count">{overrideCount} of {slots.length} chosen</span>
      <button class="ghost" type="button" onclick={onHome}>Done</button>
    </div>
  </header>

  <div class="toolbar">
    <select bind:value={filter}>
      <option value="all">All intros ({slots.length})</option>
      {#each groups as g}
        <option value={g}>{INTRO_LABELS[g]} ({slots.filter((s) => s.introKey === g).length})</option>
      {/each}
    </select>
    <div class="spacer"></div>
    <button class="ghost" type="button" onclick={importJSON}>Import JSON</button>
    <button class="ghost" type="button" onclick={exportJSON}>Export JSON</button>
    <button class="danger" type="button" onclick={resetAll}>Reset all</button>
  </div>

  <p class="hint">
    Tap a slot to expand the curated photo grid drawn from the existing approved photos. Click any thumbnail to set it as the override. Picks save to localStorage and apply live.
  </p>

  <div class="slots">
    {#each filtered as slot (slot.id)}
      {@const isOverridden = !!overrides[slot.id]}
      {@const expanded = expandedId === slot.id}
      {@const photos = expanded ? poolPhotos(slot) : []}
      <article class="slot" class:overridden={isOverridden}>
        <div class="slot-head">
          <div class="slot-title">
            <span class="intro-tag">{INTRO_LABELS[slot.introKey]}</span>
            <span class="slide-title">{slot.slideTitle}</span>
          </div>
          <div class="slot-meta">
            <span class="pool-count">{poolCount(slot)} photos</span>
            <code class="id">{slot.id}</code>
          </div>
        </div>

        <div class="row">
          <div class="image-col">
            <div class="img-frame">
              <img src={currentSrc(slot)} alt={slot.caption} loading="lazy" onerror={onImgError} referrerpolicy="no-referrer" />
            </div>
            <div class="caption">{slot.caption}</div>
            {#if isOverridden}
              <div class="override-badge">overridden</div>
            {/if}
          </div>

          <div class="info-col">
            <div class="spec-block">
              <div class="spec-label">What to look for</div>
              <p class="spec">{slot.spec}</p>
            </div>

            <div class="actions">
              <button class="primary" type="button" onclick={() => toggleExpanded(slot)} disabled={poolCount(slot) === 0}>
                {expanded ? 'Hide photos' : `Browse ${poolCount(slot)} photos`}
              </button>
              {#if isOverridden}
                <button class="ghost" type="button" onclick={() => clearOverride(slot)}>Revert to default</button>
              {/if}
            </div>
          </div>
        </div>

        {#if expanded}
          <div class="picker">
            {#each photos as p (p.url)}
              {@const selected = currentSrc(slot) === p.url}
              <button
                type="button"
                class="thumb"
                class:selected
                onclick={() => pick(slot, p.url)}
                title={p.aircraftId}
              >
                <img src={p.url} alt={p.aircraftId} loading="lazy" onerror={onImgError} referrerpolicy="no-referrer" />
                <span class="thumb-id">{p.aircraftId}</span>
                {#if selected}
                  <span class="check">✓</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </article>
    {/each}
  </div>
</div>

<style>
  .wrap {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding-bottom: 2rem;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  .head h2 { font-size: 1.05rem; font-weight: 700; }
  .head-meta { display: flex; align-items: center; gap: 0.75rem; }
  .count { font-size: 0.75rem; color: var(--muted); }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .toolbar select {
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.4rem 0.6rem;
    font-size: 0.8rem;
  }
  .spacer { flex: 1; }
  .toolbar button, .head-meta button {
    border-radius: 4px;
    padding: 0.4rem 0.7rem;
    font-size: 0.8rem;
    font-family: var(--font-main);
    font-weight: 600;
  }
  .ghost { background: var(--surface); border: 1px solid var(--border); color: var(--muted); }
  .ghost:hover { color: var(--accent); border-color: var(--panel-line); }
  .primary {
    background: var(--accent);
    color: var(--bg);
    border: 1px solid var(--accent);
  }
  .primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .danger {
    background: var(--surface);
    border: 1px solid rgba(170, 60, 60, 0.4);
    color: rgba(170, 60, 60, 0.9);
  }
  .danger:hover { background: rgba(170, 60, 60, 0.1); }

  .hint { font-size: 0.75rem; color: var(--muted); line-height: 1.5; }

  .slots { display: flex; flex-direction: column; gap: 0.875rem; }
  .slot {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.875rem;
  }
  .slot.overridden {
    border-color: rgba(96, 150, 186, 0.65);
    background: rgba(163, 206, 241, 0.08);
  }
  .slot-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.625rem;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .intro-tag {
    display: inline-block;
    font-size: 0.625rem;
    font-family: var(--font-main);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--accent);
    background: var(--surface-2);
    border: 1px solid rgba(39, 76, 119, 0.28);
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-weight: 600;
    margin-right: 0.5rem;
  }
  .slide-title { font-size: 0.8rem; color: var(--text); font-weight: 600; }
  .slot-meta { display: flex; align-items: center; gap: 0.5rem; }
  .pool-count {
    font-size: 0.65rem;
    color: var(--muted);
    background: var(--surface-2);
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
  }
  .id {
    font-size: 0.65rem;
    color: var(--muted);
    background: var(--surface-2);
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
  @media (min-width: 720px) {
    .row { grid-template-columns: 240px 1fr; }
  }
  .image-col {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    align-items: stretch;
  }
  .img-frame {
    width: 100%;
    aspect-ratio: 4 / 3;
    background: #0a0a0c;
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .img-frame img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .caption { font-size: 0.7rem; color: var(--muted); text-align: center; }
  .override-badge {
    align-self: center;
    font-size: 0.625rem;
    font-family: var(--font-main);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--accent);
    background: rgba(163, 206, 241, 0.4);
    padding: 0.1rem 0.45rem;
    border-radius: 3px;
  }

  .info-col {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .spec-label {
    font-size: 0.625rem;
    font-family: var(--font-main);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    margin-bottom: 0.25rem;
  }
  .spec {
    font-size: 0.8rem;
    line-height: 1.45;
    color: var(--text);
    background: var(--surface-2);
    padding: 0.5rem 0.6rem;
    border-radius: 4px;
    border-left: 3px solid var(--accent);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .actions button {
    border-radius: 4px;
    padding: 0.4rem 0.75rem;
    font-size: 0.78rem;
    font-family: var(--font-main);
    font-weight: 600;
  }

  .picker {
    margin-top: 0.875rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border);
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }
  @media (min-width: 540px) {
    .picker { grid-template-columns: repeat(3, 1fr); }
  }
  @media (min-width: 720px) {
    .picker { grid-template-columns: repeat(4, 1fr); }
  }
  @media (min-width: 1024px) {
    .picker { grid-template-columns: repeat(5, 1fr); }
  }
  .thumb {
    position: relative;
    background: #0a0a0c;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    padding: 0;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    transition: border-color 0.12s, transform 0.12s;
  }
  .thumb:hover {
    border-color: var(--accent);
    transform: scale(1.02);
  }
  .thumb.selected {
    border-color: var(--accent);
    border-width: 2px;
  }
  .thumb img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: contain;
    display: block;
  }
  .thumb-id {
    font-size: 0.625rem;
    font-family: var(--font-main);
    color: var(--muted);
    background: var(--surface);
    padding: 0.2rem 0.4rem;
    text-align: center;
    border-top: 1px solid var(--border);
  }
  .thumb.selected .thumb-id { color: var(--accent); }
  .check {
    position: absolute;
    top: 0.3rem;
    right: 0.3rem;
    background: var(--accent);
    color: var(--bg);
    border-radius: 50%;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    font-weight: 700;
  }
</style>
