<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    score: number;
    isNewBest: boolean;
    onAgain: () => void;
    onHome: () => void;
  }

  let { score, isNewBest, onAgain, onHome }: Props = $props();

  let displayScore = $state(0);

  function verdict(s: number) {
    if (s >= 40) return 'Lightning fast.';
    if (s >= 30) return 'Caffeinated.';
    if (s >= 20) return 'Steady cruise.';
    if (s >= 10) return 'Warming up.';
    return 'Try again — combos pay off.';
  }

  onMount(() => {
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      // svelte-ignore state_referenced_locally
      displayScore = Math.round(score * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
</script>

<header class="head">
  <span class="pill speed">Speed Round · 60s</span>
  <h1>{displayScore}</h1>
  <p class="verdict">{verdict(score)}</p>
  {#if isNewBest && score > 0}
    <span class="best-flag">New best</span>
  {/if}
</header>

<footer class="actions">
  <button class="primary" onclick={onAgain}>Play again</button>
  <button class="secondary" onclick={onHome}>Back home</button>
</footer>

<style>
  .head {
    text-align: center;
    padding: 2rem 0 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.625rem;
    flex: 1;
    justify-content: center;
  }
  .pill.speed {
    font-size: 0.6875rem;
    font-family: var(--font-main);
    letter-spacing: 0;
    text-transform: uppercase;
    color: var(--info);
    background: rgba(98, 183, 216, 0.15);
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
  }
  .head h1 {
    font-family: var(--font-main);
    font-size: 5.5rem;
    font-weight: 600;
    letter-spacing: 0;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .verdict { color: var(--muted); font-size: 1rem; }
  .best-flag {
    font-size: 0.75rem;
    color: var(--good);
    background: rgba(71, 217, 176, 0.12);
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding-top: 0.75rem;
  }
  .actions button {
    min-height: 52px;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 500;
    transition: transform 0.1s, background 0.15s, border-color 0.15s;
  }
  .actions button:active { transform: scale(0.98); }
  .primary { background: var(--accent); color: var(--bg); }
  .primary:hover { background: #ffe18a; }
  .secondary {
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
  }
  .secondary:hover { border-color: var(--panel-line); background: var(--surface-2); }
</style>
