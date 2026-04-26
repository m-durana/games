<script lang="ts">
  import { airlines } from './engine';

  interface Props {
    onHome: () => void;
  }
  let { onHome }: Props = $props();

  interface Crop { x: number; y: number; w: number; h: number }
  interface Approved {
    url: string;
    thumb: string;
    title: string;
    descriptionUrl?: string;
    crop?: Crop;
  }
  interface Candidate {
    url: string;
    thumb: string;
    title: string;
    pageid: number;
    descriptionUrl: string;
  }

  const APPROVED_KEY = 'tail-review:approved';
  const SKIPPED_KEY = 'tail-review:skipped';

  function loadJSON<T>(k: string, d: T): T {
    try {
      const raw = localStorage.getItem(k);
      return raw ? (JSON.parse(raw) as T) : d;
    } catch {
      return d;
    }
  }

  let approved: Record<string, Approved> = $state(loadJSON<Record<string, Approved>>(APPROVED_KEY, {}));
  let skipped: Record<string, true> = $state(loadJSON<Record<string, true>>(SKIPPED_KEY, {}));
  let query = $state('');
  let candidates: Candidate[] = $state([]);
  let loading = $state(false);
  let error = $state('');
  let mode: 'unreviewed' | 'approved' | 'skipped' = $state('unreviewed');
  let exportText = $state('');
  let importText = $state('');
  let showImport = $state(false);
  let shareUrl = $state('');
  let sharing = $state(false);
  let shareError = $state('');

  // crop mode state
  let cropping: Candidate | null = $state(null);
  let cropCx = $state(0.5);
  let cropCy = $state(0.5);
  let cropSize = $state(0.25); // side length as fraction of min(imgW, imgH)
  let cropImgRatio = $state(1); // width/height of full image, set on load

  const queue = $derived(airlines.filter((a) => !approved[a.iata] && !skipped[a.iata]));
  const approvedList = $derived(airlines.filter((a) => approved[a.iata]));
  const skippedList = $derived(airlines.filter((a) => skipped[a.iata]));
  const current = $derived(queue[0] ?? null);

  $effect(() => {
    if (current) {
      query = `${current.name} tail`;
      void autoSearch();
    } else {
      candidates = [];
    }
  });

  async function fetchOne(q: string): Promise<Candidate[]> {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*` +
      `&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=12` +
      `&prop=imageinfo&iiprop=url&iiurlwidth=400`;
    const res = await fetch(url);
    const j = await res.json();
    const pages: Record<string, any> = j?.query?.pages ?? {};
    return Object.values(pages)
      .filter((p: any) => p.imageinfo?.[0])
      .map((p: any) => ({
        pageid: p.pageid,
        title: p.title,
        url: p.imageinfo[0].url,
        thumb: p.imageinfo[0].thumburl ?? p.imageinfo[0].url,
        descriptionUrl: p.imageinfo[0].descriptionurl ?? '',
      }));
  }

  async function autoSearch() {
    if (!current) return;
    loading = true;
    error = '';
    candidates = [];
    try {
      const tailQ = `${current.name} tail`;
      let list = await fetchOne(tailQ);
      if (list.length < 4) {
        const fallback = await fetchOne(`${current.name} aircraft`);
        const seen = new Set(list.map((c) => c.pageid));
        for (const c of fallback) if (!seen.has(c.pageid)) list.push(c);
      }
      list.sort((a, b) => a.pageid - b.pageid);
      candidates = list;
    } catch (e: any) {
      error = e?.message ?? 'Search failed';
    } finally {
      loading = false;
    }
  }

  async function search() {
    if (!current) return;
    loading = true;
    error = '';
    candidates = [];
    const q = query.trim();
    if (!q) {
      loading = false;
      return;
    }
    try {
      const list = await fetchOne(q);
      list.sort((a, b) => a.pageid - b.pageid);
      candidates = list;
    } catch (e: any) {
      error = e?.message ?? 'Search failed';
    } finally {
      loading = false;
    }
  }

  function startCrop(c: Candidate) {
    cropping = c;
    cropCx = 0.5;
    cropCy = 0.4;
    cropSize = 0.25;
  }

  function cancelCrop() {
    cropping = null;
  }

  function onImageLoaded(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    cropImgRatio = img.naturalWidth / img.naturalHeight;
  }

  function setCenterFromClick(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    cropCx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    cropCy = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
  }

  function setCenterFromKeyboard(e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    cropCx = 0.5;
    cropCy = 0.5;
  }

  // square crop in pixel space; cropSize is fraction of the shorter image side (1.0 = full shorter side)
  const cropBox = $derived.by<Crop>(() => {
    const sw = cropImgRatio >= 1 ? cropSize / cropImgRatio : cropSize;
    const sh = cropImgRatio >= 1 ? cropSize : cropSize * cropImgRatio;
    let x = cropCx - sw / 2;
    let y = cropCy - sh / 2;
    x = Math.min(1 - sw, Math.max(0, x));
    y = Math.min(1 - sh, Math.max(0, y));
    return { x, y, w: sw, h: sh };
  });

  function confirmCrop() {
    if (!current || !cropping) return;
    const c = cropping;
    approved = {
      ...approved,
      [current.iata]: {
        url: c.url,
        thumb: c.thumb,
        title: c.title,
        descriptionUrl: c.descriptionUrl,
        crop: cropBox,
      },
    };
    localStorage.setItem(APPROVED_KEY, JSON.stringify(approved));
    cropping = null;
  }

  function skip() {
    if (!current) return;
    skipped = { ...skipped, [current.iata]: true };
    localStorage.setItem(SKIPPED_KEY, JSON.stringify(skipped));
  }

  function unapprove(iata: string) {
    const next = { ...approved };
    delete next[iata];
    approved = next;
    localStorage.setItem(APPROVED_KEY, JSON.stringify(approved));
  }

  function unskip(iata: string) {
    const next = { ...skipped };
    delete next[iata];
    skipped = next;
    localStorage.setItem(SKIPPED_KEY, JSON.stringify(skipped));
  }

  function buildExport() {
    const out: Record<string, { url: string; thumb: string; title: string; crop?: Crop }> = {};
    for (const [iata, a] of Object.entries(approved)) {
      out[iata] = { url: a.url, thumb: a.thumb, title: a.title, ...(a.crop ? { crop: a.crop } : {}) };
    }
    return out;
  }

  function exportData() {
    exportText = JSON.stringify(buildExport(), null, 2);
    navigator.clipboard?.writeText(exportText).catch(() => {});
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(buildExport(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tails.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function shareToLuke() {
    sharing = true;
    shareError = '';
    shareUrl = '';
    try {
      const json = JSON.stringify(buildExport(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const fd = new FormData();
      fd.append('file', blob, 'tails.json');
      const res = await fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
      const data = await res.json();
      const u: string = data?.data?.url ?? '';
      shareUrl = u.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
    } catch (e) {
      shareError = (e as Error).message || 'upload failed';
    } finally {
      sharing = false;
    }
  }

  function applyImport() {
    try {
      const data = JSON.parse(importText) as Record<string, { url: string; thumb?: string; title?: string; crop?: Crop }>;
      const merged: Record<string, Approved> = { ...approved };
      for (const [iata, v] of Object.entries(data)) {
        merged[iata] = {
          url: v.url,
          thumb: v.thumb ?? v.url,
          title: v.title ?? '',
          ...(v.crop ? { crop: v.crop } : {}),
        };
      }
      approved = merged;
      localStorage.setItem(APPROVED_KEY, JSON.stringify(approved));
      importText = '';
      showImport = false;
    } catch (e: any) {
      error = 'Invalid JSON: ' + (e?.message ?? '');
    }
  }

  function recropApproved(iata: string) {
    const a = approved[iata];
    if (!a) return;
    const air = airlines.find((x) => x.iata === iata);
    if (!air) return;
    // remove approval so this airline becomes "current" again, then enter crop with its candidate
    const next = { ...approved };
    delete next[iata];
    approved = next;
    localStorage.setItem(APPROVED_KEY, JSON.stringify(approved));
    mode = 'unreviewed';
    cropping = {
      url: a.url,
      thumb: a.thumb,
      title: a.title,
      pageid: 0,
      descriptionUrl: a.descriptionUrl ?? '',
    };
    if (a.crop) {
      cropCx = a.crop.x + a.crop.w / 2;
      cropCy = a.crop.y + a.crop.h / 2;
      // approximate inverse: pick max of w*ratio, h
      cropSize = Math.max(a.crop.w, a.crop.h);
    }
  }
</script>

<header class="head">
  <h1>Tail review</h1>
  <p>
    Reviewed {Object.keys(approved).length} · Skipped {Object.keys(skipped).length} · Remaining {queue.length}
  </p>
</header>

<nav class="tabs">
  <button class:active={mode === 'unreviewed'} onclick={() => (mode = 'unreviewed')}>Review</button>
  <button class:active={mode === 'approved'} onclick={() => (mode = 'approved')}>Approved ({approvedList.length})</button>
  <button class:active={mode === 'skipped'} onclick={() => (mode = 'skipped')}>Skipped ({skippedList.length})</button>
</nav>

{#if mode === 'unreviewed'}
  {#if current}
    <section class="reviewer">
      <div class="airline-head">
        <h2>{current.name}</h2>
        <span class="meta">{current.country} · {current.iata} · hub {current.hub}</span>
      </div>

      <div class="search-row">
        <input
          type="text"
          bind:value={query}
          onkeydown={(e) => e.key === 'Enter' && search()}
          placeholder="Search Wikimedia Commons…"
        />
        <button onclick={search} disabled={loading}>{loading ? '…' : 'Search'}</button>
      </div>

      {#if error}<p class="err">{error}</p>{/if}

      {#if cropping}
        <div class="cropper">
          <p class="muted">Click on the tail. Use the slider to size the crop. The game shows only this region.</p>
          <div
            class="crop-stage"
            style="aspect-ratio: {cropImgRatio};"
            onclick={setCenterFromClick}
            onkeydown={setCenterFromKeyboard}
            role="button"
            tabindex="0"
            aria-label="Set crop center"
          >
            <img src={cropping.url} alt="" onload={onImageLoaded} />
            <div
              class="crop-box"
              style="left:{cropBox.x * 100}%; top:{cropBox.y * 100}%; width:{cropBox.w * 100}%; height:{cropBox.h * 100}%;"
            ></div>
          </div>
          <label class="size-row">
            Size
            <input type="range" min="0.05" max="1" step="0.01" bind:value={cropSize} />
          </label>
          <div class="crop-preview-row">
            <span class="muted">Preview:</span>
            <div class="cropframe" style="aspect-ratio:{cropBox.w / cropBox.h};">
              <img
                src={cropping.url}
                alt=""
                style="width:{100 / cropBox.w}%; height:{100 / cropBox.h}%; left:{(-cropBox.x / cropBox.w) * 100}%; top:{(-cropBox.y / cropBox.h) * 100}%;"
              />
            </div>
          </div>
          <div class="crop-actions">
            <button class="ghost" onclick={cancelCrop}>Back</button>
            <button class="primary" onclick={confirmCrop}>Save crop</button>
          </div>
        </div>
      {:else if loading}
        <p class="muted">Searching…</p>
      {:else if candidates.length === 0}
        <p class="muted">No results. Try a different query (e.g. add the IATA, "tail", or "livery").</p>
      {:else}
        <div class="grid">
          {#each candidates as c}
            <button class="cand" onclick={() => startCrop(c)}>
              <img src={c.thumb} alt={c.title} loading="lazy" />
              <span class="cand-title">{c.title.replace(/^File:/, '')}</span>
            </button>
          {/each}
        </div>
      {/if}

      {#if !cropping}
        <div class="actions">
          <button class="ghost" onclick={skip}>Skip — none of these</button>
        </div>
      {/if}
    </section>
  {:else}
    <section class="empty">
      <h2>All done.</h2>
      <p>No more airlines to review. Export the JSON below.</p>
    </section>
  {/if}
{:else if mode === 'approved'}
  <section class="list">
    {#each approvedList as a}
      {@const v = approved[a.iata]}
      <div class="row">
        {#if v.crop}
          <div class="cropframe small" style="aspect-ratio:{v.crop.w / v.crop.h};">
            <img
              src={v.thumb}
              alt=""
              style="width:{100 / v.crop.w}%; height:{100 / v.crop.h}%; left:{(-v.crop.x / v.crop.w) * 100}%; top:{(-v.crop.y / v.crop.h) * 100}%;"
            />
          </div>
        {:else}
          <img src={v.thumb} alt="" class="row-thumb" />
        {/if}
        <div class="row-text">
          <span class="row-name">{a.name}</span>
          <span class="row-meta">{a.iata}{v.crop ? '' : ' · no crop'}</span>
          {#if v.descriptionUrl}
            <a class="row-link" href={v.descriptionUrl} target="_blank" rel="noopener">source</a>
          {/if}
        </div>
        <div class="row-btns">
          <button class="undo" onclick={() => recropApproved(a.iata)}>Recrop</button>
          <button class="undo" onclick={() => unapprove(a.iata)}>Undo</button>
        </div>
      </div>
    {:else}
      <p class="muted">Nothing approved yet.</p>
    {/each}
  </section>
{:else}
  <section class="list">
    {#each skippedList as a}
      <div class="row">
        <div class="row-text">
          <span class="row-name">{a.name}</span>
          <span class="row-meta">{a.country} · {a.iata}</span>
        </div>
        <button class="undo" onclick={() => unskip(a.iata)}>Re-review</button>
      </div>
    {:else}
      <p class="muted">Nothing skipped.</p>
    {/each}
  </section>
{/if}

<section class="export">
  <div class="export-actions">
    <button onclick={exportData}>Copy JSON</button>
    <button onclick={downloadJson}>Download tails.json</button>
    <button onclick={shareToLuke} disabled={sharing}>{sharing ? 'Uploading…' : 'Share to Luke'}</button>
    <button class="ghost" onclick={() => (showImport = !showImport)}>{showImport ? 'Hide import' : 'Import'}</button>
  </div>
  {#if shareUrl}
    <p class="share-url">Send Luke this URL: <a href={shareUrl} target="_blank" rel="noopener">{shareUrl}</a></p>
  {/if}
  {#if shareError}
    <p class="share-err">Upload failed: {shareError}</p>
  {/if}
  {#if exportText}
    <textarea readonly rows="6">{exportText}</textarea>
  {/if}
  {#if showImport}
    <textarea bind:value={importText} rows="6" placeholder="Paste tails.json here to merge…"></textarea>
    <button onclick={applyImport} disabled={!importText.trim()}>Apply import</button>
  {/if}
</section>

<footer class="footer">
  <button class="primary" onclick={onHome}>Back home</button>
</footer>

<style>
  .head { padding: 0.5rem 0.25rem; }
  .head h1 {
    font-size: 1.75rem;
    font-weight: 600;
    letter-spacing: 0;
    margin-bottom: 0.4rem;
  }
  .head p { color: var(--muted); font-size: 0.875rem; }

  .tabs {
    display: flex;
    gap: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px;
  }
  .tabs button {
    flex: 1;
    padding: 0.5rem 0.5rem;
    border-radius: 8px;
    font-size: 0.8125rem;
    color: var(--muted);
  }
  .tabs button.active { background: var(--surface-2); color: var(--text); }

  .airline-head { display: flex; flex-direction: column; gap: 0.2rem; }
  .airline-head h2 { font-size: 1.25rem; font-weight: 600; letter-spacing: 0; }
  .airline-head .meta { color: var(--muted); font-size: 0.8125rem; }

  .search-row { display: flex; gap: 0.5rem; }
  .search-row input {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.625rem 0.875rem;
    border-radius: 6px;
    font-size: 0.875rem;
  }
  .search-row button {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.625rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
  }

  .reviewer { display: flex; flex-direction: column; gap: 0.75rem; }
  .err { color: var(--bad); font-size: 0.8125rem; }
  .muted { color: var(--muted); font-size: 0.875rem; }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }
  @media (min-width: 540px) {
    .grid { grid-template-columns: repeat(3, 1fr); }
  }
  .cand {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    transition: border-color 0.15s, transform 0.1s;
  }
  .cand:hover { border-color: rgba(71, 217, 176, 0.55); }
  .cand:active { transform: scale(0.98); }
  .cand img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    border-radius: 6px;
    background: var(--surface-2);
  }
  .cand-title {
    font-size: 0.6875rem;
    color: var(--muted);
    text-align: left;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .actions { padding-top: 0.25rem; }
  .ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 0.625rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    width: 100%;
  }
  .ghost:hover { color: var(--text); border-color: var(--panel-line); }

  .empty { text-align: center; padding: 2rem 0; }
  .empty h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.4rem; }
  .empty p { color: var(--muted); }

  .list { display: flex; flex-direction: column; gap: 0.4rem; }
  .row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.5rem 0.625rem;
  }
  .row .row-thumb {
    width: 56px;
    height: 42px;
    object-fit: cover;
    border-radius: 6px;
    background: var(--surface-2);
    flex-shrink: 0;
  }
  .row-btns { display: flex; flex-direction: column; gap: 0.25rem; }

  .cropper { display: flex; flex-direction: column; gap: 0.6rem; }
  .crop-stage {
    position: relative;
    width: 100%;
    background: var(--surface-2);
    border-radius: 6px;
    overflow: hidden;
    cursor: crosshair;
    user-select: none;
  }
  .crop-stage img { width: 100%; height: 100%; display: block; }
  .crop-box {
    position: absolute;
    border: 2px solid var(--good);
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
    pointer-events: none;
  }
  .size-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--muted);
  }
  .size-row input { flex: 1; }
  .crop-preview-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }
  .cropframe {
    position: relative;
    width: 140px;
    overflow: hidden;
    border-radius: 8px;
    background: var(--surface-2);
    flex-shrink: 0;
  }
  .cropframe.small { width: 72px; }
  .cropframe img {
    position: absolute;
    max-width: none;
    object-fit: cover;
  }
  .crop-actions { display: flex; gap: 0.5rem; }
  .crop-actions .primary {
    flex: 1;
    background: var(--accent);
    color: var(--bg);
    border-radius: 6px;
    padding: 0.625rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
  }
  .crop-actions .ghost { flex: 1; }
  .row-text { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .row-name { font-size: 0.875rem; font-weight: 500; }
  .row-meta { font-size: 0.75rem; color: var(--muted); }
  .row-link { font-size: 0.6875rem; color: var(--info); }
  .undo {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 0.4rem 0.75rem;
    border-radius: 8px;
    font-size: 0.75rem;
  }

  .export { display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.5rem; }
  .export-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .export-actions button {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.5rem 0.875rem;
    border-radius: 6px;
    font-size: 0.8125rem;
  }
  textarea {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.625rem;
    border-radius: 6px;
    font-family: var(--font-main);
    font-size: 0.75rem;
    resize: vertical;
  }

  .footer { padding-top: 0.75rem; }
  .footer .primary {
    width: 100%;
    min-height: 48px;
    background: var(--accent);
    color: var(--bg);
    border-radius: 8px;
    font-size: 0.9375rem;
    font-weight: 500;
  }
</style>
