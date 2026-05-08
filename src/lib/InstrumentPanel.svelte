<script lang="ts">
  // Wrapper around radarscope's <PFD> that renders directly from an
  // ApproachScenario. All four Intercept phases use it.
  import { PFD } from 'radarscope/instruments';
  import type { ApproachScenario } from './approach-scenario';

  interface Props {
    scenario: ApproachScenario;
    /** Show DA tick on altitude tape — set false in modes where DA is the answer. */
    showDa?: boolean;
  }

  let { scenario, showDa = true }: Props = $props();

  const ac = $derived(scenario.aircraft);
  const baroInHg = 29.92;
</script>

<div class="instrument-panel">
  <PFD
    pitch={ac.pitch}
    roll={ac.roll}
    fd={null}
    ias={ac.ias}
    vref={ac.vref}
    bugs={[{ kt: ac.vref, label: 'VREF', color: '#22d3ee' }]}
    selectedSpeed={scenario.selectedSpeed ?? null}
    alt={ac.alt}
    selectedAlt={scenario.selectedAlt ?? null}
    baro={baroInHg}
    baroUnit="inHg"
    daBaro={showDa ? scenario.daBaroFt ?? null : null}
    daSource="BARO"
    fpm={ac.fpm}
    hdg={ac.hdg}
    hdgBug={null}
    track={null}
    course={scenario.runway.headingT}
    locDots={ac.locDots}
    gsDots={ac.gsDots}
    fma={scenario.fma}
    apEngaged={scenario.ap}
    apSubtext={scenario.apSub ?? null}
    ra={ac.agl < 2500 ? ac.agl : null}
    da={scenario.decisionHeightFt}
    windFrom={scenario.weather.windFromT}
    windKt={scenario.weather.windKt}
  />
</div>

<style>
  .instrument-panel {
    display: flex;
    justify-content: center;
    background: #060810;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem;
  }
  /* The radarscope PFD floats the G/S scale at right:-22px of the attitude
   * indicator with only a 4px gap to the altitude tape, so the G/S diamonds
   * overlap the altitude readout. Open up the gap so G/S sits cleanly between
   * the AI ball and the altitude column. */
  .instrument-panel :global(.row.main-row) {
    gap: 28px;
  }
</style>
