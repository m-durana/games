<script lang="ts">
  import { untrack } from 'svelte';
  import reviewAirportData from '../data/airport-review-airports.json';
  import seedReviewState from '../data/airport-review-state.json';
  import { airports as modeledAirports, fetchAirportCandidates, commonsFileKey, regionOf, regionLabel, type AirportEntry } from './airports-game';

  interface Props {
    onHome: () => void;
  }
  let { onHome }: Props = $props();

  type Provider = 'arcgis' | 'mapbox' | 'azure';

  interface AerialSpec {
    provider: Provider;
    lat: number;
    lon: number;
    zoom: number; // index into ZOOM_LEVELS, 0 = closest
  }

  interface ReviewEntry {
    aerial: AerialSpec | null;
    approved: string[];
    rejected: string[];
    // Manual lat/lon override for airports whose Wikipedia page lacks geo
    // coords (AMM, GYD, …). Persists with the rest of the export so it
    // survives sharing.
    coords?: { lat: number; lon: number };
  }

  type ReviewAirportExtra = Pick<AirportEntry, 'iata' | 'name' | 'country' | 'city' | 'lat' | 'wikipedia' | 'commonsCategory'> & {
    lon?: number;
  };
  type ReviewAirportEntry = AirportEntry & { lon?: number };

  const REVIEW_EXTRAS = reviewAirportData as ReviewAirportExtra[];
  // Index by IATA so we can splice `lon` into modeled airports (which only ship
  // `lat`) and avoid an unnecessary Wikipedia coord lookup at runtime.
  const REVIEW_BY_IATA = new Map(REVIEW_EXTRAS.map((a) => [a.iata, a]));
  const modeledIds = new Set(modeledAirports.map((a) => a.iata));
  const reviewAirportList: ReviewAirportEntry[] = [
    ...modeledAirports.map((a) => {
      const enriched = REVIEW_BY_IATA.get(a.iata);
      const lon = enriched && typeof enriched.lon === 'number' ? enriched.lon : undefined;
      return { ...a, lon } as ReviewAirportEntry;
    }),
    ...REVIEW_EXTRAS
      .filter((a) => !modeledIds.has(a.iata))
      .map((a) => ({
        ...a,
        runways: 0,
        terminals: 0,
        paxYearlyM: 0,
        hubAlliance: 'Independent' as const,
      })),
  ].sort((a, b) => a.iata.localeCompare(b.iata));

  const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';
  const AZURE_MAPS_KEY = import.meta.env.VITE_AZURE_MAPS_KEY || '';

  const PROVIDERS: Provider[] = [
    'arcgis',
    ...(MAPBOX_TOKEN ? (['mapbox'] as const) : []),
    ...(AZURE_MAPS_KEY ? (['azure'] as const) : []),
  ];
  // Slider range: 0 = closest game frame, max = widest game frame. Each step
  // halves linear extent - matches Web Mercator tile zoom and keeps the
  // box-fraction formula uniform across providers. The user can opt into
  // EXTRA_LEVELS more zoom-out steps for very large airports (FRA, DEN, ORD).
  const BASE_ZOOM_LEVELS = 4;
  const EXTRA_LEVELS = 2;
  const MAX_ZOOM_LEVELS = BASE_ZOOM_LEVELS + EXTRA_LEVELS;
  const DEFAULT_ZOOM = 2;

  const KEY = 'airport-review:state';

  // Stale tokenized aerials in older saves: drop them so we don't show 404s
  // and so the export never carries someone else's revoked token.
  function looksLikeStaleAerial(url: string): boolean {
    return /imagery\.nationalmap\.gov|arcgisonline\.com|api\.mapbox\.com|atlas\.microsoft\.com/.test(url);
  }

  function sanitizeState(parsed: Record<string, any>): Record<string, ReviewEntry> {
    const out: Record<string, ReviewEntry> = {};
    for (const id in parsed) {
      const e = parsed[id] ?? {};
      const rawApproved = Array.isArray(e.approved)
        ? e.approved
        : e.approvedUrl ? [e.approvedUrl] : [];
      const approved = rawApproved.filter((u: string) => typeof u === 'string' && !looksLikeStaleAerial(u));
      const rejected = Array.isArray(e.rejected)
        ? e.rejected.filter((u: string) => typeof u === 'string' && !looksLikeStaleAerial(u))
        : [];
      const aerial = e.aerial && typeof e.aerial === 'object' ? (e.aerial as AerialSpec) : null;
      const c = e.coords;
      const coordsOverride =
        c && typeof c === 'object' && typeof c.lat === 'number' && typeof c.lon === 'number'
          ? { lat: c.lat, lon: c.lon }
          : undefined;
      out[id] = coordsOverride
        ? { aerial, approved, rejected, coords: coordsOverride }
        : { aerial, approved, rejected };
    }
    return out;
  }
  // Seed bundled with the build is authoritative - once a review round-trips
  // through Share → commit → redeploy, that file is the source of truth.
  // localStorage is kept only for airports the seed doesn't cover yet, so a
  // stale browser cache can't shadow the latest committed state.
  function loadState(): Record<string, ReviewEntry> {
    const seed = sanitizeState(seedReviewState as Record<string, any>);
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return seed;
      const local = sanitizeState(JSON.parse(raw));
      return { ...local, ...seed };
    } catch { return seed; }
  }
  function persist() { localStorage.setItem(KEY, JSON.stringify(reviewState)); }

  let reviewState: Record<string, ReviewEntry> = $state(loadState());
  let index = $state(0);
  let photos: string[] = $state([]);
  let aerialZooms: Record<Provider, number> = $state({ arcgis: DEFAULT_ZOOM, mapbox: DEFAULT_ZOOM, azure: DEFAULT_ZOOM });
  // Box position as fractions of the wide image, where (0,0) is centered on
  // the airport. Persists across providers so panning ArcGIS and switching to
  // Mapbox lands on the same physical spot.
  let pan: { x: number; y: number } = $state({ x: 0, y: 0 });
  let dragging = $state(false);
  let loading = $state(true);
  let error = $state('');
  let exportText = $state('');
  let sharing = $state(false);
  let shareUrl = $state('');
  let shareError = $state('');
  let showImport = $state(false);
  let importText = $state('');
  let stage: 'aerial' | 'gallery' = $state('gallery');
  let providerIndex = $state(0);
  let extraWide = $state(false);
  let lightboxIndex: number | null = $state(null);
  let thumbCursor = $state(0);
  let thumbsGridWidth = $state(0);
  // Matches the CSS minmax(140px, 1fr) - keep in sync if the CSS changes.
  const THUMB_MIN_PX = 140;
  const gridCols = $derived(Math.max(1, Math.floor(thumbsGridWidth / THUMB_MIN_PX) || 1));
  let coords: { lat: number; lon: number } | null = $state(null);
  let coordsLoading = $state(false);

  const current = $derived(reviewAirportList[index]);
  const entry = $derived<ReviewEntry>(
    reviewState[current?.iata] ?? { aerial: null, approved: [], rejected: [] },
  );

  const currentProvider = $derived<Provider | null>(PROVIDERS[providerIndex] ?? null);
  const aerialItem = $derived(
    coords && currentProvider
      ? { provider: currentProvider, zoom: aerialZooms[currentProvider] }
      : null,
  );

  const zoomLevels = $derived(extraWide ? MAX_ZOOM_LEVELS : BASE_ZOOM_LEVELS);
  const widestZoom = $derived(zoomLevels - 1);

  // Aerial display: fetch the widest image once, render it at native resolution,
  // and overlay a centered zoom box that represents the game's actual frame at
  // the chosen zoom. No CSS upscaling => the wide image stays sharp; the box
  // shrinks/grows as the user adjusts the slider.
  const aerialBaseUrl = $derived.by(() => {
    if (!aerialItem || !coords || !current) return null;
    return buildAerialUrl(aerialItem.provider, coords, widestZoom, current.country);
  });
  // Fraction of the wide image that the game frame will cover (0..1).
  const boxFraction = $derived.by(() => {
    if (!aerialItem) return 1;
    return Math.pow(2, aerialItem.zoom - widestZoom);
  });
  const panClamped = $derived.by(() => {
    const lim = Math.max(0, 0.5 - boxFraction / 2);
    return {
      x: Math.min(lim, Math.max(-lim, pan.x)),
      y: Math.min(lim, Math.max(-lim, pan.y)),
    };
  });

  const aerialApproved = $derived.by(() => {
    if (!aerialItem) return false;
    const a = entry.aerial;
    return !!a && a.provider === aerialItem.provider && a.zoom === aerialItem.zoom;
  });

  const airportsWithAnyApproval = $derived(
    Object.values(reviewState).filter((e) => e.aerial !== null || (e.approved ?? []).length > 0).length,
  );
  const totalAerials = $derived(
    Object.values(reviewState).filter((e) => e.aerial !== null).length,
  );

  $effect(() => {
    const airport = current;
    if (!airport) return;
    untrack(() => resetAndLoad(airport));
  });

  function resetAndLoad(a: ReviewAirportEntry) {
    stage = 'gallery';
    providerIndex = 0;
    lightboxIndex = null;
    thumbCursor = 0;
    coords = null;
    coordsLoading = false;
    manualCoordInput = '';
    manualCoordError = '';
    editingCoords = false;
    coordEditInput = '';
    coordEditError = '';
    aerialZooms = { arcgis: DEFAULT_ZOOM, mapbox: DEFAULT_ZOOM, azure: DEFAULT_ZOOM };
    pan = { x: 0, y: 0 };
    extraWide = false;
    const existing = reviewState[a.iata]?.aerial;
    if (existing) {
      aerialZooms[existing.provider] = existing.zoom;
      const i = PROVIDERS.indexOf(existing.provider);
      if (i >= 0) providerIndex = i;
      // If the saved zoom is in the extra range, auto-expand the slider so
      // we can show the same framing on revisit.
      if (existing.zoom > BASE_ZOOM_LEVELS - 1) extraWide = true;
    }
    void loadPhotos(a);
    void loadCoords(a);
  }

  async function loadPhotos(a: ReviewAirportEntry) {
    loading = true;
    error = '';
    photos = [];
    try {
      const fetched = await fetchAirportCandidates(a);
      if (current?.iata !== a.iata) return;
      // Dedupe by Commons filename, not raw URL: the same file routinely shows
      // up from both endpoints with different `/thumb/<size>px-` prefixes,
      // which is why reviewers were seeing the same picture twice.
      const seen = new Set<string>();
      photos = fetched.filter((url) => {
        if (looksLikeStaleAerial(url)) return false;
        const key = commonsFileKey(url);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } catch (err) {
      error = (err as Error).message || 'Failed to fetch images';
    } finally {
      loading = false;
    }
  }

  async function loadCoords(a: ReviewAirportEntry) {
    // 1. Manual override saved by the reviewer (highest priority).
    const override = reviewState[a.iata]?.coords;
    if (override) {
      coords = { lat: override.lat, lon: override.lon };
      restorePanFromSpec(a);
      return;
    }
    // 2. Bundled `lon` from the review JSON.
    if (typeof a.lon === 'number') {
      coords = { lat: a.lat, lon: a.lon };
      restorePanFromSpec(a);
      return;
    }
    coordsLoading = true;
    try {
      // redirects=1 is critical: many `wikipedia` fields point at redirect
      // pages (e.g. "Paris Charles de Gaulle Airport" → "Charles de Gaulle
      // Airport") and prop=coordinates doesn't follow redirects by default.
      const url =
        `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1` +
        `&titles=${encodeURIComponent(a.wikipedia)}&prop=coordinates&colimit=1`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`coordinate lookup failed: ${res.status}`);
      const json = await res.json();
      const pages: Record<string, { coordinates?: { lat: number; lon: number }[] }> = json?.query?.pages ?? {};
      const page = Object.values(pages)[0];
      const c = page?.coordinates?.[0];
      if (current?.iata !== a.iata) return;
      coords = c ? { lat: c.lat, lon: c.lon } : null;
      if (coords) restorePanFromSpec(a);
    } catch {
      coords = null;
    } finally {
      if (current?.iata === a.iata) coordsLoading = false;
    }
  }

  function restorePanFromSpec(a: ReviewAirportEntry) {
    const spec = reviewState[a.iata]?.aerial;
    if (!spec || !coords) return;
    const ext = wideExtents(spec.provider, a.country, coords.lat);
    pan = {
      x: (spec.lon - coords.lon) / ext.dLon,
      y: (coords.lat - spec.lat) / ext.dLat,
    };
  }

  // Approximate lat/lon extent of the wide base image, given provider and
  // airport latitude. ArcGIS uses degree-square bboxes directly; tile providers
  // use Web Mercator, where lat-extent shrinks with cos(latitude).
  function wideExtents(provider: Provider, country: string, latitude: number) {
    if (provider === 'arcgis') {
      const span = arcgisSpan(widestZoom, country);
      return { dLat: span, dLon: span };
    }
    const z = tileZoom(widestZoom);
    const dLon = (360 * 1024) / (Math.pow(2, z) * 256);
    const dLat = dLon * Math.cos((latitude * Math.PI) / 180);
    return { dLat, dLon };
  }

  // --- URL builders. Tokens are NOT persisted; URLs are recomputed each render
  // from {provider, lat, lon, zoom} in `state`.
  function bboxFor(c: { lat: number; lon: number }, span: number) {
    // Square frame, matching the game's square aerial render.
    const half = span / 2;
    return {
      west: c.lon - half, south: c.lat - half,
      east: c.lon + half, north: c.lat + half,
    };
  }
  // Each slider unit halves linear extent. Closest (z=0) ≈ tile zoom 16 / span 0.008,
  // widest (z=3) ≈ tile zoom 13 / span 0.064. Tighter than before so the wide
  // base image actually frames the airport instead of the surrounding region.
  function arcgisSpan(zoom: number, country: string): number {
    const closest = country === 'United States' ? 0.006 : 0.008;
    const z = Math.min(MAX_ZOOM_LEVELS - 1, Math.max(0, zoom));
    return closest * Math.pow(2, z);
  }
  function tileZoom(zoom: number): number {
    const z = Math.min(MAX_ZOOM_LEVELS - 1, Math.max(0, zoom));
    return 16 - z;
  }
  function buildAerialUrl(provider: Provider, c: { lat: number; lon: number }, zoomIndex: number, country: string): string {
    if (provider === 'arcgis') {
      const bbox = bboxFor(c, arcgisSpan(zoomIndex, country));
      const endpoint = country === 'United States'
        ? 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage'
        : 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export';
      const params = new URLSearchParams({
        bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
        bboxSR: '4326', imageSR: '4326', size: '1024,1024',
        format: country === 'United States' ? 'jpgpng' : 'jpg', f: 'image',
      });
      return `${endpoint}?${params.toString()}`;
    }
    if (provider === 'mapbox') {
      // Mapbox accepts fractional zoom (2 decimals).
      const z = tileZoom(zoomIndex).toFixed(2);
      return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${c.lon},${c.lat},${z},0,0/1024x1024?access_token=${encodeURIComponent(MAPBOX_TOKEN)}`;
    }
    // azure: static API requires integer zoom - snap.
    const z = Math.round(tileZoom(zoomIndex));
    const params = new URLSearchParams({
      'api-version': '2024-04-01', tilesetId: 'microsoft.imagery',
      zoom: String(z), center: `${c.lon},${c.lat}`,
      width: '1024', height: '1024', 'subscription-key': AZURE_MAPS_KEY,
    });
    return `https://atlas.microsoft.com/map/static?${params.toString()}`;
  }

  function ensureEntry(id: string): ReviewEntry {
    if (!reviewState[id]) reviewState = { ...reviewState, [id]: { aerial: null, approved: [], rejected: [] } };
    return reviewState[id];
  }

  function setAerialZoom(value: number) {
    if (!aerialItem) return;
    const clamped = Math.min(zoomLevels - 1, Math.max(0, value));
    const v = Math.round(clamped * 100) / 100;
    aerialZooms = { ...aerialZooms, [aerialItem.provider]: v };
  }

  function setPanFromPointer(e: PointerEvent) {
    if (!aerialItem) return;
    const wrap = e.currentTarget as HTMLElement;
    const rect = wrap.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const fx = (e.clientX - rect.left) / rect.width - 0.5;
    const fy = (e.clientY - rect.top) / rect.height - 0.5;
    pan = { x: fx, y: fy };
  }
  function onAerialPointerDown(e: PointerEvent) {
    if (!aerialItem) return;
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setPanFromPointer(e);
    e.preventDefault();
  }
  function onAerialPointerMove(e: PointerEvent) {
    if (!dragging) return;
    setPanFromPointer(e);
  }
  function onAerialPointerUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  }
  function recenterPan() {
    pan = { x: 0, y: 0 };
  }

  function bumpZoom(delta: number) {
    if (!aerialItem) return;
    setAerialZoom(aerialItem.zoom + delta);
  }

  function cycleProvider(delta: number) {
    if (PROVIDERS.length === 0) return;
    providerIndex = (providerIndex + delta + PROVIDERS.length) % PROVIDERS.length;
    pan = { x: 0, y: 0 };
  }

  function submitAerial() {
    if (!aerialItem || !current || !coords) return;
    const id = current.iata;
    const e = ensureEntry(id);
    const ext = wideExtents(aerialItem.provider, current.country, coords.lat);
    const centerLat = coords.lat - panClamped.y * ext.dLat;
    const centerLon = coords.lon + panClamped.x * ext.dLon;
    reviewState = {
      ...reviewState,
      [id]: {
        ...e,
        aerial: {
          provider: aerialItem.provider,
          lat: centerLat,
          lon: centerLon,
          zoom: aerialItem.zoom,
        },
      },
    };
    persist();
    next();
  }

  function clearAerial() {
    if (!current) return;
    const id = current.iata;
    const e = ensureEntry(id);
    if (e.aerial) {
      reviewState = { ...reviewState, [id]: { ...e, aerial: null } };
      persist();
    }
  }

  let manualCoordInput = $state('');
  let manualCoordError = $state('');
  let editingCoords = $state(false);
  let coordEditInput = $state('');
  let coordEditError = $state('');

  // Accepts "lat, lon", "lat lon", or a Google Maps share URL containing
  // !3d{lat}!4d{lon} or @lat,lon - anything we can pull two finite numbers out of.
  function parseLatLon(raw: string): { lat: number; lon: number } | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const dms = trimmed.match(/-?\d+(?:\.\d+)?/g);
    if (!dms || dms.length < 2) return null;
    let lat = NaN;
    let lon = NaN;
    const at = trimmed.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    const dDb = trimmed.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (dDb) { lat = parseFloat(dDb[1]); lon = parseFloat(dDb[2]); }
    else if (at) { lat = parseFloat(at[1]); lon = parseFloat(at[2]); }
    else { lat = parseFloat(dms[0]); lon = parseFloat(dms[1]); }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
  }

  function saveManualCoords() {
    if (!current) return;
    const parsed = parseLatLon(manualCoordInput);
    if (!parsed) {
      manualCoordError = 'Could not parse - try "lat, lon" (e.g. 31.7226, 35.9933)';
      return;
    }
    manualCoordError = '';
    const id = current.iata;
    const e = ensureEntry(id);
    reviewState = { ...reviewState, [id]: { ...e, coords: parsed } };
    persist();
    coords = parsed;
    coordsLoading = false;
    manualCoordInput = '';
  }

  function openCoordEditor() {
    if (!coords) return;
    coordEditInput = `${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`;
    coordEditError = '';
    editingCoords = true;
  }
  function saveCoordEdit() {
    if (!current) return;
    const parsed = parseLatLon(coordEditInput);
    if (!parsed) {
      coordEditError = 'Could not parse - try "lat, lon" (e.g. 31.7226, 35.9933)';
      return;
    }
    const id = current.iata;
    const e = ensureEntry(id);
    reviewState = { ...reviewState, [id]: { ...e, coords: parsed } };
    persist();
    coords = parsed;
    pan = { x: 0, y: 0 };
    editingCoords = false;
    coordEditError = '';
  }
  function clearCoordOverride() {
    if (!current) return;
    const id = current.iata;
    const e = ensureEntry(id);
    if (!e.coords) { editingCoords = false; return; }
    const { coords: _drop, ...rest } = e;
    reviewState = { ...reviewState, [id]: rest as ReviewEntry };
    persist();
    editingCoords = false;
    // Re-resolve via the normal lookup path (bundled lon → Wikipedia).
    void loadCoords(current);
    pan = { x: 0, y: 0 };
  }

  function togglePhoto(url: string) {
    if (!current) return;
    const id = current.iata;
    const e = ensureEntry(id);
    const isOn = e.approved.includes(url);
    const nextApproved = isOn ? e.approved.filter((u) => u !== url) : [...e.approved, url];
    const nextRejected = e.rejected.filter((u) => u !== url);
    reviewState = { ...reviewState, [id]: { ...e, approved: nextApproved, rejected: nextRejected } };
    persist();
  }

  function openLightbox(i: number) { lightboxIndex = i; }
  function closeLightbox() { lightboxIndex = null; }
  function lightboxStep(delta: number) {
    if (lightboxIndex === null || photos.length === 0) return;
    lightboxIndex = (lightboxIndex + delta + photos.length) % photos.length;
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (lightboxIndex !== null) {
      switch (k) {
        case 'escape': closeLightbox(); e.preventDefault(); return;
        case 'arrowright': case 'd': case 'l':
          lightboxStep(1);
          if (lightboxIndex !== null) thumbCursor = lightboxIndex;
          e.preventDefault();
          return;
        case 'arrowleft': case 'a': case 'h':
          lightboxStep(-1);
          if (lightboxIndex !== null) thumbCursor = lightboxIndex;
          e.preventDefault();
          return;
        case ' ': case 'g': case 'y': case 'enter':
          if (photos[lightboxIndex]) togglePhoto(photos[lightboxIndex]);
          e.preventDefault();
          return;
      }
      return;
    }
    if (stage === 'aerial') {
      switch (k) {
        case 'g': case 'y': case ' ': case 'enter': submitAerial(); e.preventDefault(); break;
        case 'arrowright': cycleProvider(1); e.preventDefault(); break;
        case 'arrowleft': cycleProvider(-1); e.preventDefault(); break;
        case 'arrowdown': case 'j': next(); e.preventDefault(); break;
        case 'arrowup': case 'k': prev(); e.preventDefault(); break;
        case 'c': recenterPan(); e.preventDefault(); break;
        case '+': case '=': bumpZoom(-0.25); e.preventDefault(); break;
        case '-': case '_': bumpZoom(0.25); e.preventDefault(); break;
        case 'b': stage = 'gallery'; e.preventDefault(); break;
      }
    } else {
      // Gallery grid shortcuts.
      const cols = Math.max(1, gridCols);
      const last = photos.length - 1;
      const clamp = (n: number) => Math.min(last, Math.max(0, n));
      switch (k) {
        case 'arrowright': case 'l':
          if (photos.length) thumbCursor = clamp(thumbCursor + 1);
          e.preventDefault();
          break;
        case 'arrowleft': case 'h':
          if (photos.length) thumbCursor = clamp(thumbCursor - 1);
          e.preventDefault();
          break;
        case 'arrowdown':
          if (photos.length && thumbCursor + cols <= last) thumbCursor = clamp(thumbCursor + cols);
          else next();
          e.preventDefault();
          break;
        case 'arrowup':
          if (photos.length && thumbCursor - cols >= 0) thumbCursor = clamp(thumbCursor - cols);
          else prev();
          e.preventDefault();
          break;
        case 'j': next(); e.preventDefault(); break;
        case 'k': prev(); e.preventDefault(); break;
        case ' ': case 'g': case 'y':
          if (photos[thumbCursor]) togglePhoto(photos[thumbCursor]);
          e.preventDefault();
          break;
        case 'enter': case 'e':
          if (photos[thumbCursor]) openLightbox(thumbCursor);
          e.preventDefault();
          break;
        case 'a': if (coords) stage = 'aerial'; e.preventDefault(); break;
      }
    }
  }

  function next() { if (index < reviewAirportList.length - 1) index += 1; }
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
    link.download = 'airport-review.json';
    link.click();
    URL.revokeObjectURL(url);
  }
  async function shareToLuke() {
    sharing = true; shareError = ''; shareUrl = '';
    try {
      const json = JSON.stringify(buildExport(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const fd = new FormData();
      fd.append('file', blob, 'airport-review.json');
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
      const sanitized = sanitizeState(data);
      const merged = { ...reviewState, ...sanitized };
      reviewState = merged;
      persist();
      importText = '';
      showImport = false;
    } catch (e: any) {
      error = 'Invalid JSON: ' + (e?.message ?? '');
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<header class="head">
  <h1>Airport photo review</h1>
  <p>{airportsWithAnyApproval}/{reviewAirportList.length} airports reviewed · {totalAerials} aerials approved</p>
</header>

{#if current}
  <section class="reviewer">
    <div class="airline-head">
      <div>
        <h2>{current.name} ({current.iata})</h2>
        <span>{current.city} · {current.country}{regionOf(current.country) ? ` · ${regionLabel(regionOf(current.country)!)}` : ''} · {index + 1} / {reviewAirportList.length}</span>
      </div>
      <div class="nav">
        <button onclick={prev} disabled={index === 0}>← Prev airport</button>
        <button onclick={next} disabled={index >= reviewAirportList.length - 1}>Skip →</button>
      </div>
    </div>

    <select
      class="jump-to"
      value={current.iata}
      onchange={(e) => {
        const id = (e.currentTarget as HTMLSelectElement).value;
        const i = reviewAirportList.findIndex((a) => a.iata === id);
        if (i >= 0) index = i;
      }}
    >
      {#each reviewAirportList as a, i}
        {@const e = reviewState[a.iata]}
        {@const hasAerial = !!e?.aerial}
        {@const ac = e?.approved?.length ?? 0}
        <option value={a.iata}>
          {i + 1}. {a.name} ({a.iata}){hasAerial ? ' · aerial ✓' : ''}{ac > 0 ? ` · ${ac} selected` : ''}{!hasAerial && ac === 0 ? ' · untouched' : ''}
        </option>
      {/each}
    </select>

    {#if error}<p class="err">{error}</p>{/if}

    {#if stage === 'aerial'}
      {#if !aerialItem}
        {#if loading || coords === null}
          <p class="muted">Loading aerial…</p>
        {:else}
          <div class="empty">
            <p class="muted">No aerial available for {current.name}.</p>
            <button onclick={() => (stage = 'gallery')}>Skip to photos →</button>
          </div>
        {/if}
      {:else if aerialBaseUrl}
        <div class="stage" class:approved={aerialApproved}>
          {#key `${current.iata}:${aerialItem.provider}`}
            <div
              class="img-wrap aerial-wrap"
              class:dragging
              onpointerdown={onAerialPointerDown}
              onpointermove={onAerialPointerMove}
              onpointerup={onAerialPointerUp}
              onpointercancel={onAerialPointerUp}
              role="application"
              aria-label="Drag to position the game frame"
            >
              <img src={aerialBaseUrl} alt={`${current.name} aerial`} draggable="false" />
              <div
                class="zoom-box"
                style="left: {((0.5 + panClamped.x) * 100).toFixed(2)}%; top: {((0.5 + panClamped.y) * 100).toFixed(2)}%; height: {(boxFraction * 100).toFixed(2)}%;"
                aria-hidden="true"
              ></div>
            </div>
          {/key}
          <p class="counter">
            Aerial · {aerialItem.provider} · frame {(boxFraction * 100).toFixed(0)}% of wide
            · provider {providerIndex + 1} / {PROVIDERS.length}
            {#if aerialApproved}· <span class="status-good">submitted ✓</span>{/if}
          </p>

          <div class="zoom-control">
            <span>Closer</span>
            <input
              type="range"
              min="0"
              max={zoomLevels - 1}
              step="0.05"
              value={aerialItem.zoom}
              aria-label="Aerial zoom"
              oninput={(e) => setAerialZoom(Number((e.currentTarget as HTMLInputElement).value))}
            />
            <span>Wider</span>
            <button class="recenter" onclick={recenterPan} disabled={pan.x === 0 && pan.y === 0}>Recenter</button>
          </div>
          <div class="zoom-extras">
            <button
              class="ghost-btn"
              onclick={() => {
                extraWide = !extraWide;
                if (!extraWide && aerialItem && aerialItem.zoom > BASE_ZOOM_LEVELS - 1) {
                  setAerialZoom(BASE_ZOOM_LEVELS - 1);
                }
              }}
              aria-pressed={extraWide}
            >
              {extraWide ? '↩ Reset zoom range' : '⤢ Zoom out further'}
            </button>
            <button class="ghost-btn" onclick={openCoordEditor}>✎ Edit coords</button>
          </div>
          {#if editingCoords}
            <div class="manual-coords">
              <p class="muted aerial-hint">
                Editing coordinates for {current.name}.
                {#if reviewState[current.iata]?.coords}<span class="status-good">manual override active</span>{/if}
              </p>
              <div class="manual-coords-row">
                <input
                  type="text"
                  bind:value={coordEditInput}
                  placeholder="lat, lon"
                  onkeydown={(e) => { if (e.key === 'Enter') { saveCoordEdit(); e.preventDefault(); } }}
                />
                <button class="ok" onclick={saveCoordEdit} disabled={!coordEditInput.trim()}>Save</button>
                <button class="ghost-btn" onclick={() => (editingCoords = false)}>Cancel</button>
              </div>
              {#if reviewState[current.iata]?.coords}
                <button class="ghost-btn clear-override" onclick={clearCoordOverride}>Clear override (revert to default)</button>
              {/if}
              {#if coordEditError}<p class="err">{coordEditError}</p>{/if}
            </div>
          {/if}

          <div class="primary-actions single">
            <button class="ok" onclick={submitAerial}>
              {aerialApproved ? 'Re-submit aerial & next airport →' : 'Submit aerial & next airport →'}
            </button>
          </div>

          <div class="cycle">
            <button onclick={() => cycleProvider(-1)} disabled={PROVIDERS.length < 2}>← other provider</button>
            <button onclick={() => (stage = 'gallery')}>← back to photos</button>
            <button onclick={() => cycleProvider(1)} disabled={PROVIDERS.length < 2}>other provider →</button>
          </div>
          {#if aerialApproved}
            <div class="cycle">
              <button onclick={clearAerial}>clear approval</button>
            </div>
          {/if}
          <p class="shortcuts">Shortcuts: <kbd>G</kbd>/<kbd>Space</kbd> submit · <kbd>←</kbd>/<kbd>→</kbd> provider · <kbd>↑</kbd>/<kbd>↓</kbd> airport · <kbd>+</kbd>/<kbd>−</kbd> zoom · <kbd>C</kbd> recenter · <kbd>B</kbd> back to photos</p>
        </div>
      {/if}
    {:else}
      <div class="stage gallery-stage">
        <div class="gallery-head">
          <p class="counter">
            Photos · {entry.approved.length} selected / {photos.length}
          </p>
        </div>
        {#if loading && photos.length === 0}
          <p class="muted">Loading photos…</p>
        {:else if photos.length === 0}
          <p class="muted">No photos found for {current.name}.</p>
        {:else}
          <div class="thumbs" bind:clientWidth={thumbsGridWidth}>
            {#each photos as url, i (url)}
              {@const selected = entry.approved.includes(url)}
              <div class="thumb" class:selected class:cursor={i === thumbCursor}>
                <button
                  class="thumb-tap"
                  onclick={() => { thumbCursor = i; togglePhoto(url); }}
                  aria-pressed={selected}
                  aria-label={selected ? 'Deselect photo' : 'Select photo'}
                >
                  <img src={url} alt={`${current.name} candidate ${i + 1}`} loading="lazy" />
                  {#if selected}<span class="tick" aria-hidden="true">✓</span>{/if}
                </button>
                <button class="enlarge" onclick={() => { thumbCursor = i; openLightbox(i); }} aria-label="Enlarge photo">⤢</button>
              </div>
            {/each}
          </div>
        {/if}
        <p class="shortcuts">Shortcuts: <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Space</kbd> toggle · <kbd>Enter</kbd>/<kbd>E</kbd> enlarge · <kbd>J</kbd>/<kbd>K</kbd> next/prev airport · <kbd>A</kbd> continue to aerial · in lightbox: <kbd>←</kbd>/<kbd>→</kbd> step · <kbd>Space</kbd>/<kbd>Enter</kbd> toggle · <kbd>Esc</kbd> close</p>
        {#if !coords && !coordsLoading}
          <div class="manual-coords">
            <p class="muted aerial-hint">No coordinates found for {current.name}. Paste lat/lon (or a Google Maps URL) to enable the aerial step:</p>
            <div class="manual-coords-row">
              <input
                type="text"
                bind:value={manualCoordInput}
                placeholder="e.g. 31.7226, 35.9933"
                onkeydown={(e) => { if (e.key === 'Enter') { saveManualCoords(); e.preventDefault(); } }}
              />
              <button class="ok" onclick={saveManualCoords} disabled={!manualCoordInput.trim()}>Save coords</button>
            </div>
            {#if manualCoordError}<p class="err">{manualCoordError}</p>{/if}
          </div>
        {/if}
        <div class="primary-actions">
          <button class="reject" onclick={next} disabled={index >= reviewAirportList.length - 1}>
            {coords ? 'Skip aerial · next airport →' : 'Save & next airport →'}
          </button>
          <button class="ok" onclick={() => (stage = 'aerial')} disabled={!coords}>
            {coordsLoading ? 'Loading coords…' : coords ? 'Continue to aerial →' : 'No aerial available'}
          </button>
        </div>
      </div>
    {/if}
  </section>
{/if}

{#if stage === 'gallery' && aerialBaseUrl}
  <img src={aerialBaseUrl} alt="" aria-hidden="true" class="preload" />
{/if}

{#if lightboxIndex !== null && photos[lightboxIndex]}
  {@const lbUrl = photos[lightboxIndex]}
  {@const lbSelected = entry.approved.includes(lbUrl)}
  <div
    class="lightbox"
    role="dialog"
    aria-modal="true"
    aria-label="Photo preview"
    tabindex="-1"
    onclick={closeLightbox}
    onkeydown={(e) => { if (e.key === 'Escape') closeLightbox(); }}
  >
    <div class="lightbox-inner" role="presentation" onclick={(e) => e.stopPropagation()}>
      <img src={lbUrl} alt={`${current?.name ?? ''} preview`} />
      <div class="lightbox-bar">
        <button onclick={() => lightboxStep(-1)} disabled={photos.length < 2} title="←">← prev</button>
        <span class="muted">{lightboxIndex + 1} / {photos.length}</span>
        <button onclick={() => lightboxStep(1)} disabled={photos.length < 2} title="→">next →</button>
        <button class="ok" class:on={lbSelected} onclick={() => togglePhoto(lbUrl)} title="Space">
          {lbSelected ? '✓ Selected' : 'Select'}
        </button>
        <button onclick={closeLightbox} title="Esc">Close</button>
      </div>
      <p class="shortcuts lightbox-shortcuts"><kbd>←</kbd>/<kbd>→</kbd> step · <kbd>Space</kbd> toggle · <kbd>Esc</kbd> close</p>
    </div>
  </div>
{/if}

<section class="export">
  <div class="export-actions">
    <button onclick={exportData}>Copy JSON</button>
    <button onclick={downloadJson}>Download airport-review.json</button>
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
    <textarea bind:value={importText} rows="6" placeholder="Paste airport-review.json here to merge…"></textarea>
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
  .status-good { color: var(--good); font-weight: 600; }
  .img-wrap {
    display: block;
    background: #fff;
    border-radius: 6px;
    overflow: hidden;
    aspect-ratio: 4 / 3;
    max-height: 460px;
  }
  .img-wrap img { width: 100%; height: 100%; object-fit: contain; }
  .aerial-wrap {
    position: relative;
    aspect-ratio: 1 / 1;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .aerial-wrap.dragging { cursor: grabbing; }
  .aerial-wrap img { pointer-events: none; }
  .zoom-box {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    aspect-ratio: 1 / 1;
    border: 2px solid var(--accent);
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
    pointer-events: none;
    transition: height 80ms linear;
  }
  .counter { color: var(--muted); font-size: 0.75rem; text-align: center; }
  .primary-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .primary-actions.single { grid-template-columns: 1fr; }
  @media (max-width: 520px) { .primary-actions { grid-template-columns: 1fr; } }
  .primary-actions button {
    min-height: 50px;
    border-radius: 6px;
    font-size: 0.9375rem;
    font-weight: 500;
    border: 1px solid var(--border);
  }
  .primary-actions .ok { background: var(--accent); color: var(--bg); border-color: var(--accent); }
  .primary-actions .reject { background: var(--surface-2); color: var(--text); }
  .primary-actions .reject:hover {
    background: rgba(239, 68, 68, 0.12);
    border-color: rgba(239, 68, 68, 0.55);
    color: var(--bad);
  }
  .gallery-stage { gap: 0.75rem; }
  .gallery-head { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .ghost-btn {
    background: transparent;
    color: var(--muted);
    border: 1px dashed var(--border);
    border-radius: 6px;
    padding: 0.35rem 0.65rem;
    font-size: 0.75rem;
  }
  .thumbs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.5rem;
  }
  .thumb {
    position: relative;
    aspect-ratio: 1 / 1;
    border-radius: 6px;
    overflow: hidden;
    background: var(--surface-2);
    border: 2px solid transparent;
    transition: border-color 80ms linear;
  }
  .thumb.selected { border-color: var(--good); }
  .thumb.cursor { box-shadow: 0 0 0 2px var(--accent); }
  .thumb-tap {
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: #fff;
    cursor: pointer;
  }
  .thumb-tap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .thumb .tick {
    position: absolute;
    top: 0.3rem;
    left: 0.3rem;
    background: var(--good);
    color: var(--bg);
    width: 1.4rem; height: 1.4rem;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700;
    font-size: 0.85rem;
    pointer-events: none;
  }
  .thumb .enlarge {
    position: absolute;
    top: 0.3rem;
    right: 0.3rem;
    background: rgba(0,0,0,0.55);
    color: #fff;
    border: 0;
    border-radius: 4px;
    width: 1.6rem; height: 1.6rem;
    font-size: 0.9rem;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .aerial-hint { font-size: 0.75rem; text-align: center; }
  .manual-coords {
    display: flex; flex-direction: column; gap: 0.4rem;
    padding: 0.5rem 0.6rem;
    background: var(--surface-2);
    border: 1px dashed var(--border);
    border-radius: 6px;
  }
  .manual-coords-row { display: flex; gap: 0.4rem; }
  .manual-coords-row input {
    flex: 1;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    font-family: inherit;
    font-size: 0.8125rem;
  }
  .manual-coords-row input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .manual-coords-row button {
    padding: 0.4rem 0.85rem;
    border-radius: 6px;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--bg);
    font-size: 0.8125rem;
    font-weight: 500;
  }
  .manual-coords-row button:disabled { opacity: 0.45; }
  .preload {
    position: absolute;
    width: 1px; height: 1px;
    opacity: 0;
    pointer-events: none;
    left: -9999px; top: -9999px;
  }
  .lightbox {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.85);
    display: flex; align-items: center; justify-content: center;
    z-index: 100;
    padding: 1rem;
  }
  .lightbox-inner {
    display: flex; flex-direction: column; gap: 0.5rem;
    max-width: 95vw; max-height: 95vh;
  }
  .lightbox-inner img {
    max-width: 95vw;
    max-height: 80vh;
    object-fit: contain;
    background: #fff;
    border-radius: 6px;
  }
  .lightbox-bar {
    display: flex; gap: 0.5rem; justify-content: center; align-items: center; flex-wrap: wrap;
  }
  .lightbox-bar button {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.5rem 0.85rem;
    border-radius: 6px;
    font-size: 0.8125rem;
  }
  .lightbox-bar button.ok { background: var(--accent); color: var(--bg); border-color: var(--accent); }
  .lightbox-bar button.ok.on { background: var(--good); border-color: var(--good); color: var(--bg); }
  .lightbox-shortcuts { color: rgba(255,255,255,0.7); margin-top: 0.1rem; }
  .lightbox-shortcuts kbd { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.25); color: #fff; }
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
  .zoom-control {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.625rem;
    color: var(--muted);
    font-size: 0.75rem;
    padding: 0.2rem 0.1rem;
  }
  .zoom-control input { width: 100%; accent-color: var(--accent); }
  .zoom-control {
    grid-template-columns: auto minmax(0, 1fr) auto auto;
  }
  .recenter {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.3rem 0.6rem;
    border-radius: 6px;
    font-size: 0.7rem;
  }
  .recenter:disabled { opacity: 0.35; }
  .zoom-extras { display: flex; justify-content: center; gap: 0.4rem; flex-wrap: wrap; }
  .zoom-extras .ghost-btn { font-size: 0.7rem; }
  .clear-override { align-self: flex-start; font-size: 0.7rem; }
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
