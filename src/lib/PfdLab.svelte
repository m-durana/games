<script lang="ts">
  // Sandbox / dev preview for the radarscope/instruments widgets. Each
  // widget has its own panel with reactive controls so we can tune them
  // in isolation before wiring them into a game mode.
  import {
    AttitudeIndicator,
    SpeedTape,
    AltitudeTape,
    VSI,
    HeadingTape,
    LocalizerScale,
    GlideslopeScale,
    FMAStrip,
    APAnnunciator,
    RadioAltimeter,
    WindReadout,
    PFD,
  } from 'radarscope/instruments';

  interface Props {
    onHome: () => void;
  }
  let { onHome }: Props = $props();

  // Each section owns its own state. Independent tweakability is the
  // whole point of the lab.

  let pitch = $state(-2);
  let roll = $state(0);
  let slip = $state(0);
  let fdEnabled = $state(true);
  let fdPitch = $state(-2.5);
  let fdRoll = $state(0);

  let ias = $state(140);
  let vref = $state(135);
  let selectedSpeed = $state<number | null>(140);
  let mach = $state<number | null>(0.32);
  let accelKt = $state<number | null>(0);
  let vmo = $state<number | null>(250);
  let vstall = $state<number | null>(105);
  let vmin = $state<number | null>(120);
  let vfe = $state<number | null>(180);
  let gs = $state<number | null>(138);

  let alt = $state(1200);
  let selectedAlt = $state<number | null>(800);
  let daBaro = $state<number | null>(800);
  let baro = $state(29.92);
  let baroUnit = $state<'inHg' | 'hPa'>('inHg');

  let fpm = $state(-700);
  let selectedFpm = $state<number | null>(-700);

  let hdg = $state(265);
  let hdgBug = $state<number | null>(265);
  let track = $state<number | null>(267);
  let course = $state<number | null>(263);

  let locDots = $state(0.3);
  let gsDots = $state(-0.4);
  let locValid = $state(true);
  let gsValid = $state(true);
  let tcasRedLo = $state(-1500);
  let tcasRedHi = $state(-500);
  let tcasGreenEnabled = $state(false);
  let tcasGreenLo = $state(500);
  let tcasGreenHi = $state(1500);
  let windFrom = $state<number | null>(250);
  let windKt = $state<number | null>(18);

  let fmaAt = $state('SPEED');
  let fmaLat = $state('LOC');
  let fmaVert = $state('G/S');
  let fmaApp = $state('LAND 3');

  let apEngaged = $state<'CMD' | 'FD' | null>('CMD');
  let apSubtext = $state('LNAV/VNAV');

  let ra = $state(420);
  let da = $state(200);

  // Composite scenario — uses all the same state above so tweaks roll
  // through to the full PFD too.
  const fma = $derived({ at: fmaAt, lat: fmaLat, vert: fmaVert, app: fmaApp });
  const fd = $derived(fdEnabled ? { pitch: fdPitch, roll: fdRoll } : null);
</script>

