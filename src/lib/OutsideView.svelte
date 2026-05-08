<script lang="ts">
  // Out-the-window strip rendered next to the PFD at decision altitude.
  // Stylised cockpit view of a runway environment in fog. The fog density
  // mirrors RVR; the visible reference is whatever the question fixes.
  import type { VisualReference, OutsideAmbiguity } from './intercept-minimums';

  interface Props {
    reference: VisualReference;
    ambiguity?: OutsideAmbiguity;
    rvrM: number;
  }

  let { reference, ambiguity = 'clear', rvrM }: Props = $props();

  const fogAlpha = $derived(Math.max(0.3, Math.min(0.95, 1 - rvrM / 1500)) + (ambiguity === 'maybe' ? 0.08 : 0));

  const showApproachLights = $derived(reference === 'approachLights' || reference === 'approachLightsRedBars');
  const showRedBars = $derived(reference === 'approachLightsRedBars');
  const showTdz = $derived(reference === 'tdz' || reference === 'threshold');
  const showRunwayLights = $derived(reference === 'runwayLights' || reference === 'threshold');
  const showThreshold = $derived(reference === 'threshold' || reference === 'tdz');
  // The runway pavement + centerline are only visible if the pilot has any
  // runway-surface reference. With approach lights only, the runway itself
  // is still in the fog and shouldn't show through.
  const showRunwaySurface = $derived(showTdz || showRunwayLights || showThreshold);
  const isAmbiguous = $derived(ambiguity === 'maybe');
</script>

