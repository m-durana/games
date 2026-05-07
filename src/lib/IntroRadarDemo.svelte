<script lang="ts">
  import { RadarScope, AircraftBlip, Waypoint as WaypointMarker, WindTag } from 'radarscope/svelte';
  import type { Scenario } from 'radarscope';

  export type SceneKey =
    | 'cleared-bearing'
    | 'cleared-clock'
    | 'cleared-wind'
    | 'radar-traffic'
    | 'radar-conflict-altitudes'
    | 'radar-direct-clear'
    | 'radar-direct-blocked'
    | 'radar-vector-final'
    | 'radar-vector-deflected'
    | 'radar-wake-pair'
    | 'radar-sequence-fan'
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
    'radar-conflict-altitudes': {
      rings: [10, 20],
      note: 'Both at FL110, vectors crossing in the centre. Three other aircraft are SAFE: KLM (FL230, 12,000 ft above), UAL (FL060, 5,000 ft below), AFR (heading away, no closure).',
      scenario: {
        rangeNm: 30,
        aircraft: [
          { id: 'c1', callsign: 'AAL123 110', pos: { x: -14, y: 2 }, heading: 90, altitude: 11000, speed: 280 },
          { id: 'c2', callsign: 'DAL456 110', pos: { x: 2, y: 14 }, heading: 360, altitude: 11000, speed: 280 },
          { id: 'c3', callsign: 'KLM77 230', pos: { x: 10, y: -10 }, heading: 270, altitude: 23000, speed: 320 },
          { id: 'c4', callsign: 'UAL12 060', pos: { x: -10, y: -14 }, heading: 45, altitude: 6000, speed: 240 },
          { id: 'c5', callsign: 'AFR9 180', pos: { x: 14, y: 6 }, heading: 70, altitude: 18000, speed: 300 },
        ],
      },
    },
    'radar-direct-clear': {
      rings: [10, 20],
      targetId: 'wp-dest',
      note: 'BAW42 requests direct KELOR. The proposed track (toward the highlighted fix) is clear of other traffic - APPROVE.',
      scenario: {
        rangeNm: 30,
        aircraft: [
          { id: 'r1', callsign: 'BAW42', pos: { x: -10, y: 12 }, heading: 30, altitude: 24000, speed: 380 },
          { id: 'r2', callsign: 'DLH9 350', pos: { x: 14, y: -14 }, heading: 270, altitude: 35000, speed: 420 },
        ],
        waypoints: [
          { id: 'wp-dest', label: 'KELOR', pos: { x: 6, y: -10 } },
        ],
      },
    },
    'radar-direct-blocked': {
      rings: [10, 20],
      targetId: 'wp-dest',
      note: 'BAW42 requests direct ABABO. The track would cross IBE7 at the same FL on a head-on heading - DENY.',
      scenario: {
        rangeNm: 30,
        aircraft: [
          { id: 'r1', callsign: 'BAW42 240', pos: { x: -14, y: 8 }, heading: 60, altitude: 24000, speed: 380 },
          { id: 'r2', callsign: 'IBE7 240', pos: { x: 12, y: -8 }, heading: 240, altitude: 24000, speed: 380 },
        ],
        waypoints: [
          { id: 'wp-dest', label: 'ABABO', pos: { x: 10, y: -6 } },
        ],
      },
    },
    'radar-vector-final': {
      rings: [5, 10, 15],
      note: 'Two aircraft on final to runway 27. SWR321 leads at 5 nm. KLM77 trails at 7 nm but 30 kt faster - the gap is closing toward less than 3 nm at the threshold.',
      scenario: {
        rangeNm: 18,
        runways: [
          { threshold: { x: 3, y: 0 }, heading: 270, lengthNm: 0.6, showFinal: true },
        ],
        aircraft: [
          { id: 'l', callsign: 'SWR321 leader', pos: { x: -2, y: 0 }, heading: 270, altitude: 2500, speed: 160 },
          { id: 't', callsign: 'KLM77 trailer', pos: { x: -4, y: 0 }, heading: 270, altitude: 3500, speed: 190 },
        ],
      },
    },
    'radar-vector-deflected': {
      rings: [5, 10, 15],
      note: 'Same scenario, but ATC turned the trailer 30° right for ~3 minutes. The longer ground track buys spacing - by the time it turns back onto final, the gap is legal.',
      scenario: {
        rangeNm: 18,
        runways: [
          { threshold: { x: 3, y: 0 }, heading: 270, lengthNm: 0.6, showFinal: true },
        ],
        aircraft: [
          { id: 'l', callsign: 'SWR321 leader', pos: { x: -2, y: 0 }, heading: 270, altitude: 2500, speed: 160 },
          { id: 't', callsign: 'KLM77 vectored', pos: { x: -4, y: 0 }, heading: 300, altitude: 3500, speed: 190 },
        ],
      },
    },
    'radar-wake-pair': {
      rings: [5, 10],
      note: 'B777 (Heavy) ahead of A320 (Medium) on final to runway 09. Required wake spacing for Heavy → Medium: 5 nm. Currently 4 nm - SHORT. Slow the trailer or vector for more spacing.',
      scenario: {
        rangeNm: 14,
        runways: [
          { threshold: { x: -3, y: 0 }, heading: 90, lengthNm: 0.6, showFinal: true },
        ],
        aircraft: [
          { id: 'lead', callsign: 'AAL12 H 777', pos: { x: 1, y: 0 }, heading: 90, altitude: 2200, speed: 150 },
          { id: 'trail', callsign: 'EZY9 M 320', pos: { x: 5, y: 0 }, heading: 90, altitude: 3000, speed: 165 },
        ],
      },
    },
    'radar-sequence-fan': {
      rings: [10, 20],
      note: 'Three inbounds for runway 27 from different bearings. ETA = distance / ground speed. AFR (8 nm @ 220 kt) lands first; DLH (10 nm @ 200 kt) second; BAW (14 nm @ 230 kt) third.',
      scenario: {
        rangeNm: 28,
        runways: [
          { threshold: { x: 4, y: 0 }, heading: 270, lengthNm: 0.6, showFinal: true },
        ],
        aircraft: [
          { id: 's1', callsign: 'AFR1 8nm 220', pos: { x: -4, y: -3 }, heading: 80, altitude: 4000, speed: 220 },
          { id: 's2', callsign: 'DLH9 10nm 200', pos: { x: -6, y: 6 }, heading: 110, altitude: 5000, speed: 200 },
          { id: 's3', callsign: 'BAW3 14nm 230', pos: { x: -10, y: -8 }, heading: 50, altitude: 7000, speed: 230 },
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
            <WindTag wind={cfg.scenario.wind} position={{ x: 0, y: 0 }} />
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
