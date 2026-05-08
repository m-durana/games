<script lang="ts">
  import { aircraft, fetchAircraftImages, type Aircraft } from './aircraft';
  import seedReviewState from '../data/aircraft-review-baseline.json';

  interface Props {
    onHome: () => void;
  }
  let { onHome }: Props = $props();

  // Per-aircraft review state, keyed by aircraft id.
  // approvedUrl: the photo the user said "OK" to (one per aircraft).
  // rejected: URLs marked "type on livery" - kept so we don't re-show them
  //   on the next visit and so the export carries this signal.
  interface ReviewEntry {
    // All photos the user said "Good" to. Multiple per aircraft so the game
    // can rotate between several approved shots.
    approved: string[];
    // Photos the user said "Not good" to (filtered out on next visit).
    rejected: string[];
    // Approved photos that have been *type-verified* (the aircraft in the
    // photo actually matches the id it's filed under). Subset of approved.
    verified: string[];
    // Photos the AI campaign never reviewed at all - need a visual quality
    // pass in Curate mode. When user marks Good they move to approved.
    unchecked?: string[];
    // Photos flagged by the AI campaign as ambiguous (criterion 8: multiple
    // aircraft of comparable prominence in frame). Surfaced in Curate so the
    // human can re-judge: keep approved, reject, or leave flagged.
    unsure?: string[];
    // Total photos returned by the last successful Wikimedia fetch. Used
    // to tell "all photos marked" from "still some in the queue" in the
    // jump-to dropdown without having to refetch.
    fetchedCount?: number;
  }

  const KEY = 'aircraft-review:state';

  // Reduce a Wikimedia URL to its underlying filename so equality survives
  // every URL-shape variation we've seen (thumb vs full, 500/800/1280 widths,
  // upload.wikimedia.org vs en.wikipedia.org, %20 vs +). Filenames are unique
  // within Commons, so the basename is enough to identify the same image.
  function canonUrl(u: string): string {
    if (!u) return '';
    let s = u.replace(/\/\d{1,5}px-[^/]+$/, '');
    const last = s.split('/').pop() || s;
    try { return decodeURIComponent(last).toLowerCase(); }
    catch { return last.toLowerCase(); }
  }
  function sameUrl(a: string, b: string): boolean {
    return canonUrl(a) === canonUrl(b);
  }
  // Wikimedia's thumb pipeline occasionally fails for specific files - // it returns an HTML error which Firefox blocks via OpaqueResponseBlocking.
  // Convert .../commons/thumb/x/yy/Foo.jpg/800px-Foo.jpg → .../commons/x/yy/Foo.jpg
  // so we can swap the broken thumb for the original on <img onerror>.
  function fullSizeUrl(u: string): string {
    return u.replace('/commons/thumb/', '/commons/').replace(/\/\d{1,5}px-[^/]+$/, '');
  }
  function onImgError(e: Event) {
    const img = e.currentTarget as HTMLImageElement | null;
    if (!img) return;
    const full = fullSizeUrl(img.src);
    if (full && full !== img.src) img.src = full;
  }
  function sanitizeState(parsed: Record<string, Partial<ReviewEntry> & { approvedUrl?: string }>): Record<string, ReviewEntry> {
    const out: Record<string, ReviewEntry> = {};
    for (const id in parsed) {
      const e = parsed[id] ?? {};
      const approved = Array.isArray(e.approved)
        ? e.approved
        : e.approvedUrl ? [e.approvedUrl] : [];
      const rejected = Array.isArray(e.rejected) ? e.rejected : [];
      const verified = Array.isArray(e.verified) ? e.verified.filter((u) => approved.includes(u)) : [];
      // Drop URLs the user has already decided on. AI-flagged unsure/unchecked
      // entries that overlap with approved/rejected are stale - the human's
      // call wins, no re-prompt.
      const decided = new Set([...approved, ...rejected].map(canonUrl));
      const unchecked = Array.isArray(e.unchecked) ? e.unchecked.filter((u) => !decided.has(canonUrl(u))) : [];
      const unsure = Array.isArray(e.unsure) ? e.unsure.filter((u) => !decided.has(canonUrl(u))) : [];
      const fetchedCount = typeof (e as { fetchedCount?: number }).fetchedCount === 'number'
        ? (e as { fetchedCount?: number }).fetchedCount
        : undefined;
      out[id] = { approved, rejected, verified, unchecked, unsure, fetchedCount };
    }
    return out;
  }
  // Bundled baseline (committed) is authoritative - local edits only keep ids
  // the baseline doesn't already cover, so a stale browser can't shadow it.
  function loadState(): Record<string, ReviewEntry> {
    const seed = sanitizeState(seedReviewState as Record<string, any>);
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return seed;
      const local = sanitizeState(JSON.parse(raw));
      return { ...local, ...seed };
    } catch { return seed; }
  }
  function persist() { localStorage.setItem(KEY, JSON.stringify(state)); }

  let state: Record<string, ReviewEntry> = $state(loadState());
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

  // Cursor walks the FULL image queue (in fetched order), not a filtered list.
  // Prev/next can revisit any photo - including rejected ones - so the user
  // can change their mind by re-clicking Good or Not good.
  let cursor = $state(0);

  type Mode = 'curate' | 'verify';
  let mode: Mode = $state('curate');

  const current = $derived(aircraft[index]);
  const entry = $derived<ReviewEntry>(
    state[current?.id] ?? { approved: [], rejected: [], verified: [] },
  );
  const currentPhoto = $derived(images[cursor] ?? null);
  const isApproved = $derived(
    currentPhoto !== null && entry.approved.some((u) => sameUrl(u, currentPhoto)),
  );
  const isRejected = $derived(
    currentPhoto !== null && entry.rejected.some((u) => sameUrl(u, currentPhoto)),
  );
  const aircraftWithAnyApproval = $derived(
    Object.values(state).filter((e) => (e.approved ?? []).length > 0).length,
  );
  const totalApprovedPhotos = $derived(
    Object.values(state).reduce((n, e) => n + (e.approved ?? []).length, 0),
  );
  const unreviewedAircraft = $derived(
    aircraft.filter((a) => {
      const e = state[a.id];
      return !e || ((e.approved?.length ?? 0) === 0 && (e.rejected?.length ?? 0) === 0);
    }).length,
  );
  const partialAircraft = $derived(
    aircraft.filter((a) => reviewStatus(a.id) === 'partial').length,
  );
  const totalUncheckedPhotos = $derived(
    Object.values(state).reduce((n, e) => n + (e.unchecked?.length ?? 0), 0),
  );
  const totalUnsurePhotos = $derived(
    Object.values(state).reduce((n, e) => n + (e.unsure?.length ?? 0), 0),
  );

  $effect(() => {
    if (!current) return;
    cursor = 0;
    void loadFor(current);
  });

  // Warm the next image in the queue so a click on Good/Not good doesn't
  // wait on a network round-trip. Re-runs whenever the cursor or queue moves.
  $effect(() => {
    const next = images[cursor + 1];
    if (!next) return;
    const img = new Image();
    img.src = next;
  });

  // Keyboard shortcuts mirror AirportReview so muscle memory carries over.
  // Curate:  G / Y / Space → Good        R / N        → Not good
  //          ← / A         → prev plane  → / D        → next plane
  //          ↑ / K         → prev photo  ↓ / J        → next photo
  // Verify:  G / Y / Space → Confirm     R / N        → Wrong/remove
  //          ← / A         → prev        → / D        → next
  //          Z             → undo
  // Disabled while typing in inputs/textareas/selects.
  $effect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (mode === 'curate') {
        switch (k) {
          case 'g': case 'y': case ' ': if (currentPhoto) { approve(); e.preventDefault(); } break;
          case 'r': case 'n': if (currentPhoto) { rejectShowsType(); e.preventDefault(); } break;
          case 'arrowright': case 'd': next(); e.preventDefault(); break;
          case 'arrowleft': case 'a': prev(); e.preventDefault(); break;
          case 'arrowdown': case 'j': nextPhoto(); e.preventDefault(); break;
          case 'arrowup': case 'k': prevPhoto(); e.preventDefault(); break;
        }
      } else if (mode === 'verify') {
        if (!verifyCurrent) return;
        switch (k) {
          case 'g': case 'y': case ' ': verifyConfirm(); e.preventDefault(); break;
          case 'r': case 'n': verifyRemove(); e.preventDefault(); break;
          case 'arrowright': case 'd': verifyNext(); e.preventDefault(); break;
          case 'arrowleft': case 'a': verifyPrev(); e.preventDefault(); break;
          case 'z': verifyUndo(); e.preventDefault(); break;
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function loadFor(a: Aircraft) {
    loading = true;
    error = '';
    images = [];
    try {
      const urls = await fetchAircraftImages(a);
      if (a.id !== current?.id) return;
      // Merge in unchecked + unsure URLs (AI campaign either never reviewed
      // them or flagged them as multi-subject ambiguous). Unchecked is dedup'd
      // against the wikimedia fetch; unsure is *kept even if also in approved*
      // because the whole point is to re-surface flagged-but-approved photos.
      const e0 = state[a.id];
      const uncheckedUrls = e0?.unchecked ?? [];
      const unsureUrls = e0?.unsure ?? [];
      const fetchedSet = new Set(urls.map(canonUrl));
      const uncheckedNew = uncheckedUrls.filter((u) => !fetchedSet.has(canonUrl(u)));
      const unsureSet = new Set(unsureUrls.map(canonUrl));
      const unsureNew = unsureUrls.filter((u) => !fetchedSet.has(canonUrl(u))
        && !uncheckedNew.some((x) => canonUrl(x) === canonUrl(u)));
      const allUrls = [...uncheckedNew, ...unsureNew, ...urls];
      // Put unreviewed (or flagged-unsure) photos first so the user lands on
      // actual work. Unsure URLs always count as "unreviewed" for ordering,
      // even if they're already in approved — flagged means re-review needed.
      const seen = new Set<string>();
      for (const u of [...(e0?.approved ?? []), ...(e0?.rejected ?? [])]) seen.add(canonUrl(u));
      const isWork = (u: string) => unsureSet.has(canonUrl(u)) || !seen.has(canonUrl(u));
      const unreviewed = allUrls.filter(isWork);
      const reviewed = allUrls.filter((u) => !isWork(u));
      images = [...unreviewed, ...reviewed];
      if (urls.length > 0) {
        const e = ensureEntry(a.id);
        if (e.fetchedCount !== urls.length) {
          state = { ...state, [a.id]: { ...e, fetchedCount: urls.length } };
          persist();
        }
      }
      if (urls.length === 0) {
        error = 'No photos returned. Wikimedia may be rate-limiting - wait a moment and try Skip / Prev plane to retry.';
      }
    } catch (err) {
      if (a.id !== current?.id) return;
      error = (err as Error).message || 'Failed to fetch images';
    } finally {
      if (a.id === current?.id) loading = false;
    }
  }
  function retry() {
    if (current) void loadFor(current);
  }

  function ensureEntry(id: string): ReviewEntry {
    if (!state[id]) {
      state = { ...state, [id]: { approved: [], rejected: [], verified: [], unchecked: [], unsure: [] } };
    } else if (!Array.isArray(state[id].verified) || !Array.isArray(state[id].unsure)) {
      state = { ...state, [id]: { ...state[id], verified: state[id].verified ?? [], unchecked: state[id].unchecked ?? [], unsure: state[id].unsure ?? [] } };
    }
    return state[id];
  }

  // Per-aircraft review status used by the dropdown and the header counter.
  // 'partial' only fires when we KNOW there are more photos to mark
  // (fetchedCount is set and exceeds marks). Unknown count is treated as
  // reviewed - no nagging hint.
  function reviewStatus(id: string): 'unreviewed' | 'partial' | 'reviewed' {
    const e = state[id];
    const ac = e?.approved?.length ?? 0;
    const rc = e?.rejected?.length ?? 0;
    const uc = e?.unchecked?.length ?? 0;
    const us = e?.unsure?.length ?? 0;
    const fc = e?.fetchedCount;
    if (ac === 0 && rc === 0 && uc === 0 && us === 0) return 'unreviewed';
    if (uc > 0 || us > 0) return 'partial';
    if (typeof fc === 'number' && ac + rc < fc) return 'partial';
    return 'reviewed';
  }

  function advanceCursor() {
    if (cursor < images.length - 1) cursor += 1;
  }

  function approve() {
    if (!currentPhoto) return;
    const id = current.id;
    const e = ensureEntry(id);
    const url = currentPhoto;
    const alreadyApproved = e.approved.some((u) => sameUrl(u, url));
    const nextApproved = alreadyApproved ? e.approved : [...e.approved, url];
    // Approving overrides any prior rejection (matched canonically).
    const nextRejected = e.rejected.filter((u) => !sameUrl(u, url));
    // Mark as visually checked - drop from the unchecked + unsure queues.
    const nextUnchecked = (e.unchecked ?? []).filter((u) => !sameUrl(u, url));
    const nextUnsure = (e.unsure ?? []).filter((u) => !sameUrl(u, url));
    state = { ...state, [id]: { approved: nextApproved, rejected: nextRejected, verified: e.verified ?? [], unchecked: nextUnchecked, unsure: nextUnsure, fetchedCount: e.fetchedCount } };
    persist();
    advanceCursor();
  }

  function rejectShowsType() {
    if (!currentPhoto) return;
    const id = current.id;
    const e = ensureEntry(id);
    const url = currentPhoto;
    const alreadyRejected = e.rejected.some((u) => sameUrl(u, url));
    const nextRejected = alreadyRejected ? e.rejected : [...e.rejected, url];
    // Rejecting overrides any prior approval - also drops any verification.
    const nextApproved = e.approved.filter((u) => !sameUrl(u, url));
    const nextVerified = (e.verified ?? []).filter((u) => !sameUrl(u, url));
    const nextUnchecked = (e.unchecked ?? []).filter((u) => !sameUrl(u, url));
    const nextUnsure = (e.unsure ?? []).filter((u) => !sameUrl(u, url));
    state = { ...state, [id]: { approved: nextApproved, rejected: nextRejected, verified: nextVerified, unchecked: nextUnchecked, unsure: nextUnsure, fetchedCount: e.fetchedCount } };
    persist();
    advanceCursor();
  }

  function nextPhoto() {
    if (cursor < images.length - 1) cursor += 1;
  }
  function prevPhoto() {
    if (cursor > 0) cursor -= 1;
  }

  function next() {
    if (index < aircraft.length - 1) { index += 1; }
  }
  function prev() {
    if (index > 0) { index -= 1; }
  }

  // --- Verify mode ----------------------------------------------------
  // Walks all approved photos across every aircraft so the user can confirm
  // the type/subtype is actually what's in the picture, or reassign it.

  interface VerifyItem { id: string; url: string; verified: boolean; }
  let verifyShowAll = $state(false); // when false, hide already-verified photos
  let verifyCursor = $state(0);
  let reassignTarget = $state(''); // dropdown value

  const verifyQueue = $derived.by<VerifyItem[]>(() => {
    const items: VerifyItem[] = [];
    for (const a of aircraft) {
      const e = state[a.id];
      if (!e) continue;
      const verified = new Set(e.verified ?? []);
      for (const url of e.approved) {
        const v = verified.has(url);
        if (!verifyShowAll && v) continue;
        items.push({ id: a.id, url, verified: v });
      }
    }
    return items;
  });
  const verifyTotalApproved = $derived(
    Object.values(state).reduce((n, e) => n + (e.approved ?? []).length, 0),
  );
  const verifyTotalVerified = $derived(
    Object.values(state).reduce(
      (n, e) => n + (e.verified ?? []).filter((u) => (e.approved ?? []).includes(u)).length,
      0,
    ),
  );
  const verifyCurrent = $derived(verifyQueue[verifyCursor] ?? null);
  const verifyAircraft = $derived(verifyCurrent ? aircraft.find((a) => a.id === verifyCurrent.id) ?? null : null);

  $effect(() => {
    // Keep cursor in range if the queue shrinks (e.g. after verifying / removing).
    if (verifyCursor >= verifyQueue.length) {
      verifyCursor = Math.max(0, verifyQueue.length - 1);
    }
  });

  // LIFO history of verify-mode mutations. Each entry is a full state +
  // cursor snapshot, captured *before* the action; verifyUndo() restores it.
  // State is small (kbs), cap at 30 to keep memory trivial.
  type VerifySnapshot = { state: Record<string, ReviewEntry>; cursor: number; showAll: boolean };
  let verifyHistory: VerifySnapshot[] = $state([]);
  const VERIFY_HISTORY_MAX = 30;
  function snapshotForUndo() {
    const cloned: Record<string, ReviewEntry> = {};
    for (const [id, e] of Object.entries(state)) {
      cloned[id] = {
        approved: [...e.approved],
        rejected: [...e.rejected],
        verified: [...(e.verified ?? [])],
        unchecked: [...(e.unchecked ?? [])],
        unsure: [...(e.unsure ?? [])],
        ...(e.fetchedCount !== undefined ? { fetchedCount: e.fetchedCount } : {}),
      };
    }
    const next = [...verifyHistory, { state: cloned, cursor: verifyCursor, showAll: verifyShowAll }];
    if (next.length > VERIFY_HISTORY_MAX) next.shift();
    verifyHistory = next;
  }
  function verifyUndo() {
    if (verifyHistory.length === 0) return;
    const last = verifyHistory[verifyHistory.length - 1];
    state = last.state;
    verifyShowAll = last.showAll;
    verifyCursor = last.cursor;
    verifyHistory = verifyHistory.slice(0, -1);
    persist();
  }

  function verifyConfirm() {
    if (!verifyCurrent) return;
    snapshotForUndo();
    const { id, url } = verifyCurrent;
    const e = ensureEntry(id);
    if (!(e.verified ?? []).includes(url)) {
      state = { ...state, [id]: { ...e, verified: [...(e.verified ?? []), url] } };
      persist();
    }
    if (!verifyShowAll) {
      // Item just dropped out of the queue; cursor stays put to land on the next.
      if (verifyCursor >= verifyQueue.length - 1) verifyCursor = Math.max(0, verifyQueue.length - 2);
    } else {
      verifyNext();
    }
  }

  function verifyReassign() {
    if (!verifyCurrent || !reassignTarget) return;
    const { id: fromId, url } = verifyCurrent;
    if (reassignTarget === fromId) { verifyConfirm(); return; }
    snapshotForUndo();
    const fromEntry = ensureEntry(fromId);
    const toEntry = ensureEntry(reassignTarget);
    state = {
      ...state,
      [fromId]: {
        approved: fromEntry.approved.filter((u) => u !== url),
        rejected: fromEntry.rejected,
        verified: (fromEntry.verified ?? []).filter((u) => u !== url),
        unchecked: (fromEntry.unchecked ?? []).filter((u) => u !== url),
        unsure: (fromEntry.unsure ?? []).filter((u) => u !== url),
        fetchedCount: fromEntry.fetchedCount,
      },
      [reassignTarget]: {
        approved: toEntry.approved.includes(url) ? toEntry.approved : [...toEntry.approved, url],
        rejected: toEntry.rejected.filter((u) => u !== url),
        verified: (toEntry.verified ?? []).includes(url)
          ? (toEntry.verified ?? [])
          : [...(toEntry.verified ?? []), url],
        unchecked: toEntry.unchecked ?? [],
        unsure: toEntry.unsure ?? [],
        fetchedCount: toEntry.fetchedCount,
      },
    };
    persist();
    reassignTarget = '';
    if (!verifyShowAll && verifyCursor >= verifyQueue.length - 1) {
      verifyCursor = Math.max(0, verifyQueue.length - 2);
    }
  }

  function verifyRemove() {
    if (!verifyCurrent) return;
    snapshotForUndo();
    const { id, url } = verifyCurrent;
    const e = ensureEntry(id);
    state = {
      ...state,
      [id]: {
        approved: e.approved.filter((u) => u !== url),
        rejected: e.rejected.includes(url) ? e.rejected : [...e.rejected, url],
        verified: (e.verified ?? []).filter((u) => u !== url),
        unchecked: (e.unchecked ?? []).filter((u) => u !== url),
        unsure: (e.unsure ?? []).filter((u) => u !== url),
        fetchedCount: e.fetchedCount,
      },
    };
    persist();
    if (verifyCursor >= verifyQueue.length - 1) {
      verifyCursor = Math.max(0, verifyQueue.length - 2);
    }
  }

  function verifyUnverify() {
    if (!verifyCurrent) return;
    snapshotForUndo();
    const { id, url } = verifyCurrent;
    const e = ensureEntry(id);
    state = {
      ...state,
      [id]: { ...e, verified: (e.verified ?? []).filter((u) => u !== url) },
    };
    persist();
  }

  function verifyNext() {
    if (verifyCursor < verifyQueue.length - 1) verifyCursor += 1;
  }
  function verifyPrev() {
    if (verifyCursor > 0) verifyCursor -= 1;
  }

  function buildExport() { return state; }
  function exportData() {
    exportText = JSON.stringify(buildExport(), null, 2);
    navigator.clipboard?.writeText(exportText).catch(() => {});
  }
  function downloadJson() {
    const blob = new Blob([JSON.stringify(buildExport(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'aircraft-review.json';
    link.click();
    URL.revokeObjectURL(url);
  }
  // Build a fresh aircraft-photos.json snapshot: per family, just the verified URLs.
  // The user drops the downloaded file into src/data/aircraft-photos.json and rebuilds.
  function downloadGamePool() {
    const photos: Record<string, string[]> = {};
    for (const id of Object.keys(state)) {
      const verified = state[id]?.verified ?? [];
      if (verified.length > 0) photos[id] = [...verified];
    }
    const blob = new Blob([JSON.stringify(photos, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'aircraft-photos.json';
    link.click();
    URL.revokeObjectURL(url);
  }
  async function shareToLuke() {
    sharing = true; shareError = ''; shareUrl = '';
    try {
      const json = JSON.stringify(buildExport(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const fd = new FormData();
      fd.append('file', blob, 'aircraft-review.json');
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
      const data = JSON.parse(importText) as Record<string, any>;
      state = { ...state, ...sanitizeState(data) };
      persist();
      importText = '';
      showImport = false;
    } catch (e: any) {
      error = 'Invalid JSON: ' + (e?.message ?? '');
    }
  }
</script>

<header class="head">
  <h1>Aircraft photo review</h1>
  <p>
    {aircraftWithAnyApproval}/{aircraft.length} aircraft with ≥1 approved · {totalApprovedPhotos} photos approved · {verifyTotalVerified}/{verifyTotalApproved} type-verified
    {#if totalUncheckedPhotos > 0} · <span class="unreviewed-badge">⊘ {totalUncheckedPhotos} unchecked (need visual review)</span>{/if}
    {#if totalUnsurePhotos > 0} · <span class="unreviewed-badge">? {totalUnsurePhotos} flagged (multi-subject)</span>{/if}
    {#if unreviewedAircraft > 0} · <span class="unreviewed-badge">● {unreviewedAircraft} unreviewed</span>{/if}
    {#if partialAircraft > 0} · <span class="partial-badge">◐ {partialAircraft} partial</span>{/if}
  </p>
  <div class="mode-toggle">
    <button class:on={mode === 'curate'} onclick={() => (mode = 'curate')}>Curate (good / not good)</button>
    <button class:on={mode === 'verify'} onclick={() => (mode = 'verify')}>Verify aircraft type</button>
  </div>
</header>

{#if mode === 'verify'}
  <section class="reviewer">
    <div class="airline-head">
      <div>
        <h2>Verify aircraft type</h2>
        <span>
          {verifyQueue.length} in queue ·
          {verifyTotalVerified} / {verifyTotalApproved} verified
        </span>
      </div>
      <label class="show-all">
        <input type="checkbox" bind:checked={verifyShowAll} />
        Show already-verified
      </label>
    </div>

    {#if !verifyCurrent}
      <div class="empty">
        <p class="muted">
          {verifyTotalApproved === 0
            ? 'No approved photos yet. Use Curate first, or import a review JSON.'
            : 'All approved photos have been type-verified. Toggle "Show already-verified" to revisit them.'}
        </p>
      </div>
    {:else}
      {@const va = verifyAircraft}
      <div class="stage" class:approved={verifyCurrent.verified}>
        <div class="filed-as">
          <span class="muted">Currently filed as:</span>
          <strong>{va?.name ?? verifyCurrent.id}</strong>
          {#if va}<span class="muted"> · {va.manufacturer} · {va.family}</span>{/if}
          {#if verifyCurrent.verified}<span class="status-good"> · verified ✓</span>{/if}
        </div>
        <a class="img-wrap" href={verifyCurrent.url} target="_blank" rel="noopener">
          <img src={verifyCurrent.url} alt={`Verify ${va?.name ?? verifyCurrent.id}`} onerror={onImgError} />
        </a>
        <p class="counter">Photo {verifyCursor + 1} / {verifyQueue.length}</p>

        <div class="primary-actions">
          <button class="ok" onclick={verifyConfirm}>
            {verifyCurrent.verified ? '✓ Already verified · keep' : 'Confirm correct'}
          </button>
          <button class="reject" onclick={verifyRemove}>Wrong / not visible - remove</button>
        </div>

        <div class="reassign">
          <label for="reassign-select" class="muted">Reassign to a different type:</label>
          <div class="reassign-row">
            <select id="reassign-select" bind:value={reassignTarget}>
              <option value=""> - pick correct aircraft - </option>
              {#each aircraft as a}
                <option value={a.id} disabled={a.id === verifyCurrent.id}>
                  {a.name}{a.id === verifyCurrent.id ? ' (current)' : ''}
                </option>
              {/each}
            </select>
            <button onclick={verifyReassign} disabled={!reassignTarget || reassignTarget === verifyCurrent.id}>
              Reassign →
            </button>
          </div>
        </div>

        <div class="cycle">
          <button onclick={verifyPrev} disabled={verifyCursor === 0}>← prev</button>
          <button onclick={verifyUndo} disabled={verifyHistory.length === 0} title="Undo last confirm / remove / reassign / un-verify">
            ↶ undo{verifyHistory.length > 0 ? ` (${verifyHistory.length})` : ''}
          </button>
          {#if verifyCurrent.verified}
            <button onclick={verifyUnverify}>un-verify</button>
          {/if}
          <button onclick={verifyNext} disabled={verifyCursor >= verifyQueue.length - 1}>next →</button>
        </div>
      </div>
    {/if}
  </section>
{:else if current}
  <section class="reviewer">
    <div class="airline-head">
      <div>
        <h2>{current.name}</h2>
        <span>{current.manufacturer} · {current.family} · {index + 1} / {aircraft.length}</span>
      </div>
      <div class="nav">
        <button onclick={prev} disabled={index === 0}>← Prev plane</button>
        <button onclick={next} disabled={index >= aircraft.length - 1}>Skip →</button>
      </div>
    </div>

    <select
      class="jump-to"
      value={current.id}
      onchange={(e) => {
        const sel = e.currentTarget as HTMLSelectElement;
        const i = aircraft.findIndex((a) => a.id === sel.value);
        if (i >= 0) index = i;
        sel.blur();
      }}
    >
      {#each aircraft as a, i}
        {@const e = state[a.id]}
        {@const ac = e?.approved?.length ?? 0}
        {@const rc = e?.rejected?.length ?? 0}
        {@const uc = e?.unchecked?.length ?? 0}
        {@const us = e?.unsure?.length ?? 0}
        {@const fc = e?.fetchedCount}
        {@const status = reviewStatus(a.id)}
        {@const remaining = (uc + us) > 0 ? (uc + us) : (typeof fc === 'number' ? Math.max(0, fc - ac - rc) : 0)}
        <option value={a.id}>
          {status === 'unreviewed' ? '● ' : status === 'partial' ? '◐ ' : '   '}{i + 1}. {a.name}{ac > 0 ? ` · ${ac} good` : ''}{rc > 0 ? ` · ${rc} not good` : ''}{status === 'unreviewed' ? ' · unreviewed' : ''}{status === 'partial' ? ` · ${remaining} left` : ''}
        </option>
      {/each}
    </select>

    {#if error}
      <div class="err-row">
        <p class="err">{error}</p>
        <button class="retry" onclick={retry}>Retry</button>
      </div>
    {/if}

    {#if loading}
      <p class="muted">Loading photos…</p>
    {:else if images.length === 0}
      <div class="empty">
        <p class="muted">No photos available for {current.name}.</p>
        <div style="display:flex;gap:0.5rem;">
          <button onclick={retry}>Retry</button>
          <button onclick={next}>Skip to next plane</button>
        </div>
      </div>
    {:else if currentPhoto}
      <div class="stage" class:approved={isApproved} class:rejected={isRejected}>
        <a class="img-wrap" href={currentPhoto} target="_blank" rel="noopener">
          <img src={currentPhoto} alt={`${current.name} candidate`} onerror={onImgError} />
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
        <p class="shortcuts">Shortcuts: <kbd>G</kbd>/<kbd>Space</kbd> good · <kbd>R</kbd> not good · <kbd>↑</kbd>/<kbd>↓</kbd> photo · <kbd>←</kbd>/<kbd>→</kbd> plane</p>
        <button class="next-plane" onclick={next} disabled={index >= aircraft.length - 1}>
          Next plane →
        </button>
      </div>
    {/if}
  </section>
{/if}

<section class="export">
  <div class="export-actions">
    <button onclick={exportData}>Copy JSON</button>
    <button onclick={downloadJson}>Download aircraft-review.json</button>
    <button onclick={downloadGamePool}>Download aircraft-photos.json (game pool)</button>
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
    <textarea bind:value={importText} rows="6" placeholder="Paste aircraft-review.json here to merge…"></textarea>
    <button onclick={applyImport} disabled={!importText.trim()}>Apply import</button>
  {/if}
</section>

<footer class="footer">
  <button class="primary" onclick={onHome}>Back home</button>
</footer>

<style>
  .head { padding: 0.5rem 0.25rem; }
  .mode-toggle {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.6rem;
  }
  .mode-toggle button {
    flex: 1;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-size: 0.8125rem;
  }
  .mode-toggle button.on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg);
    font-weight: 600;
  }
  .show-all { display: inline-flex; align-items: center; gap: 0.35rem; color: var(--muted); font-size: 0.8125rem; }
  .unreviewed-badge { color: var(--accent); font-weight: 500; }
  .partial-badge { color: var(--accent); font-weight: 500; opacity: 0.8; }
  .shortcuts {
    color: var(--muted);
    font-size: 0.6875rem;
    text-align: center;
    margin-top: 0.1rem;
  }
  .shortcuts kbd {
    display: inline-block;
    padding: 0 0.3rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface-2);
    color: var(--text);
    font-family: var(--font-main);
    font-size: 0.6875rem;
  }
  .filed-as { font-size: 0.875rem; }
  .filed-as strong { font-weight: 600; }
  .reassign { display: flex; flex-direction: column; gap: 0.35rem; }
  .reassign-row { display: flex; gap: 0.4rem; }
  .reassign-row select {
    flex: 1;
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.45rem 0.6rem;
    font-size: 0.8125rem;
    font-family: inherit;
  }
  .reassign-row button {
    background: var(--accent);
    color: var(--bg);
    border: none;
    border-radius: 6px;
    padding: 0.45rem 0.85rem;
    font-size: 0.8125rem;
    font-weight: 500;
  }
  .reassign-row button:disabled { opacity: 0.4; }
  .head h1 { font-size: 1.75rem; font-weight: 600; margin-bottom: 0.35rem; }
  .head p, .muted { color: var(--muted); font-size: 0.875rem; }
  .reviewer, .export { display: flex; flex-direction: column; gap: 0.75rem; }
  .airline-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
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
  .err-row { display: flex; gap: 0.5rem; align-items: center; }
  .err-row .err { flex: 1; }
  .retry, .empty button {
    background: var(--accent);
    color: var(--bg);
    padding: 0.4rem 0.85rem;
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .stage {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
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
  .img-wrap img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .counter { color: var(--muted); font-size: 0.75rem; text-align: center; }

  .primary-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  @media (max-width: 520px) {
    .primary-actions { grid-template-columns: 1fr; }
  }
  .primary-actions button {
    min-height: 50px;
    border-radius: 6px;
    font-size: 0.9375rem;
    font-weight: 500;
    border: 1px solid var(--border);
  }
  .primary-actions .ok {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }
  .primary-actions .ok.on {
    background: var(--good);
    border-color: var(--good);
    color: var(--bg);
  }
  .primary-actions .reject {
    background: var(--surface-2);
    color: var(--text);
  }
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

  .cycle {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }
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
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    align-items: center;
  }
  .empty button {
    background: var(--accent);
    color: var(--bg);
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-weight: 500;
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
  .ghost {
    flex: 1;
    background: transparent;
    color: var(--muted);
  }
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
