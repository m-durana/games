<script lang="ts">
  import { RadarScope, AircraftBlip, Waypoint as WaypointMarker, WindTag } from 'radarscope/svelte';
  import { PFD, FMAStrip, type FmaState, type FMACallout } from 'radarscope/instruments';
  import type { Scenario } from 'radarscope';
  import OutsideView from './OutsideView.svelte';
  import type { VisualReference, OutsideAmbiguity } from './intercept-minimums';

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
    | 'intercept-glideslope-side'
    // Intercept Stable / Diamonds — annotated PFD snapshots.
    | 'pfd-stable'
    | 'pfd-unstable-sink'
    | 'pfd-unstable-loc'
    | 'pfd-tight-borderline'
    // Minimums — out-the-window strips.
    | 'outside-tdz'
    | 'outside-approachlights'
    | 'outside-fog-uncertain'
    // FMA Watch — large standalone FMA strips.
    | 'fma-land3'
    | 'fma-land2'
    | 'fma-noautoland'
    // ATC Decode/Compose — radar illustrations + transmission cards.
    | 'atc-climb-fl'
    | 'atc-turn-heading'
    | 'atc-direct-fix'
    | 'atc-cleared-ils'
    | 'atc-readback-card'
    | 'atc-decoy-card';

  interface Props {
    scene: SceneKey;
    caption?: string;
  }

  let { scene, caption }: Props = $props();

  const PFD_BASE = {
    pitch: -1.5, roll: 0,
    ias: 138, vref: 132,
    bugs: [{ kt: 132, label: 'VREF', color: '#22d3ee' }],
    selectedSpeed: 132,
    alt: 1430, selectedAlt: 4400, baro: 29.92, baroUnit: 'inHg' as const,
    daBaro: 630, daSource: 'BARO' as const,
    fpm: -720,
    hdg: 158, course: 158,
    locDots: 0.05, gsDots: -0.1,
    fma: { at: 'SPEED', lat: 'LOC', vert: 'G/S', app: 'ILS' } as FmaState,
    apEngaged: 'CMD' as 'CMD' | 'FD' | null,
    apSubtext: 'LNAV/VNAV',
    ra: 1000, da: 200,
    windFrom: 170, windKt: 8,
  };

  /** Annotation marker for callouts on instrument scenes.
   *  x/y are percentages of the panel container (0..100).
   *  side controls which direction the label sits relative to the dot —
   *  the dot is anchored on the feature, the label spills outward. */
  interface Marker {
    x: number;
    y: number;
    label: string;
    tone?: 'good' | 'bad' | 'note';
    side?: 'left' | 'right' | 'top' | 'bottom';
  }

  const PFD_SCENES: Partial<Record<SceneKey, { props: Record<string, unknown>; markers: Marker[]; note: string }>> = {
    'pfd-stable': {
      props: { ...PFD_BASE },
      markers: [
        // dots sit ON the feature; labels spill into the frame's padding.
        { x: 22, y: 55, label: '1 IAS in band',            tone: 'good', side: 'left' },
        { x: 90, y: 60, label: '2 sink under 1000 fpm',    tone: 'good', side: 'right' },
        { x: 50, y: 88, label: '3 LOC under 1 dot',        tone: 'good', side: 'bottom' },
        { x: 65, y: 50, label: '4 G/S under 1 dot',        tone: 'good', side: 'top' },
        { x: 50, y: 6,  label: '5 FMA: SPEED LOC G/S ILS', tone: 'good', side: 'top' },
      ],
      note: 'All six gates in the green. Continue.',
    },
    'pfd-unstable-sink': {
      props: { ...PFD_BASE, fpm: -1450, pitch: -3.5 },
      markers: [
        { x: 90, y: 70, label: 'sink 1450 fpm — over limit', tone: 'bad', side: 'right' },
      ],
      note: 'Sink rate over 1000 fpm at 1000 ft AGL is a hard fail. Go around.',
    },
    'pfd-unstable-loc': {
      props: { ...PFD_BASE, locDots: 1.6, roll: 6 },
      markers: [
        { x: 50, y: 88, label: 'LOC 1.6 dots — outside band', tone: 'bad', side: 'bottom' },
      ],
      note: 'Outside one dot of localizer at 1000 ft = unstable. Go around.',
    },
    'pfd-tight-borderline': {
      props: { ...PFD_BASE, ias: 154, fpm: -990 },
      markers: [
        { x: 22, y: 50, label: 'IAS VREF+22 — over band', tone: 'bad', side: 'left' },
        { x: 90, y: 65, label: 'sink 990 fpm — tight',    tone: 'note', side: 'right' },
      ],
      note: 'Hard mode: speed is just past VREF+20. Tight sink rate alongside is a distraction. One failed gate is still GA.',
    },
  };

  const FMA_SCENES: Partial<Record<SceneKey, { fma: FmaState; callout: FMACallout; note: string }>> = {
    'fma-land3': {
      fma: { at: 'RETARD', lat: 'ROLLOUT', vert: 'FLARE', app: 'LAND 3' },
      callout: { column: 'app', label: 'fail-operational autoland', tone: 'good', placement: 'above' },
      note: 'LAND 3 means two redundant autopilots are tracking. Cleared to autoland in zero vis.',
    },
    'fma-land2': {
      fma: { at: 'RETARD', lat: 'ROLLOUT', vert: 'FLARE', app: 'LAND 2' },
      callout: { column: 'app', label: 'single-channel · alert-height limit', tone: 'note', placement: 'above' },
      note: 'LAND 2 is acceptable above the alert height (~200 ft AGL). Below it, a drop to NO AUTOLAND is a mandatory go-around.',
    },
    'fma-noautoland': {
      fma: { at: 'RETARD', lat: 'ROLLOUT', vert: 'FLARE', app: 'NO AUTOLAND' },
      callout: { column: 'app', label: 'mandatory go-around', tone: 'bad', placement: 'below' },
      note: 'NO AUTOLAND in the approach column at any height = go around. Don\'t hesitate.',
    },
  };

  const OUTSIDE_SCENES: Partial<Record<SceneKey, { reference: VisualReference; ambiguity: OutsideAmbiguity; rvrM: number; markers: Marker[]; note: string }>> = {
    'outside-tdz': {
      reference: 'tdz', ambiguity: 'clear', rvrM: 700,
      // dot on the TDZ stripes; label rises into foggy sky so it doesn't crash the legend.
      markers: [{ x: 50, y: 70, label: 'TDZ markings visible', tone: 'good', side: 'top' }],
      note: 'Touchdown zone markings in sight: a required reference per FAR 91.175(c). Continue, landing.',
    },
    'outside-approachlights': {
      reference: 'approachLights', ambiguity: 'clear', rvrM: 550,
      // dot on the near (closest, largest) end of the centerline lights; label flows right into empty fog.
      markers: [{ x: 50, y: 42, label: 'Approach lights only', tone: 'note', side: 'right' }],
      note: 'Approach lights without red side row bars: continue to 100 ft AGL only. Below that needs red bars or threshold.',
    },
    'outside-fog-uncertain': {
      reference: 'runwayLights', ambiguity: 'maybe', rvrM: 250,
      markers: [{ x: 50, y: 65, label: 'Maybe runway lights — uncertain', tone: 'bad', side: 'top' }],
      note: 'Uncertainty = miss. The DA call is binary. Go around.',
    },
  };

  // ATC transmission card scenes (atcDecode / atcCompose graphics).
  interface CardLine { tag: string; text: string; tone?: 'good' | 'bad' | 'note' }
  interface AtcCardScene {
    title: string;
    transmission: CardLine[];
    readback?: CardLine[];
    decoys?: string[];
    note: string;
  }
  const CARD_SCENES: Partial<Record<SceneKey, AtcCardScene>> = {
    'atc-readback-card': {
      title: 'Building a readback',
      transmission: [
        { tag: 'callsign', text: 'United 28' },
        { tag: 'instruction', text: 'descend and maintain' },
        { tag: 'parameter', text: 'flight level 240' },
        { tag: 'instruction', text: 'slow to' },
        { tag: 'parameter', text: '280 knots' },
      ],
      readback: [
        { tag: 'instruction', text: 'descend and maintain', tone: 'good' },
        { tag: 'parameter', text: 'FL240', tone: 'good' },
        { tag: 'instruction', text: 'slow to', tone: 'good' },
        { tag: 'parameter', text: '280', tone: 'good' },
        { tag: 'callsign', text: 'United 28', tone: 'good' },
      ],
      note: 'Readback echoes the parameters in the same order, with the callsign moved to the END.',
    },
    'atc-decoy-card': {
      title: 'Spotting decoy chips',
      transmission: [
        { tag: 'callsign', text: 'Delta 410' },
        { tag: 'instruction', text: 'turn right heading' },
        { tag: 'parameter', text: '270' },
      ],
      readback: [
        { tag: 'instruction', text: 'turn right heading', tone: 'good' },
        { tag: 'parameter', text: '270', tone: 'good' },
        { tag: 'callsign', text: 'Delta 410', tone: 'good' },
      ],
      decoys: ['turn LEFT heading', '027', 'Delta 140', 'maintain 270'],
      note: 'Decoy chips are wrong-direction, wrong-number, or wrong-callsign variants. Tap only the chips that match what was said.',
    },
  };

  type RadarSceneKey = Exclude<SceneKey,
    | 'intercept-glideslope-side'
    | 'pfd-stable' | 'pfd-unstable-sink' | 'pfd-unstable-loc' | 'pfd-tight-borderline'
    | 'outside-tdz' | 'outside-approachlights' | 'outside-fog-uncertain'
    | 'fma-land3' | 'fma-land2' | 'fma-noautoland'
    | 'atc-climb-fl' | 'atc-readback-card' | 'atc-decoy-card'
  >;
  const SCENARIOS: Record<RadarSceneKey, { scenario: Scenario; rings?: number[]; targetId?: string; note?: string }> = {
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
    'atc-turn-heading': {
      rings: [10, 20],
      note: '"Turn right heading 270" — the plane is currently pointed north (heading 360) and must rotate 90° clockwise to point west.',
      scenario: {
        rangeNm: 25,
        aircraft: [
          { id: 'me', callsign: 'UAL28 270', pos: { x: 0, y: 0 }, heading: 360, altitude: 14000, speed: 300 },
        ],
        waypoints: [
          { id: 'n', label: 'now: 360', pos: { x: 0, y: -16 } },
          { id: 'w', label: 'after turn: 270', pos: { x: -18, y: 0 } },
        ],
      },
    },
    'atc-direct-fix': {
      rings: [10, 20],
      targetId: 'wp-target',
      note: '"Direct BOSOX" — abandon the current track and fly straight to the named fix.',
      scenario: {
        rangeNm: 25,
        aircraft: [{ id: 'me', callsign: 'UAL28', pos: { x: 0, y: 0 }, heading: 360, altitude: 16000, speed: 320 }],
        waypoints: [
          { id: 'wp-target', label: 'BOSOX', pos: { x: 10, y: -12 } },
          { id: 'd1', label: '·', pos: { x: -10, y: -8 } },
          { id: 'd2', label: '·', pos: { x: 6, y: 14 } },
        ],
      },
    },
    'atc-cleared-ils': {
      rings: [5, 10],
      note: '"Cleared ILS RWY 27L" — you may fly the published instrument approach to runway 27L. The dashed line is the localizer (extended centerline).',
      scenario: {
        rangeNm: 14,
        runways: [
          { threshold: { x: 5, y: 0 }, heading: 270, lengthNm: 0.6, showFinal: true },
        ],
        aircraft: [
          { id: 'me', callsign: 'UAL28', pos: { x: -3, y: -3 }, heading: 270, altitude: 3000, speed: 180 },
        ],
      },
    },
  };

  // Side-view altitude band for "climb and maintain" decoder.
  // (Rendered inline as a custom SVG so the FL change reads as a vertical step.)
