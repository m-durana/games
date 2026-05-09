<script lang="ts">
  interface Props {
    score: number;
    isNewBest: boolean;
    onAgain: () => void;
    onHome: () => void;
  }

  let { score, isNewBest, onAgain, onHome }: Props = $props();

  function verdict(s: number) {
    if (s >= 40) return 'Lightning fast.';
    if (s >= 30) return 'Caffeinated.';
    if (s >= 20) return 'Steady cruise.';
    if (s >= 10) return 'Warming up.';
    return 'Try again - combos pay off.';
  }
</script>

<header class="head">
  <span class="pill speed">Speed Round · 60s</span>
  <h1>{score}</h1>
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
    gap: 0.7rem;
    flex: 1;
    justify-content: center;
  }
  .pill.speed {
    font-family: var(--mono);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--led-cyan);
    background: var(--panel-2);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    padding: 0.28rem 0.7rem;
    border-radius: 1px;
  }
  .head h1 {
    font-family: var(--mono);
    font-size: 5.5rem;
    font-weight: 700;
    color: var(--led-green);
    letter-spacing: 0.02em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .verdict { color: var(--label-dim); font-family: var(--sans); font-size: 0.92rem; }
  .best-flag {
    font-family: var(--mono);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--led-amber);
    border: 1px solid var(--led-amber);
    background: rgba(251, 191, 36, 0.08);
    padding: 0.28rem 0.7rem;
    border-radius: 1px;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding-top: 1rem;
  }
  .actions button {
    min-height: 48px;
    border-radius: 1px;
    font-family: var(--mono);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .primary {
    background: var(--panel);
    color: var(--led-cyan);
    border: 1px solid var(--led-cyan);
  }
  .primary:hover { color: #b0ecf6; border-color: #b0ecf6; background: rgba(96, 216, 240, 0.08); }
  .primary:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
  .secondary {
    background: var(--panel);
    color: var(--label-dim);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
  }
  .secondary:hover { color: var(--led-cyan); border-color: var(--led-cyan); }
  .secondary:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
</style>