<div class="lab">
  <header>
    <button class="back" onclick={onHome}>← Home</button>
    <h1>PFD Lab</h1>
    <p class="sub">Phase 1 — each widget is its own SVG, tweakable on its own.</p>
  </header>

  <section>
    <h2>Attitude Indicator</h2>
    <div class="row">
      <AttitudeIndicator pitch={pitch} roll={roll} fd={fd} slip={slip} width={240} height={240} />
      <div class="ctrl">
        <label>pitch <input type="range" min="-30" max="30" step="0.5" bind:value={pitch} /> {pitch.toFixed(1)}°</label>
        <label>roll <input type="range" min="-60" max="60" step="1" bind:value={roll} /> {roll}°</label>
        <label>slip (g) <input type="range" min="-1" max="1" step="0.05" bind:value={slip} /> {slip.toFixed(2)}</label>
        <label><input type="checkbox" bind:checked={fdEnabled} /> Flight director</label>
        <label>FD pitch <input type="range" min="-15" max="15" step="0.5" bind:value={fdPitch} disabled={!fdEnabled} /> {fdPitch.toFixed(1)}°</label>
        <label>FD roll <input type="range" min="-30" max="30" step="1" bind:value={fdRoll} disabled={!fdEnabled} /> {fdRoll}°</label>
      </div>
    </div>
  </section>

  <section>
    <h2>Speed Tape</h2>
    <div class="row">
      <SpeedTape ias={ias} vref={vref} selected={selectedSpeed} mach={mach} accelKt={accelKt} vmo={vmo} vstall={vstall} vmin={vmin} vfe={vfe} gs={gs} bugs={[{ kt: vref + 5, label: 'F', color: '#16a34a' }]} width={70} height={272} />
      <div class="ctrl">
        <label>IAS <input type="range" min="80" max="350" step="1" bind:value={ias} /> {ias} kt</label>
        <label>VREF <input type="range" min="100" max="180" step="1" bind:value={vref} /> {vref} kt</label>
        <label>Selected <input type="range" min="80" max="350" step="1" bind:value={selectedSpeed} /> {selectedSpeed} kt</label>
        <label>Mach <input type="range" min="0" max="0.95" step="0.01" bind:value={mach} /> {mach?.toFixed(2)}</label>
        <label>Accel kt/s <input type="range" min="-3" max="3" step="0.1" bind:value={accelKt} /> {accelKt?.toFixed(1)}</label>
        <label>VMO <input type="range" min="100" max="350" step="1" bind:value={vmo} /> {vmo}</label>
        <label>Vstall <input type="range" min="60" max="200" step="1" bind:value={vstall} /> {vstall}</label>
        <label>Vmin <input type="range" min="60" max="220" step="1" bind:value={vmin} /> {vmin}</label>
        <label>VFE <input type="range" min="100" max="280" step="1" bind:value={vfe} /> {vfe}</label>
        <label>GS <input type="range" min="0" max="500" step="1" bind:value={gs} /> {gs}</label>
      </div>
    </div>
  </section>

  <section>
    <h2>Altitude Tape</h2>
    <div class="row">
      <AltitudeTape alt={alt} selectedAlt={selectedAlt} baro={baro} baroUnit={baroUnit} fpm={fpm} da={daBaro} width={80} height={272} />
      <div class="ctrl">
        <label>Alt <input type="range" min="0" max="40000" step="20" bind:value={alt} /> {alt} ft</label>
        <label>Selected <input type="range" min="0" max="40000" step="100" bind:value={selectedAlt} /> {selectedAlt} ft</label>
        <label>DA (baro) <input type="range" min="0" max="3000" step="20" bind:value={daBaro} /> {daBaro} ft</label>
        <label>Baro <input type="number" step="0.01" bind:value={baro} /></label>
        <label>Unit
          <select bind:value={baroUnit}>
            <option value="inHg">inHg</option>
            <option value="hPa">hPa</option>
          </select>
        </label>
      </div>
    </div>
  </section>

  <section>
    <h2>VSI</h2>
    <div class="row">
      <VSI
        fpm={fpm} selectedFpm={selectedFpm}
        tcasRedBand={{ lo: tcasRedLo, hi: tcasRedHi }}
        tcasGreenBand={tcasGreenEnabled ? { lo: tcasGreenLo, hi: tcasGreenHi } : null}
        width={36} height={240}
      />
      <div class="ctrl">
        <label>fpm <input type="range" min="-2500" max="2500" step="50" bind:value={fpm} /> {fpm} fpm</label>
        <label>Sel V/S <input type="range" min="-2500" max="2500" step="50" bind:value={selectedFpm} /> {selectedFpm} fpm</label>
        <label>TCAS red lo <input type="range" min="-2500" max="2500" step="50" bind:value={tcasRedLo} /> {tcasRedLo}</label>
        <label>TCAS red hi <input type="range" min="-2500" max="2500" step="50" bind:value={tcasRedHi} /> {tcasRedHi}</label>
        <label><input type="checkbox" bind:checked={tcasGreenEnabled} /> TCAS green band</label>
        <label>green lo <input type="range" min="-2500" max="2500" step="50" bind:value={tcasGreenLo} disabled={!tcasGreenEnabled} /> {tcasGreenLo}</label>
        <label>green hi <input type="range" min="-2500" max="2500" step="50" bind:value={tcasGreenHi} disabled={!tcasGreenEnabled} /> {tcasGreenHi}</label>
      </div>
    </div>
  </section>

  <section>
    <h2>Heading Tape</h2>
    <div class="row col">
      <HeadingTape hdg={hdg} bug={hdgBug} track={track} course={course} width={280} height={44} />
      <div class="ctrl">
        <label>HDG <input type="range" min="0" max="359" step="1" bind:value={hdg} /> {hdg}°</label>
        <label>Bug <input type="range" min="0" max="359" step="1" bind:value={hdgBug} /> {hdgBug}°</label>
        <label>Track <input type="range" min="0" max="359" step="1" bind:value={track} /> {track}°</label>
        <label>Course <input type="range" min="0" max="359" step="1" bind:value={course} /> {course}°</label>
      </div>
    </div>
  </section>

  <section>
    <h2>Localizer Scale</h2>
    <div class="row col">
      <LocalizerScale deviation={locDots} valid={locValid} width={200} height={24} />
      <div class="ctrl">
        <label>dots <input type="range" min="-3" max="3" step="0.05" bind:value={locDots} /> {locDots.toFixed(2)}</label>
      </div>
    </div>
  </section>

  <section>
    <h2>Glideslope Scale</h2>
    <div class="row">
      <GlideslopeScale deviation={gsDots} valid={gsValid} width={24} height={200} />
      <div class="ctrl">
        <label>dots <input type="range" min="-3" max="3" step="0.05" bind:value={gsDots} /> {gsDots.toFixed(2)}</label>
      </div>
    </div>
  </section>

  <section>
    <h2>FMA Strip</h2>
    <div class="row col">
      <FMAStrip at={fmaAt} lat={fmaLat} vert={fmaVert} app={fmaApp} width={400} height={28} />
      <div class="ctrl ctrl-grid">
        <label>AT
          <select bind:value={fmaAt}>
            {#each ['SPEED','THR REF','RETARD','IDLE','HOLD',''] as o}<option value={o}>{o || '(blank)'}</option>{/each}
          </select>
        </label>
        <label>LAT
          <select bind:value={fmaLat}>
            {#each ['LOC','HDG SEL','LNAV','ROLLOUT',''] as o}<option value={o}>{o || '(blank)'}</option>{/each}
          </select>
        </label>
        <label>VERT
          <select bind:value={fmaVert}>
            {#each ['G/S','V/S','ALT','VNAV','FLARE',''] as o}<option value={o}>{o || '(blank)'}</option>{/each}
          </select>
        </label>
        <label>APP
          <select bind:value={fmaApp}>
            {#each ['LAND 3','LAND 2','NO AUTOLAND','ILS',''] as o}<option value={o}>{o || '(blank)'}</option>{/each}
          </select>
        </label>
      </div>
    </div>
  </section>

  <section>
    <h2>AP Annunciator</h2>
    <div class="row col">
      <APAnnunciator engaged={apEngaged} subtext={apSubtext} width={240} height={22} />
      <div class="ctrl ctrl-grid">
        <label>State
          <select bind:value={apEngaged}>
            <option value={null}>(off)</option>
            <option value={'CMD'}>CMD</option>
            <option value={'FD'}>FD</option>
          </select>
        </label>
        <label>Subtext <input type="text" bind:value={apSubtext} /></label>
      </div>
    </div>
  </section>

  <section>
    <h2>Wind</h2>
    <div class="row">
      <WindReadout from={windFrom} kt={windKt} width={80} height={28} />
      <div class="ctrl">
        <label>From <input type="range" min="0" max="359" step="1" bind:value={windFrom} /> {windFrom}°</label>
        <label>Speed <input type="range" min="0" max="80" step="1" bind:value={windKt} /> {windKt} kt</label>
        <label><input type="checkbox" bind:checked={locValid} /> LOC valid</label>
        <label><input type="checkbox" bind:checked={gsValid} /> G/S valid</label>
      </div>
    </div>
  </section>

  <section>
    <h2>Radio Altimeter</h2>
    <div class="row">
      <RadioAltimeter ra={ra} da={da} width={120} height={44} />
      <div class="ctrl">
        <label>RA <input type="range" min="0" max="3000" step="5" bind:value={ra} /> {ra} ft</label>
        <label>DA <input type="range" min="0" max="800" step="10" bind:value={da} /> {da} ft</label>
      </div>
    </div>
  </section>

  <section class="composite">
    <h2>Composite PFD</h2>
    <p class="sub">Driven by the same state as above — tweaks above flow here.</p>
    <PFD
      pitch={pitch}
      roll={roll}
      fd={fd}
      slip={slip}
      ias={ias}
      vref={vref}
      selectedSpeed={selectedSpeed}
      mach={mach}
      accelKt={accelKt}
      vmo={vmo}
      vstall={vstall}
      vmin={vmin}
      vfe={vfe}
      gs={gs}
      alt={alt}
      selectedAlt={selectedAlt}
      baro={baro}
      baroUnit={baroUnit}
      daBaro={daBaro}
      fpm={fpm}
      selectedFpm={selectedFpm}
      hdg={hdg}
      hdgBug={hdgBug}
      track={track}
      course={course}
      locDots={locDots}
      gsDots={gsDots}
      locValid={locValid}
      gsValid={gsValid}
      fma={fma}
      apEngaged={apEngaged}
      apSubtext={apSubtext}
      ra={ra}
      da={da}
      tcasRedBand={{ lo: tcasRedLo, hi: tcasRedHi }}
      tcasGreenBand={tcasGreenEnabled ? { lo: tcasGreenLo, hi: tcasGreenHi } : null}
      windFrom={windFrom}
      windKt={windKt}
    />
  </section>
</div>

<style>
  .lab {
    --pfd-bg: #0a0c10;
    --pfd-tape-bg: #1c2027;
    --pfd-fg: #ffffff;
    --pfd-sky: #1d6fb8;
    --pfd-ground: #8b4a1e;
    --pfd-magenta: #d946ef;
    --pfd-amber: #ffb000;
    --pfd-vref: #16a34a;
    --pfd-fma: #1a1d23;
    --pfd-bezel: #2a2f38;
    --pfd-cyan: #22d3ee;
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    padding: 0.75rem 0 2rem;
  }
  header { display: flex; flex-direction: column; gap: 0.25rem; }
  header h1 { margin: 0; font-size: 1.1rem; }
  .sub { color: var(--muted); font-size: 0.8rem; margin: 0; }
  .back {
    align-self: flex-start;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.3rem 0.6rem;
    color: var(--text);
    cursor: pointer;
    margin-bottom: 0.4rem;
  }
  section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  section h2 { margin: 0; font-size: 0.95rem; }
  .row { display: flex; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
  .row.col { flex-direction: column; align-items: stretch; }
  .ctrl {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1;
    min-width: 220px;
  }
  .ctrl-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.4rem; }
  .ctrl label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: var(--text);
  }
  .ctrl input[type="range"] { flex: 1; min-width: 100px; }
  .ctrl input[type="number"] { width: 80px; }
  .composite {
    align-items: center;
  }
</style>
