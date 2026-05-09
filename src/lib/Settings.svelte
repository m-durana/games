<script lang="ts">
  import { loadSettings, resetProgress, saveSettings } from './engine';
  import type { Settings } from './types';

  interface Props {
    onHome: () => void;
  }

  let { onHome }: Props = $props();

  let settings: Settings = $state(loadSettings());
  let confirmingReset = $state(false);
  let resetDone = $state(false);

  function toggle(key: keyof Settings) {
    settings = { ...settings, [key]: !settings[key] };
    saveSettings(settings);
    if (key === 'darkMode') {
      document.documentElement.dataset.theme = settings.darkMode ? 'dark' : 'light';
    }
  }

  function doReset() {
    if (!confirmingReset) {
      confirmingReset = true;
      setTimeout(() => (confirmingReset = false), 4000);
      return;
    }
    resetProgress();
    confirmingReset = false;
    resetDone = true;
    setTimeout(() => (resetDone = false), 2000);
  }
</script>

<header class="head">
  <h1>Settings</h1>
</header>

<section class="group">
  <h2>Audio &amp; feedback</h2>
  <ul>
    <li>
      <div class="row-text">
        <span class="label">Sound effects</span>
        <span class="hint">Tones for correct, wrong, and perfect rounds.</span>
      </div>
      <button class="switch" class:on={settings.sound} onclick={() => toggle('sound')} aria-pressed={settings.sound} aria-label="Toggle sound effects">
        <span class="thumb"></span>
      </button>
    </li>
    <li>
      <div class="row-text">
        <span class="label">Haptics</span>
        <span class="hint">Subtle vibration on answer (mobile only).</span>
      </div>
      <button class="switch" class:on={settings.haptics} onclick={() => toggle('haptics')} aria-pressed={settings.haptics} aria-label="Toggle haptics">
        <span class="thumb"></span>
      </button>
    </li>
    <li>
      <div class="row-text">
        <span class="label">Dark mode</span>
        <span class="hint">Use the darker standard theme.</span>
      </div>
      <button class="switch" class:on={settings.darkMode} onclick={() => toggle('darkMode')} aria-pressed={settings.darkMode} aria-label="Toggle dark mode">
        <span class="thumb"></span>
      </button>
    </li>
    <li>
      <div class="row-text">
        <span class="label">Keyboard hints</span>
        <span class="hint">Show 1-4 number keys on options (desktop).</span>
      </div>
      <button class="switch" class:on={settings.keyboardHints} onclick={() => toggle('keyboardHints')} aria-pressed={settings.keyboardHints} aria-label="Toggle keyboard hints">
        <span class="thumb"></span>
      </button>
    </li>
  </ul>
</section>

<section class="group">
  <h2>Data</h2>
  <button class="danger" onclick={doReset}>
    {#if resetDone}
      Cleared
    {:else if confirmingReset}
      Tap again to confirm
    {:else}
      Reset all progress
    {/if}
  </button>
  <p class="hint center">Clears scores, history, achievements, daily progress, and per-airline stats. Settings stay.</p>
</section>

<footer class="actions">
  <button class="primary" onclick={onHome}>Back home</button>
</footer>

<style>
  .head { padding: 0.4rem 0.1rem 0.6rem; }
  .head h1 {
    font-family: var(--mono);
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--label);
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 1.2rem;
    position: relative;
  }
  .group h2 {
    font-family: var(--mono);
    font-size: 0.62rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--label-dim);
    padding-left: 0.25rem;
    font-weight: 700;
  }
  .group ul {
    list-style: none;
    margin: 0;
    padding: 0;
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 2px;
    overflow: hidden;
  }
  .group li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.85rem 1rem;
    background: var(--panel);
    border-bottom: 1px solid var(--bezel-lo);
  }
  .group li:last-child { border-bottom: none; }

  .row-text { display: flex; flex-direction: column; gap: 0.18rem; min-width: 0; }
  .label {
    font-family: var(--sans);
    font-size: 0.92rem;
    font-weight: 700;
    color: var(--label);
    letter-spacing: -0.005em;
  }
  .hint {
    font-family: var(--sans);
    font-size: 0.76rem;
    line-height: 1.4;
    color: var(--label-dim);
  }
  .hint.center { text-align: center; padding: 0.35rem 0.5rem 0; }

  .switch {
    width: 46px;
    height: 24px;
    border-radius: 1px;
    background: var(--bg);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    position: relative;
    flex-shrink: 0;
    transition: background 0.18s, border-color 0.18s;
    cursor: pointer;
  }
  .switch .thumb {
    position: absolute;
    top: 2px; left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 1px;
    background: var(--label-dim);
    transition: transform 0.18s, background 0.18s;
  }
  .switch.on {
    background: rgba(96, 216, 240, 0.12);
    border-color: var(--led-cyan);
  }
  .switch.on .thumb {
    transform: translateX(20px);
    background: var(--led-cyan);
  }

  .danger {
    width: 100%;
    padding: 0.8rem 1rem;
    border-radius: 1px;
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    color: var(--led-red);
    font-family: var(--mono);
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .danger:hover { color: #ff9b9b; border-color: var(--led-red); background: rgba(248, 113, 113, 0.06); }
  .danger:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }

  .actions { padding-top: 0.75rem; margin-top: auto; }
  .actions .primary {
    width: 100%;
    min-height: 48px;
    border-radius: 1px;
    font-family: var(--mono);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    background: var(--panel);
    color: var(--led-cyan);
    border: 1px solid var(--led-cyan);
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .actions .primary:hover { color: #b0ecf6; border-color: #b0ecf6; background: rgba(96, 216, 240, 0.08); }
  .actions .primary:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
</style>