<div class="outside" aria-label="Outside view at minimums" class:ambiguous={isAmbiguous}>
  <svg viewBox="0 0 200 90" preserveAspectRatio="none">
    <defs>
      <linearGradient id="ov-sky" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#1a2331" />
        <stop offset="0.6" stop-color="#33414f" />
        <stop offset="1" stop-color="#3d4a55" />
      </linearGradient>
      <linearGradient id="ov-ground" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#2a2f33" />
        <stop offset="1" stop-color="#161a1d" />
      </linearGradient>
      <radialGradient id="ov-haze" cx="0.5" cy="0.55" r="0.7">
        <stop offset="0" stop-color="#9aa6b3" stop-opacity="0" />
        <stop offset="1" stop-color="#9aa6b3" stop-opacity="0.45" />
      </radialGradient>
    </defs>

    <!-- Sky -->
    <rect x="0" y="0" width="200" height="55" fill="url(#ov-sky)" />
    <!-- Ground -->
    <rect x="0" y="55" width="200" height="35" fill="url(#ov-ground)" />
    <!-- Horizon line -->
    <line x1="0" y1="55" x2="200" y2="55" stroke="#5a6773" stroke-width="0.5" opacity="0.6" />

    {#if showRunwaySurface}
      <!-- Runway perspective trapezoid. Threshold (far edge) just below the
           horizon; near edge fills most of the lower frame so the view reads
           as "close to touchdown" rather than a distant strip. -->
      <polygon points="86,58 114,58 160,90 40,90" fill="#1a1d20" stroke="#2c3239" stroke-width="0.4" />
      <!-- Centerline dashes receding to vanishing point -->
      <line x1="100" y1="60" x2="100" y2="63" stroke="#bcc4cd" stroke-width="0.4" opacity="0.7" />
      <line x1="100" y1="66" x2="100" y2="71" stroke="#bcc4cd" stroke-width="0.6" opacity="0.8" />
      <line x1="100" y1="74" x2="100" y2="80" stroke="#cfd6df" stroke-width="0.9" opacity="0.9" />
      <line x1="100" y1="83" x2="100" y2="90" stroke="#dfe6ee" stroke-width="1.2" opacity="0.95" />
    {/if}

    <!-- Approach light system (centerline lights stepping in toward the threshold +
         five sequenced cross-bars; rough MALSR / ALSF stylisation). -->
    {#if showApproachLights}
      <!-- Approach lights are sequenced strobes designed to pierce fog —
           bumped radius and opacity so they read as the dominant feature
           when nothing else is visible. The non-uniform viewBox stretch
           also squashes circles vertically, so the radii are intentionally
           generous to compensate. -->
      <!-- Centerline lights: column converging to vanishing point -->
      {#each [{ y: 28, w: 0.9 }, { y: 34, w: 1.1 }, { y: 40, w: 1.3 }, { y: 46, w: 1.6 }, { y: 52, w: 1.9 }, { y: 56, w: 2.2 }] as p, i}
        <circle cx="100" cy={p.y} r={p.w} fill="#fffbe0" opacity={0.85 + i * 0.025} />
      {/each}
      <!-- Cross-bars (chevron-like) growing wider as they near the threshold -->
      {#each [{ y: 30, half: 2.5 }, { y: 36, half: 3.5 }, { y: 42, half: 4.5 }, { y: 48, half: 6 }, { y: 54, half: 7.5 }] as bar, i}
        {#each [-bar.half, -bar.half * 0.5, bar.half * 0.5, bar.half] as dx}
          <circle cx={100 + dx} cy={bar.y} r={0.8 + i * 0.12} fill="#fffbe0" opacity={0.85 + i * 0.025} />
        {/each}
      {/each}
    {/if}
    {#if showRedBars}
      <!-- Red side-row terminating bars just outside the threshold -->
      {#each [56] as y}
        <rect x="80" y={y} width="3.5" height="1.4" fill="#ff4444" />
        <rect x="84.5" y={y} width="2.5" height="1.4" fill="#ff4444" />
        <rect x="113" y={y} width="2.5" height="1.4" fill="#ff4444" />
        <rect x="116.5" y={y} width="3.5" height="1.4" fill="#ff4444" />
      {/each}
    {/if}

    <!-- Runway threshold "piano keys" sit on the far edge (y=58, x=86..114). -->
    {#if showThreshold}
      {#each [87, 90, 93, 96, 99, 102, 105, 108, 111] as x}
        <rect x={x} y="57" width="1.8" height="1.6" fill="#e8eef5" />
      {/each}
      <!-- Threshold lights (green) along the far edge -->
      {#each [86, 92, 100, 108, 114] as x}
        <circle cx={x} cy="58" r="0.55" fill="#5dd95b" opacity="0.95" />
      {/each}
    {/if}

    <!-- Touchdown zone markings: three pairs of stripes per side (FAA pattern).
         Y-values and widths grow as they approach the camera so they sit
         inside the new perspective trapezoid. -->
    {#if showTdz}
      {#each [{ y: 64, w: 4.5, off: 3 }, { y: 72, w: 7, off: 5 }, { y: 82, w: 11, off: 8 }] as p}
        <rect x={100 - p.off - p.w} y={p.y} width={p.w} height="1.1" fill="#e8eef5" />
        <rect x={100 - p.off - p.w} y={p.y + 1.8} width={p.w} height="1.1" fill="#e8eef5" />
        <rect x={100 - p.off - p.w} y={p.y + 3.6} width={p.w} height="1.1" fill="#e8eef5" />
        <rect x={100 + p.off} y={p.y} width={p.w} height="1.1" fill="#e8eef5" />
        <rect x={100 + p.off} y={p.y + 1.8} width={p.w} height="1.1" fill="#e8eef5" />
        <rect x={100 + p.off} y={p.y + 3.6} width={p.w} height="1.1" fill="#e8eef5" />
      {/each}
    {/if}

    <!-- Runway edge lights — paired columns following the trapezoid edges. -->
    {#if showRunwayLights}
      {#each [{ y: 60, sx: 88, ex: 112 }, { y: 66, sx: 81, ex: 119 }, { y: 74, sx: 70, ex: 130 }, { y: 84, sx: 53, ex: 147 }] as row}
        <circle cx={row.sx} cy={row.y} r="0.7" fill="#fff5cc" opacity="0.9" />
        <circle cx={row.ex} cy={row.y} r="0.7" fill="#fff5cc" opacity="0.9" />
      {/each}
    {/if}

    <!-- Atmospheric haze on top of features (lighter centre, denser edges) -->
    <rect width="200" height="90" fill="url(#ov-haze)" />
    <!-- Fog overlay last so it dims everything -->
    <rect width="200" height="90" fill="#9aa6b3" opacity={fogAlpha} />
  </svg>
  <div class="legend">
    <span class="rvr">RVR ~{Math.round(rvrM)} m</span>
  </div>
</div>

<style>
  .outside {
    display: flex; flex-direction: column; gap: 0.3rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.4rem;
    background: var(--surface-2);
  }
  .outside svg {
    width: 100%;
    height: 110px;
    display: block;
    border-radius: 4px;
    background: #2a313a;
  }
  .legend { display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--muted); font-family: var(--font-main); }
  .ambiguous svg { filter: blur(0.4px); }
</style>
