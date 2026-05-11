<script lang="ts">
  import { military, fetchMilitaryImages, type MilitaryAircraft } from './military-aircraft';

  interface Props {
    onHome: () => void;
  }
  let { onHome }: Props = $props();

  interface ReviewEntry {
    approved: string[];
    rejected: string[];
  }

  const KEY = 'military-review:state';
  function loadState(): Record<string, ReviewEntry> {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, Partial<ReviewEntry> & { approvedUrl?: string }>;
      const out: Record<string, ReviewEntry> = {};
      for (const id in parsed) {
        const e = parsed[id] ?? {};
        const approved = Array.isArray(e.approved)
          ? e.approved
          : e.approvedUrl ? [e.approvedUrl] : [];
        const rejected = Array.isArray(e.rejected) ? e.rejected : [];
        out[id] = { approved, rejected };
      }
      return out;
    } catch { return {}; }
  }
  function persist() { localStorage.setItem(KEY, JSON.stringify(reviewState)); }

  let reviewState: Record<string, ReviewEntry> = $state(loadState());
  let index = $state(0);
  let images: string[] = $state([]);
  let loading = $state(true);
  let error = $state('');
  let exportText = $state('');
  let sharing = $state(false);
  let shareUrl = $state('');
  let shareError = $state('');
  let showImport = $state(false);
  let importText = $state('');
  let cursor = $state(0);

  const current = $derived(military[index]);
  const entry = $derived<ReviewEntry>(
    reviewState[current?.id] ?? { approved: [], rejected: [] },
  );
  const currentPhoto = $derived(images[cursor] ?? null);
  const isApproved = $derived(
    currentPhoto !== null && entry.approved.includes(currentPhoto),
  );
  const isRejected = $derived(
    currentPhoto !== null && entry.rejected.includes(currentPhoto),
  );
  const aircraftWithAnyApproval = $derived(
    Object.values(reviewState).filter((e) => (e.approved ?? []).length > 0).length,
  );
  const totalApprovedPhotos = $derived(
    Object.values(reviewState).reduce((n, e) => n + (e.approved ?? []).length, 0),
  );

  $effect(() => {
    if (!current) return;
    cursor = 0;
    void loadFor(current);
  });

  async function loadFor(a: MilitaryAircraft) {
    loading = true;
    error = '';
    images = [];
    try {
      images = await fetchMilitaryImages(a);
    } catch (err) {
      error = (err as Error).message || 'Failed to fetch images';
    } finally {
      loading = false;
    }
  }

  function ensureEntry(id: string): ReviewEntry {
    if (!reviewState[id]) reviewState = { ...reviewState, [id]: { approved: [], rejected: [] } };
    return reviewState[id];
  }

  function advanceCursor() {
    if (cursor < images.length - 1) cursor += 1;
  }

  function approve() {
    if (!currentPhoto) return;
    const id = current.id;
    const e = ensureEntry(id);
    const url = currentPhoto;
    const nextApproved = e.approved.includes(url) ? e.approved : [...e.approved, url];
    const nextRejected = e.rejected.filter((u) => u !== url);
    reviewState = { ...reviewState, [id]: { approved: nextApproved, rejected: nextRejected } };
    persist();
    advanceCursor();
  }

  function rejectShowsType() {
    if (!currentPhoto) return;
    const id = current.id;
    const e = ensureEntry(id);
    const url = currentPhoto;
    const nextRejected = e.rejected.includes(url) ? e.rejected : [...e.rejected, url];
    const nextApproved = e.approved.filter((u) => u !== url);
    reviewState = { ...reviewState, [id]: { approved: nextApproved, rejected: nextRejected } };
    persist();
    advanceCursor();
  }

  function nextPhoto() { if (cursor < images.length - 1) cursor += 1; }
  function prevPhoto() { if (cursor > 0) cursor -= 1; }
  function next() { if (index < military.length - 1) index += 1; }
  function prev() { if (index > 0) index -= 1; }

  function buildExport() { return reviewState; }
  function exportData() {
    exportText = JSON.stringify(buildExport(), null, 2);
    navigator.clipboard?.writeText(exportText).catch(() => {});
  }
  function downloadJson() {
    const blob = new Blob([JSON.stringify(buildExport(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'military-review.json';
    link.click();
    URL.revokeObjectURL(url);
  }
  async function shareToLuke() {
    sharing = true; shareError = ''; shareUrl = '';
    try {
      const json = JSON.stringify(buildExport(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const fd = new FormData();
      fd.append('file', blob, 'military-review.json');
      const res = await fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
      const data = await res.json();
      const u: string = data?.data?.url ?? '';
      shareUrl = u.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
    } catch (e) {
      shareError = (e as Error).message || 'upload failed';
    } finally { sharing = false; }
  }
  function applyImport() {
    try {
      type AnyEntry = { approved?: string[]; approvedUrl?: string; rejected?: string[] };
      const data = JSON.parse(importText) as Record<string, AnyEntry>;
      const merged = { ...reviewState };
      for (const [id, e] of Object.entries(data)) {
        const approved = e.approved ?? (e.approvedUrl ? [e.approvedUrl] : []);
        merged[id] = { approved, rejected: e.rejected ?? [] };
      }
      reviewState = merged;
      persist();
      importText = '';
      showImport = false;
    } catch (e: any) {
      error = 'Invalid JSON: ' + (e?.message ?? '');
    }
  }
</script>

<header class="head">
  <h1>Military photo review</h1>
  <p>{aircraftWithAnyApproval}/{military.length} aircraft with ≥1 approved · {totalApprovedPhotos} photos approved</p>
</header>

{#if current}
  <section class="reviewer">
    <div class="airline-head">
      <div>
        <h2>{current.name}</h2>
        <span>{current.manufacturer} · {current.origin} · {current.role} · {index + 1} / {military.length}</span>
      </div>
      <div class="nav">
        <button onclick={prev} disabled={index === 0}>← Prev plane</button>
        <button onclick={next} disabled={index >= military.length - 1}>Skip →</button>
      </div>
    </div>

    <select
      class="jump-to"
      value={current.id}
      onchange={(e) => {
        const id = (e.currentTarget as HTMLSelectElement).value;
        const i = military.findIndex((a) => a.id === id);
        if (i >= 0) index = i;
      }}
    >
      {#each military as a, i}
        {@const e = reviewState[a.id]}
        {@const ac = e?.approved?.length ?? 0}
        {@const rc = e?.rejected?.length ?? 0}
        <option value={a.id}>
          {i + 1}. {a.name}{ac > 0 ? ` · ${ac} good` : ''}{rc > 0 ? ` · ${rc} not good` : ''}{ac === 0 && rc === 0 ? ' · untouched' : ''}
        </option>
      {/each}
    </select>

    {#if error}<p class="err">{error}</p>{/if}

    {#if loading}
      <p class="muted">Loading photos…</p>
    {:else if images.length === 0}
      <div class="empty">
        <p class="muted">No photos found for {current.name}.</p>
        <button onclick={next}>Skip to next plane</button>
      </div>
    {:else if currentPhoto}
      <div class="stage" class:approved={isApproved} class:rejected={isRejected}>
        <a class="img-wrap" href={currentPhoto} target="_blank" rel="noopener">
          <img src={currentPhoto} alt={`${current.name} candidate`} />
        </a>
        <p class="counter">
          Photo {cursor + 1} / {images.length}
          · {entry.approved.length} good
          {#if entry.rejected.length > 0}· {entry.rejected.length} not good{/if}
          {#if isApproved}· <span class="status-good">good ✓</span>{/if}
          {#if isRejected}· <span class="status-bad">not good ✗</span>{/if}
        </p>
        <div class="primary-actions">
          <button class="ok" class:on={isApproved} onclick={approve}>
            {isApproved ? '✓ Marked good' : 'Good'}
          </button>
          <button class="reject" class:on={isRejected} onclick={rejectShowsType}>
            {isRejected ? '✗ Marked not good' : 'Not good'}
          </button>
        </div>
        <div class="cycle">
          <button onclick={prevPhoto} disabled={cursor === 0}>← prev photo in queue</button>
          <button onclick={nextPhoto} disabled={cursor >= images.length - 1}>next photo →</button>
        </div>
        <button class="next-plane" onclick={next} disabled={index >= military.length - 1}>
          Next plane →
        </button>
      </div>
    {/if}
  </section>
{/if}

<section class="export">
  <div class="export-actions">
    <button onclick={exportData}>Copy JSON</button>
    <button onclick={downloadJson}>Download military-review.json</button>
    <button onclick={shareToLuke} disabled={sharing}>{sharing ? 'Uploading…' : 'Share to Luke'}</button>
    <button class="ghost" onclick={() => (showImport = !showImport)}>{showImport ? 'Hide import' : 'Import'}</button>
  </div>
  {#if shareUrl}
    <p class="share-url">Send Luke this URL: <a href={shareUrl} target="_blank" rel="noopener">{shareUrl}</a></p>
  {/if}
  {#if shareError}<p class="err">Upload failed: {shareError}</p>{/if}
  {#if exportText}
    <textarea readonly rows="6">{exportText}</textarea>
  {/if}
  {#if showImport}
    <textarea bind:value={importText} rows="6" placeholder="Paste military-review.json here to merge…"></textarea>
    <button onclick={applyImport} disabled={!importText.trim()}>Apply import</button>
  {/if}
</section>

<footer class="footer">
  <button class="primary" onclick={onHome}>Back home</button>
</footer>

<style>
  .head { padding: 0.5rem 0.25rem; }
  .head h1 { font-size: 1.75rem; font-weight: 600; margin-bottom: 0.35rem; }
  .head p, .muted { color: var(--muted); font-size: 0.875rem; }
  .reviewer, .export { display: flex; flex-direction: column; gap: 0.75rem; }
  .airline-head {
    display: flex; justify-content: space-between; align-items: center;
    gap: 1rem; flex-wrap: wrap;
  }
  .airline-head h2 { font-size: 1.25rem; font-weight: 600; }
  .airline-head span { color: var(--muted); font-size: 0.8125rem; }
  .nav { display: flex; gap: 0.4rem; }
  .nav button {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.4rem 0.85rem;
    border-radius: 6px;
    font-size: 0.8125rem;
  }
  .nav button:disabled { opacity: 0.4; }
  .jump-to {
    width: 100%;
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.5rem 0.7rem;
    font-size: 0.8125rem;
    font-family: inherit;
  }
  .jump-to:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .err { color: var(--bad); font-size: 0.8125rem; }
  .stage {
    display: flex; flex-direction: column; gap: 0.625rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem;
  }
  .stage.approved {
    border-color: var(--good);
    background: rgba(34, 197, 94, 0.05);
  }
  .stage.rejected {
    border-color: rgba(239, 68, 68, 0.55);
    background: rgba(239, 68, 68, 0.04);
  }
  .status-good { color: var(--good); font-weight: 600; }
  .status-bad { color: var(--bad); font-weight: 600; }
  .img-wrap {
    display: block;
    background: #fff;
    border-radius: 6px;
    overflow: hidden;
    aspect-ratio: 4 / 3;
    max-height: 460px;
  }
  .img-wrap img { width: 100%; height: 100%; object-fit: contain; }
  .counter { color: var(--muted); font-size: 0.75rem; text-align: center; }
  .primary-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  @media (max-width: 520px) { .primary-actions { grid-template-columns: 1fr; } }
  .primary-actions button {
    min-height: 50px;
    border-radius: 6px;
    font-size: 0.9375rem;
    font-weight: 500;
    border: 1px solid var(--border);
  }
  .primary-actions .ok { background: var(--accent); color: var(--bg); border-color: var(--accent); }
  .primary-actions .ok.on { background: var(--good); border-color: var(--good); color: var(--bg); }
  .primary-actions .reject { background: var(--surface-2); color: var(--text); }
  .primary-actions .reject:hover {
    background: rgba(239, 68, 68, 0.12);
    border-color: rgba(239, 68, 68, 0.55);
    color: var(--bad);
  }
  .primary-actions .reject.on {
    background: var(--bad);
    border-color: var(--bad);
    color: var(--bg);
  }
  .cycle { display: flex; justify-content: space-between; gap: 0.5rem; }
  .cycle button {
    flex: 1;
    background: transparent;
    border: 1px dashed var(--border);
    color: var(--muted);
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
    font-size: 0.75rem;
  }
  .cycle button:disabled { opacity: 0.35; }
  .next-plane {
    margin-top: 0.25rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 500;
  }
  .next-plane:disabled { opacity: 0.4; }
  .next-plane:not(:disabled):hover { border-color: var(--panel-line); }
  .empty {
    text-align: center;
    padding: 1rem;
    background: var(--surface);
    border: 1px dashed var(--border);
    border-radius: 8px;
    display: flex; flex-direction: column; gap: 0.625rem; align-items: center;
  }
  .empty button {
    background: var(--accent); color: var(--bg);
    padding: 0.5rem 1rem; border-radius: 6px; font-weight: 500;
  }
  .export-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .export-actions button, .ghost {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.625rem 0.875rem;
    border-radius: 6px;
    font-size: 0.875rem;
  }
  .ghost { flex: 1; background: transparent; color: var(--muted); }
  textarea {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 6px;
    padding: 0.625rem;
    font-family: var(--font-main);
    resize: vertical;
  }
  .footer { padding-top: 0.75rem; }
  .footer .primary {
    width: 100%; min-height: 48px;
    background: var(--accent); color: var(--bg);
    border-radius: 6px; font-weight: 600;
  }
</style>
