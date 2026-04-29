<script lang="ts">
  import { RadarScope, AircraftBlip, Waypoint as WaypointMarker, WindTag } from 'radarscope/svelte';
  import type { Scenario } from 'radarscope';

  export type SceneKey =
    | 'cleared-bearing'
    | 'cleared-clock'
    | 'cleared-wind'
    | 'radar-traffic'
    | 'intercept-localizer'
    | 'intercept-glideslope-side';

  interface Props {
    scene: SceneKey;
    caption?: string;
  }

  let { scene, caption }: Props = $props();

  const SCENARIOS: Record<Exclude<SceneKey, 'intercept-glideslope-side'>, { scenario: Scenario; rings?: number[]; targetId?: string; note?: string }> = {
    'cleared-bearing': {
      rings: [10, 20],
      targetId: 'wp-target',
      note: 'Your plane is in the centre. Fly toward the highlighted fix.',
      scenario: {
        rangeNm: 25,
        aircraft: [{ id: 'me', callsign: 'YOU', pos: { x: 0, y: 0 }, heading: 360, altitude: 12000, speed: 280 }],
        waypoints: [
          { id: 'wp-target', label: 'BOSOX', pos: { x: 12, y: -10 } },
          { id: 'd1', label: '·', pos: { x: -14, y: 4 } },
          { id: 'd2', label: '·', pos: { x: -8, y: -16 } },
          { id: 'd3', label: '·', pos: { x: 6, y: 14 } },
        ],
      },
    },
    'cleared-clock': {
      rings: [10, 20],
      note: 'Same scope, four reference fixes. North = 360, east = 090, south = 180, west = 270.',
      scenario: {
        rangeNm: 25,
        aircraft: [{ id: 'me', callsign: 'YOU', pos: { x: 0, y: 0 }, heading: 360, altitude: 10000, speed: 250 }],
        waypoints: [
          { id: 'n', label: '360°', pos: { x: 0, y: -18 } },
          { id: 'e', label: '090°', pos: { x: 18, y: 0 } },
          { id: 's', label: '180°', pos: { x: 0, y: 18 } },
          { id: 'w', label: '270°', pos: { x: -18, y: 0 } },
        ],
      },
    },
    'cleared-wind': {
      rings: [10, 20],
      targetId: 'wp-target',
      note: 'Wind is FROM the west. To track straight to the fix you must crab slightly INTO the wind (point a few degrees left of the bearing).',
      scenario: {
        rangeNm: 25,
        wind: { from: 270, kt: 30 },
        aircraft: [{ id: 'me', callsign: 'YOU', pos: { x: 0, y: 0 }, heading: 360, altitude: 14000, speed: 300 }],
        waypoints: [
          { id: 'wp-target', label: 'KELOR', pos: { x: 0, y: -16 } },
        ],
      },
    },
    'radar-traffic': {
      rings: [10, 20],
      note: 'Two aircraft converging. As ATC you must spot conflicts and re-vector one of them BEFORE they get close.',
      scenario: {
        rangeNm: 30,
        aircraft: [
          { id: 'a1', callsign: 'AAL123', pos: { x: -16, y: 0 }, heading: 90, altitude: 11000, speed: 280 },
          { id: 'a2', callsign: 'DAL456', pos: { x: 0, y: 16 }, heading: 360, altitude: 11000, speed: 280 },
        ],
      },
    },
    'intercept-localizer': {
      rings: [5, 10],
      note: 'Runway 27 with the dashed extended-centerline. Your aircraft is intercepting from the side at a 30° angle - the standard intercept geometry.',
      scenario: {
        rangeNm: 12,
        runways: [
          { threshold: { x: 4, y: 0 }, heading: 270, lengthNm: 0.6, showFinal: true },
        ],
        aircraft: [
          { id: 'me', callsign: 'YOU', pos: { x: -2, y: -3 }, heading: 240, altitude: 3000, speed: 180 },
        ],
      },
    },
  };
</script>

{#if scene === 'intercept-glideslope-side'}
  <div class="side-view">
    <svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
      <!-- ground -->
      <line x1="20" y1="180" x2="380" y2="180" stroke="#506070" stroke-width="2" />
      <!-- runway -->
      <rect x="320" y="178" width="60" height="4" fill="#a0c0d0" />
      <text x="350" y="195" fill="#a0c0d0" font-size="10" text-anchor="middle">RUNWAY</text>
      <!-- glideslope (3°, ideal) -->
      <line x1="320" y1="180" x2="40" y2="40" stroke="#5db15d" stroke-width="2" stroke-dasharray="4 3" />
      <text x="180" y="100" fill="#5db15d" font-size="10">3° glideslope (correct)</text>
      <!-- high path -->
      <line x1="320" y1="180" x2="40" y2="20" stroke="#d97a55" stroke-width="1.5" stroke-dasharray="2 2" />
      <text x="60" y="35" fill="#d97a55" font-size="9">too HIGH</text>
      <!-- low path -->
      <line x1="320" y1="180" x2="60" y2="135" stroke="#d97a55" stroke-width="1.5" stroke-dasharray="2 2" />
      <text x="100" y="148" fill="#d97a55" font-size="9">too LOW (dangerous)</text>
      <!-- aircraft on correct path -->
      <g transform="translate(180, 110)">
        <polygon points="0,-6 -8,6 8,6" fill="#a3cef1" />
        <text x="0" y="20" fill="#a3cef1" font-size="9" text-anchor="middle">YOU</text>
      </g>
    </svg>
    {#if caption}<div class="cap">{caption}</div>{/if}
    <div class="note">Side view: a 3° glideslope is the standard descent angle. Above it = "high" (would have to dive), below it = "low" (dangerously close to the ground early).</div>
  </div>
{:else}
  {@const cfg = SCENARIOS[scene]}
  <div class="demo">
    <div class="scope-frame">
      <RadarScope scenario={cfg.scenario} rangeRings={cfg.rings} zoomable={false}>
        {#snippet children()}
          {#each cfg.scenario.waypoints ?? [] as wp}
            <WaypointMarker
              waypoint={wp}
              selected={cfg.targetId !== undefined && wp.id === cfg.targetId}
            />
          {/each}
          {#each cfg.scenario.aircraft as ac}
            <AircraftBlip aircraft={ac} />
          {/each}
          {#if cfg.scenario.wind}
            <WindTag wind={cfg.scenario.wind} pos={{ x: 0, y: 0 }} />
          {/if}
        {/snippet}
      </RadarScope>
    </div>
    {#if caption}<div class="cap">{caption}</div>{/if}
    {#if cfg.note}<div class="note">{cfg.note}</div>{/if}
  </div>
{/if}

<style>
  .demo, .side-view {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }
  .scope-frame {
    width: 100%;
    max-width: 520px;
    aspect-ratio: 1 / 1;
    margin: 0 auto;
    background: #06090c;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.4rem;
    box-sizing: border-box;
  }
  .scope-frame :global(svg) { display: block; width: 100%; height: 100%; }
  .side-view svg {
    width: 100%;
    max-width: 520px;
    margin: 0 auto;
    background: #06090c;
    border: 1px solid var(--border);
    border-radius: 6px;
    aspect-ratio: 2 / 1;
  }
  .cap {
    font-size: 0.75rem;
    color: var(--muted);
    text-align: center;
  }
  .note {
    font-size: 0.78rem;
    color: var(--text);
    background: var(--surface-2);
    border-left: 3px solid var(--accent);
    padding: 0.55rem 0.65rem;
    border-radius: 4px;
    line-height: 1.45;
  }
</style>
