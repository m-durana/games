<script lang="ts">
  import { airlines, logoUrl } from './engine';

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
    // True if the logo is a wordmark (the airline name is visible in it).
    // Filtered out of the logo quiz on hard difficulty so the game tests
    // visual recognition, not reading.
    wordmark?: boolean;
  }
  interface Candidate extends Approved {
    pageid: number;
  }

  const APPROVED_KEY = 'logo-review:approved';
  const SKIPPED_KEY = 'logo-review:skipped';

  function loadJSON<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  let approved: Record<string, Approved> = $state(loadJSON<Record<string, Approved>>(APPROVED_KEY, {}));
  let skipped: Record<string, true> = $state(loadJSON<Record<string, true>>(SKIPPED_KEY, {}));
  let query = $state('');
  let candidates: Candidate[] = $state([]);
  let loading = $state(false);
  let error = $state('');
  let tab: 'review' | 'approved' | 'skipped' = $state('review');
  let exportText = $state('');
  let sharing = $state(false);
  let shareUrl = $state('');
  let shareError = $state('');
  let showImport = $state(false);
  let importText = $state('');
  let cropping: Candidate | null = $state(null);
  let cropCx = $state(0.5);
  let cropCy = $state(0.5);
  let cropSize = $state(0.8);

  const queue = $derived(airlines.filter((a) => !approved[a.iata] && !skipped[a.iata]));
  const approvedList = $derived(airlines.filter((a) => approved[a.iata]));
  const skippedList = $derived(airlines.filter((a) => skipped[a.iata]));
  const current = $derived(queue[0] ?? null);

  $effect(() => {
    if (!current) {
      candidates = [];
      return;
    }
    const nextQuery = `${current.name} airline logo`;
    query = nextQuery;
    void searchFor(nextQuery);
  });

  async function fetchOne(q: string): Promise<Candidate[]> {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*` +
      `&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=16` +
      `&prop=imageinfo&iiprop=url&iiurlwidth=480`;
    const res = await fetch(url);
    const json = await res.json();
    const pages: Record<string, any> = json?.query?.pages ?? {};
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

  async function searchFor(q: string) {
    if (!current) return;
    const clean = q.trim();
    if (!clean) return;
    loading = true;
    error = '';
    candidates = [];
    try {
      let list = await fetchOne(clean);
      if (list.length < 4) {
        const fallback = await fetchOne(`${current.name} logo`);
        const seen = new Set(list.map((c) => c.pageid));
        for (const c of fallback) if (!seen.has(c.pageid)) list.push(c);
      }
      candidates = list.sort((a, b) => a.pageid - b.pageid);
    } catch (e) {
      error = (e as Error).message || 'Search failed';
    } finally {
      loading = false;
    }
  }

  async function search() {
    await searchFor(query);
  }

  const cropBox = $derived.by<Crop>(() => {
    const size = Math.min(1, Math.max(0.05, cropSize));
    const x = Math.min(1 - size, Math.max(0, cropCx - size / 2));
    const y = Math.min(1 - size, Math.max(0, cropCy - size / 2));
    return { x, y, w: size, h: size };
  });

  function startCrop(c: Candidate) {
    cropping = c;
    cropCx = 0.5;
    cropCy = 0.5;
    cropSize = 0.8;
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

  function cancelCrop() {
    cropping = null;
  }

  function approve(c: Candidate, crop?: Crop) {
    if (!current) return;
    approved = {
      ...approved,
      [current.iata]: {
        url: c.url,
        thumb: c.thumb,
        title: c.title,
        descriptionUrl: c.descriptionUrl,
        ...(crop ? { crop } : {}),
      },
    };
    localStorage.setItem(APPROVED_KEY, JSON.stringify(approved));
    cropping = null;
  }

  function approveCrop() {
    if (!cropping) return;
    approve(cropping, cropBox);
  }

  function keepCurrent() {
    if (!current) return;
    approved = {
      ...approved,
      [current.iata]: {
        url: logoUrl(current.iata),
        thumb: logoUrl(current.iata),
        title: `${current.name} current local logo`,
      },
    };
    localStorage.setItem(APPROVED_KEY, JSON.stringify(approved));
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

  function toggleWordmark(iata: string) {
    const cur = approved[iata];
    if (!cur) return;
    approved = {
      ...approved,
      [iata]: { ...cur, wordmark: !cur.wordmark },
    };
    localStorage.setItem(APPROVED_KEY, JSON.stringify(approved));
  }

  function unskip(iata: string) {
    const next = { ...skipped };
    delete next[iata];
    skipped = next;
    localStorage.setItem(SKIPPED_KEY, JSON.stringify(skipped));
  }

  function buildExport() {
    return Object.fromEntries(Object.entries(approved).sort(([a], [b]) => a.localeCompare(b)));
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
    link.download = 'logos-review.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  function applyImport() {
    try {
      const data = JSON.parse(importText) as Record<string, { url: string; thumb?: string; title?: string; descriptionUrl?: string; crop?: Crop; wordmark?: boolean }>;
      const merged: Record<string, Approved> = { ...approved };
      for (const [iata, v] of Object.entries(data)) {
        merged[iata] = {
          url: v.url,
          thumb: v.thumb ?? v.url,
          title: v.title ?? '',
          ...(v.descriptionUrl ? { descriptionUrl: v.descriptionUrl } : {}),
          ...(v.crop ? { crop: v.crop } : {}),
          ...(v.wordmark ? { wordmark: true } : {}),
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

  async function shareToLuke() {
    sharing = true;
    shareError = '';
    shareUrl = '';
    try {
      const json = JSON.stringify(buildExport(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const fd = new FormData();
      fd.append('file', blob, 'logos-review.json');
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
</script>

<header class="head">
  <h1>Logo review</h1>
  <p>Approved {approvedList.length} · Skipped {skippedList.length} · Remaining {queue.length}</p>
</header>

<nav class="tabs">
  <button class:active={tab === 'review'} onclick={() => (tab = 'review')}>Review</button>
  <button class:active={tab === 'approved'} onclick={() => (tab = 'approved')}>Approved ({approvedList.length})</button>
  <button class:active={tab === 'skipped'} onclick={() => (tab = 'skipped')}>Skipped ({skippedList.length})</button>
</nav>

{#if tab === 'review'}
  {#if current}
    <section class="reviewer">
      <div class="airline-head">
        <div>
          <h2>{current.name}</h2>
          <span>{current.country} · {current.iata}</span>
        </div>
        <div class="current-logo">
          <img src={logoUrl(current.iata)} alt={`${current.name} current logo`} />
        </div>
      </div>

      <div class="search-row">
        <input
          type="text"
          bind:value={query}
          onkeydown={(e) => e.key === 'Enter' && search()}
          placeholder="Search Wikimedia Commons..."
        />
        <button onclick={search} disabled={loading}>{loading ? '...' : 'Search'}</button>
      </div>

      {#if error}<p class="err">{error}</p>{/if}

      {#if loading}
        <p class="muted">Searching...</p>
      {:else if candidates.length === 0}
        <p class="muted">No candidates found.</p>
      {:else if cropping}
        <div class="cropper">
          <p class="muted">Click the center of the logo, then size the crop.</p>
          <div
            class="crop-stage"
            onclick={setCenterFromClick}
            onkeydown={setCenterFromKeyboard}
            role="button"
            tabindex="0"
            aria-label="Set logo crop center"
          >
            <img src={cropping.url} alt={cropping.title.replace(/^File:/, '')} />
            <div
              class="crop-box"
              style="left:{cropBox.x * 100}%; top:{cropBox.y * 100}%; width:{cropBox.w * 100}%; height:{cropBox.h * 100}%;"
            ></div>
          </div>
          <div class="sliders">
            <label>
              Size
              <input type="range" min="0.05" max="1" step="0.01" bind:value={cropSize} />
            </label>
          </div>
          <div class="preview-row">
            <span class="muted">Preview</span>
            <div class="crop-preview">
              <img
                src={cropping.url}
                alt=""
                style="width:{100 / cropBox.w}%; height:{100 / cropBox.h}%; left:{(-cropBox.x / cropBox.w) * 100}%; top:{(-cropBox.y / cropBox.h) * 100}%;"
              />
            </div>
          </div>
          <div class="actions">
            <button class="ghost" onclick={cancelCrop}>Back</button>
            <button class="primary-action" onclick={approveCrop}>Approve crop</button>
          </div>
        </div>
      {:else}
        <div class="grid">
          {#each candidates as c}
            <button class="candidate" onclick={() => startCrop(c)}>
              <span class="logo-box">
                <img src={c.thumb} alt={c.title.replace(/^File:/, '')} loading="lazy" />
              </span>
              <span>{c.title.replace(/^File:/, '')}</span>
            </button>
          {/each}
        </div>
      {/if}

      <div class="actions">
        <button class="ghost" onclick={keepCurrent}>Keep current logo</button>
        <button class="ghost" onclick={skip}>Skip</button>
      </div>
    </section>
  {:else}
    <section class="empty">
      <h2>All done.</h2>
      <p>Export the approved logo list below.</p>
    </section>
  {/if}
{:else if tab === 'approved'}
  <section class="list">
    {#each approvedList as a}
      {@const v = approved[a.iata]}
      <div class="row">
        {#if v.crop}
          <div class="row-crop">
            <img
              src={v.thumb}
              alt=""
              style="width:{100 / v.crop.w}%; height:{100 / v.crop.h}%; left:{(-v.crop.x / v.crop.w) * 100}%; top:{(-v.crop.y / v.crop.h) * 100}%;"
            />
          </div>
        {:else}
          <img src={v.thumb} alt="" />
        {/if}
        <div class="row-text">
          <span class="row-name">{a.name}</span>
          <span class="row-meta">{a.iata} · {v.title.replace(/^File:/, '')}</span>
          {#if v.descriptionUrl}
            <a href={v.descriptionUrl} target="_blank" rel="noopener">source</a>
          {/if}
        </div>
        <button
          class="wordmark-toggle"
          class:on={v.wordmark}
          onclick={() => toggleWordmark(a.iata)}
          title="Mark as wordmark logo (filtered out of the logo quiz on hard difficulty)"
        >{v.wordmark ? '✓ wordmark' : 'wordmark?'}</button>
        <button class="undo" onclick={() => unapprove(a.iata)}>Undo</button>
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
    <button onclick={downloadJson}>Download logos-review.json</button>
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
    <textarea readonly rows="7">{exportText}</textarea>
  {/if}
  {#if showImport}
    <textarea bind:value={importText} rows="6" placeholder="Paste logos-review.json here to merge…"></textarea>
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
    padding: 0.5rem;
    border-radius: 4px;
    color: var(--muted);
    font-size: 0.8125rem;
  }
  .tabs button.active { background: var(--surface-2); color: var(--text); }

  .reviewer, .list, .export { display: flex; flex-direction: column; gap: 0.75rem; }
  .airline-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }
  .airline-head h2 { font-size: 1.25rem; font-weight: 600; }
  .airline-head span { color: var(--muted); font-size: 0.8125rem; }
  .current-logo {
    width: 78px;
    height: 54px;
    display: grid;
    place-items: center;
    background: #fff;
    border-radius: 4px;
    padding: 0.45rem;
    flex: 0 0 auto;
  }
  .current-logo img {
    display: block;
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .search-row { display: flex; gap: 0.5rem; }
  input {
    flex: 1;
    min-width: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.625rem 0.875rem;
    border-radius: 6px;
    font: inherit;
  }
  .search-row button, .export-actions button, .undo, .primary-action {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.625rem 0.875rem;
    border-radius: 6px;
    font-size: 0.875rem;
  }
  .err { color: var(--bad); font-size: 0.8125rem; }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }
  @media (min-width: 640px) {
    .grid { grid-template-columns: repeat(3, 1fr); }
  }
  .candidate {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.45rem;
    min-width: 0;
  }
  .candidate:hover { border-color: var(--panel-line); }
  .candidate span:last-child {
    color: var(--muted);
    font-size: 0.72rem;
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }
  .logo-box {
    height: 92px;
    display: grid;
    place-items: center;
    background: #fff;
    border-radius: 4px;
    padding: 0.5rem;
    overflow: hidden;
    min-width: 0;
  }
  .logo-box img {
    display: block;
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .cropper { display: flex; flex-direction: column; gap: 0.75rem; }
  .crop-stage {
    position: relative;
    width: min(100%, 460px);
    aspect-ratio: 1 / 1;
    margin: 0 auto;
    background: #fff;
    border-radius: 6px;
    overflow: hidden;
    cursor: crosshair;
    user-select: none;
  }
  .crop-stage img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .crop-box {
    position: absolute;
    border: 2px solid var(--good);
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.54);
    pointer-events: none;
  }
  .sliders { display: grid; gap: 0.5rem; }
  .sliders label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--muted);
    font-size: 0.8125rem;
  }
  .sliders input { flex: 1; padding: 0; }
  .preview-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .crop-preview, .row-crop {
    position: relative;
    overflow: hidden;
    background: #fff;
    border-radius: 4px;
    flex: 0 0 auto;
  }
  .crop-preview {
    width: 120px;
    height: 120px;
  }
  .crop-preview img, .row-crop img {
    position: absolute;
    max-width: none;
    object-fit: contain;
  }

  .actions, .export-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .ghost {
    flex: 1;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: 6px;
    padding: 0.625rem 1rem;
  }
  .ghost:hover { color: var(--text); border-color: var(--panel-line); }
  .primary-action {
    flex: 1;
    background: var(--accent);
    color: var(--bg);
    font-weight: 600;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.5rem 0.625rem;
  }
  .row img {
    width: 64px;
    height: 44px;
    object-fit: contain;
    background: #fff;
    border-radius: 4px;
    padding: 0.3rem;
  }
  .row-crop {
    width: 48px;
    height: 48px;
  }
  .row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.1rem; }
  .row-name { font-size: 0.875rem; font-weight: 600; }
  .row-meta { color: var(--muted); font-size: 0.75rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row a { color: var(--info); font-size: 0.75rem; }
  .undo { flex: 0 0 auto; color: var(--muted); font-size: 0.75rem; }
  .wordmark-toggle {
    flex: 0 0 auto;
    color: var(--muted);
    font-size: 0.7rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
  }
  .wordmark-toggle.on {
    background: rgba(163, 206, 241, 0.4);
    border-color: rgba(96, 150, 186, 0.65);
    color: var(--accent);
  }

  .empty { text-align: center; padding: 2rem 0; }
  .empty h2 { font-size: 1.25rem; margin-bottom: 0.35rem; }
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
    width: 100%;
    min-height: 48px;
    background: var(--accent);
    color: var(--bg);
    border-radius: 6px;
    font-weight: 600;
  }
</style>
