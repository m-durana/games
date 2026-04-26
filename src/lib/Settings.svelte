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
  .head { padding: 1rem 0.25rem 0.25rem; }
  .head h1 {
    font-size: 2.25rem;
    font-weight: 600;
    letter-spacing: 0;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }
  .group h2 {
    font-size: 0.6875rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    padding-left: 0.25rem;
    font-weight: 500;
  }
  .group ul {
    list-style: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .group li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--border);
  }
  .group li:last-child { border-bottom: none; }

  .row-text { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .label { font-size: 0.9375rem; }
  .hint { font-size: 0.75rem; color: var(--muted); }
  .hint.center { text-align: center; padding: 0 0.5rem; }

  .switch {
    width: 44px;
    height: 26px;
    border-radius: 4px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    position: relative;
    flex-shrink: 0;
    transition: background 0.18s, border-color 0.18s;
    cursor: pointer;
  }
  .switch .thumb {
    position: absolute;
    top: 2px; left: 2px;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: var(--muted);
    transition: transform 0.18s, background 0.18s;
  }
  .switch.on {
    background: rgba(71, 217, 176, 0.25);
    border-color: rgba(71, 217, 176, 0.5);
  }
  .switch.on .thumb {
    transform: translateX(18px);
    background: var(--good);
  }

  .danger {
    width: 100%;
    padding: 0.875rem 1rem;
    border-radius: 6px;
    background: rgba(255, 107, 95, 0.1);
    border: 1px solid rgba(255, 107, 95, 0.4);
    color: var(--bad);
    font-size: 0.9375rem;
    transition: background 0.15s, transform 0.1s;
  }
  .danger:active { transform: scale(0.98); }
  .danger:hover { background: rgba(255, 107, 95, 0.16); }

  .actions { padding-top: 0.75rem; margin-top: auto; }
  .actions button {
    width: 100%;
    min-height: 52px;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 500;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    transition: background 0.15s, border-color 0.15s, transform 0.1s;
  }
  .actions button:active { transform: scale(0.98); }
  .actions button:hover { border-color: var(--panel-line); background: var(--surface-2); }
</style>