</script>

{#if scene in PFD_SCENES}
  {@const cfg = PFD_SCENES[scene]!}
  <div class="instrument-scene">
    <div class="instrument-frame">
      <PFD {...(cfg.props as any)} />
      {#each cfg.markers as m}
        {@const side = m.side ?? 'right'}
        <div class="marker marker-{m.tone ?? 'note'} side-{side}" style="left: {m.x}%; top: {m.y}%;">
          <span class="dot"></span>
          <span class="lbl">{m.label}</span>
        </div>
      {/each}
    </div>
    {#if caption}<div class="cap">{caption}</div>{/if}
    <div class="note">{cfg.note}</div>
  </div>
{:else if scene in OUTSIDE_SCENES}
  {@const cfg = OUTSIDE_SCENES[scene]!}
  <div class="instrument-scene">
    <div class="outside-frame">
      <OutsideView reference={cfg.reference} ambiguity={cfg.ambiguity} rvrM={cfg.rvrM} />
      {#each cfg.markers as m}
        {@const side = m.side ?? 'right'}
        <div class="marker marker-{m.tone ?? 'note'} side-{side}" style="left: {m.x}%; top: {m.y}%;">
          <span class="dot"></span>
          <span class="lbl">{m.label}</span>
        </div>
      {/each}
    </div>
    {#if caption}<div class="cap">{caption}</div>{/if}
    <div class="note">{cfg.note}</div>
  </div>
{:else if scene in FMA_SCENES}
  {@const cfg = FMA_SCENES[scene]!}
  <div class="instrument-scene">
    <div class="fma-frame">
      <FMAStrip at={cfg.fma.at} lat={cfg.fma.lat} vert={cfg.fma.vert} app={cfg.fma.app} width={520} height={48} callout={cfg.callout} />
    </div>
    {#if caption}<div class="cap">{caption}</div>{/if}
    <div class="note">{cfg.note}</div>
  </div>
{:else if scene === 'intercept-glideslope-side'}
  <div class="side-view">
    <svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
      <line x1="20" y1="180" x2="380" y2="180" stroke="#506070" stroke-width="2" />
      <rect x="320" y="178" width="60" height="4" fill="#a0c0d0" />
      <text x="350" y="195" fill="#a0c0d0" font-size="10" text-anchor="middle">RUNWAY</text>
      <line x1="320" y1="180" x2="40" y2="40" stroke="#5db15d" stroke-width="2" stroke-dasharray="4 3" />
      <text x="180" y="100" fill="#5db15d" font-size="10">3° glideslope (correct)</text>
      <line x1="320" y1="180" x2="40" y2="20" stroke="#d97a55" stroke-width="1.5" stroke-dasharray="2 2" />
      <text x="60" y="35" fill="#d97a55" font-size="9">too HIGH</text>
      <line x1="320" y1="180" x2="60" y2="135" stroke="#d97a55" stroke-width="1.5" stroke-dasharray="2 2" />
      <text x="100" y="148" fill="#d97a55" font-size="9">too LOW (dangerous)</text>
      <g transform="translate(180, 110)">
        <polygon points="0,-6 -8,6 8,6" fill="#a3cef1" />
        <text x="0" y="20" fill="#a3cef1" font-size="9" text-anchor="middle">YOU</text>
      </g>
    </svg>
    {#if caption}<div class="cap">{caption}</div>{/if}
    <div class="note">Side view: a 3° glideslope is the standard descent angle. Above it = "high" (would have to dive), below it = "low" (dangerously close to the ground early).</div>
  </div>
{:else if scene === 'atc-climb-fl'}
  <div class="side-view">
    <svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="200" fill="#06090c" />
      {#each [40, 80, 120, 160] as y}
        <line x1="40" y1={y} x2="380" y2={y} stroke="#1f2a36" stroke-width="0.5" stroke-dasharray="2 4" />
      {/each}
      <text x="34" y="44" fill="#5db15d" font-size="10" text-anchor="end">FL350</text>
      <text x="34" y="84" fill="#5b6470" font-size="9" text-anchor="end">FL300</text>
      <text x="34" y="124" fill="#5b6470" font-size="9" text-anchor="end">FL250</text>
      <text x="34" y="164" fill="#a3cef1" font-size="10" text-anchor="end">FL200</text>
      <line x1="60" y1="160" x2="340" y2="40" stroke="#5db15d" stroke-width="2" stroke-dasharray="4 3" />
      <g transform="translate(60, 160)">
        <polygon points="0,-6 -10,4 10,4" fill="#a3cef1" />
        <text x="0" y="20" fill="#a3cef1" font-size="9" text-anchor="middle">UAL28 now</text>
      </g>
      <g transform="translate(340, 40)">
        <polygon points="0,-6 -10,4 10,4" fill="#5db15d" />
        <text x="0" y="-12" fill="#5db15d" font-size="9" text-anchor="middle">target FL350</text>
      </g>
      <text x="200" y="105" fill="#5db15d" font-size="11" text-anchor="middle">"climb and maintain FL350"</text>
    </svg>
    {#if caption}<div class="cap">{caption}</div>{/if}
    <div class="note">Side view of altitudes. "Climb and maintain FL350" means: leave the current level, climb until reaching 35,000 ft, then hold it.</div>
  </div>
{:else if scene === 'atc-readback-card' || scene === 'atc-decoy-card'}
  {@const cfg = CARD_SCENES[scene]!}
  <div class="card-scene">
    <div class="card">
      <div class="card-title">{cfg.title}</div>
      <div class="card-section">
        <div class="card-section-label">Controller transmission</div>
        <div class="card-row">
          {#each cfg.transmission as line}
            <span class="chip chip-{line.tag} {line.tone ? 'tone-' + line.tone : ''}">
              <span class="chip-tag">{line.tag}</span>
              <span class="chip-text">{line.text}</span>
            </span>
          {/each}
        </div>
      </div>
      {#if cfg.readback}
        <div class="card-arrow">readback ↓</div>
        <div class="card-section">
          <div class="card-section-label">Pilot readback</div>
          <div class="card-row">
            {#each cfg.readback as line}
              <span class="chip chip-{line.tag} {line.tone ? 'tone-' + line.tone : ''}">
                <span class="chip-tag">{line.tag}</span>
                <span class="chip-text">{line.text}</span>
              </span>
            {/each}
          </div>
        </div>
      {/if}
      {#if cfg.decoys}
        <div class="card-section">
          <div class="card-section-label">Decoy chips (do not tap)</div>
          <div class="card-row">
            {#each cfg.decoys as d}
              <span class="chip chip-decoy">{d}</span>
            {/each}
          </div>
        </div>
      {/if}
    </div>
    {#if caption}<div class="cap">{caption}</div>{/if}
    <div class="note">{cfg.note}</div>
  </div>
{:else}
  {@const cfg = SCENARIOS[scene as RadarSceneKey]}
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
  .demo, .side-view, .card-scene {
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

  /* Instrument-based scenes (PFD / OutsideView / FMA strip) */
  .instrument-scene { display: flex; flex-direction: column; gap: 0.5rem; align-items: stretch; }
  .instrument-frame, .outside-frame, .fma-frame {
    position: relative;
    margin: 0 auto;
    background: #06090c;
    border: 1px solid var(--border);
    border-radius: 6px;
    max-width: 100%;
    box-sizing: border-box;
    overflow: visible;
  }
  /* Generous padding so labels can sit OUTSIDE the instrument bounding box. */
  .instrument-frame { width: max-content; padding: 50px 110px 80px; }
  .outside-frame { width: 100%; max-width: 460px; padding: 0.4rem; }
  .fma-frame { width: max-content; padding: 0.6rem; }
  /* Same trick as InterceptStableRound: open the AI/altitude gap so G/S
   * doesn't overlap the altitude tape. */
  .instrument-frame :global(.row.main-row) { gap: 28px; }

  .marker {
    position: absolute;
    pointer-events: none;
    z-index: 5;
    /* The container is anchored at (x%, y%); the dot sits there, the label
     * is positioned relative to the dot via .side-* below. */
    width: 0;
    height: 0;
  }
  .marker .dot {
    position: absolute;
    left: -5px; top: -5px;
    width: 10px; height: 10px;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: 0 0 0 2px rgba(0,0,0,0.5);
  }
  .marker .lbl {
    position: absolute;
    font-size: 0.7rem;
    font-family: var(--font-main);
    background: rgba(10, 12, 16, 0.92);
    border: 1px solid currentColor;
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
    white-space: nowrap;
    line-height: 1.2;
  }
  /* Side-anchored label placement, with a small gap from the dot. */
  .marker.side-right .lbl { left: 14px; top: 50%; transform: translateY(-50%); }
  .marker.side-left  .lbl { right: 14px; top: 50%; transform: translateY(-50%); }
  .marker.side-top   .lbl { left: 50%; bottom: 14px; transform: translateX(-50%); }
  .marker.side-bottom .lbl { left: 50%; top: 14px; transform: translateX(-50%); }

  /* Connector line between dot and label edge. */
  .marker::before {
    content: '';
    position: absolute;
    background: currentColor;
    opacity: 0.55;
  }
  .marker.side-right::before  { left: 6px;  top: -1px;  width: 8px; height: 2px; }
  .marker.side-left::before   { right: 6px; top: -1px;  width: 8px; height: 2px; }
  .marker.side-top::before    { left: -1px; bottom: 6px; width: 2px; height: 8px; }
  .marker.side-bottom::before { left: -1px; top: 6px;    width: 2px; height: 8px; }

  .marker-good { color: #5db15d; }
  .marker-good .dot { background: #5db15d; }
  .marker-bad { color: #ef4444; }
  .marker-bad .dot { background: #ef4444; }
  .marker-note { color: #eab308; }
  .marker-note .dot { background: #eab308; }

  /* ATC transmission card */
  .card {
    margin: 0 auto;
    width: 100%;
    max-width: 520px;
    background: #0b1018;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .card-title {
    font-size: 0.85rem;
    color: var(--text);
    font-weight: 600;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.4rem;
  }
  .card-section { display: flex; flex-direction: column; gap: 0.35rem; }
  .card-section-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .card-row { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .card-arrow {
    text-align: center;
    color: var(--muted);
    font-size: 0.7rem;
    letter-spacing: 0.1em;
  }
  .chip {
    display: inline-flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    background: rgba(255,255,255,0.04);
    line-height: 1.15;
  }
  .chip-tag {
    font-size: 0.55rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .chip-text { font-size: 0.78rem; color: var(--text); font-family: var(--font-main); }
  .chip.chip-callsign { background: rgba(99, 179, 237, 0.12); border-color: #63b3ed; }
  .chip.chip-instruction { background: rgba(234, 179, 8, 0.10); border-color: #eab308; }
  .chip.chip-parameter { background: rgba(93, 177, 93, 0.10); border-color: #5db15d; }
  .chip.tone-good { box-shadow: 0 0 0 1px #5db15d inset; }
  .chip.chip-decoy {
    background: rgba(239, 68, 68, 0.10);
    border-color: #ef4444;
    color: #ef4444;
    font-size: 0.78rem;
    font-family: var(--font-main);
    text-decoration: line-through;
  }
</style>
