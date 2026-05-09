<script lang="ts">
  type LedState = 'todo' | 'current' | 'correct' | 'wrong' | 'partial';

  interface Props {
    progress: LedState[];
    score: number;
    total: number;
    scoreLabel?: string; // e.g. "SCORE", "PTS"
    streak?: number;
    onQuit: () => void;
  }

  let {
    progress,
    score,
    total,
    scoreLabel = 'SCORE',
    streak = 0,
    onQuit,
  }: Props = $props();
</script>

<header class="r-bar">
  <button class="quit-btn" type="button" onclick={onQuit} aria-label="Quit">✕ Quit</button>
  <span class="progress-leds" aria-label="Progress">
    {#each progress as state}
      <span class="p-led {state === 'todo' ? '' : state}"></span>
    {/each}
  </span>
  <span class="r-meta">
    {#if streak >= 3}
      <span class="r-streak" title="Streak">🔥 ×{streak}</span>
    {/if}
    <span class="r-score">{scoreLabel} <b>{score}</b>{total > 0 ? `/${total}` : ''}</span>
  </span>
</header>

<style>
  .r-bar {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.5rem 0.65rem;
    background: var(--panel-2);
    border: 1px solid var(--bezel-lo);
    border-radius: 2px;
  }

  .quit-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--mono);
    font-size: 0.65rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--led-red);
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    background: var(--panel);
    border-radius: 1px;
    flex-shrink: 0;
    cursor: pointer;
  }
  .quit-btn:hover { color: #ff9b9b; }
  .quit-btn:active {
    border-color: var(--bezel-lo);
    border-bottom-color: var(--bezel-hi);
    border-right-color: var(--bezel-hi);
  }

  .progress-leds {
    flex: 1;
    display: inline-flex;
    gap: 0.32rem;
    flex-wrap: wrap;
  }
  .p-led {
    width: 14px; height: 14px;
    border-radius: 50%;
    background: var(--led-off);
    border: 1px solid var(--bezel-lo);
    flex-shrink: 0;
  }
  .p-led.correct { background: var(--led-green); }
  .p-led.wrong   { background: var(--led-red); }
  .p-led.partial { background: var(--led-amber); }
  .p-led.current {
    background: var(--led-cyan);
    animation: rb-blink 1.1s ease-in-out infinite;
  }
  @keyframes rb-blink {
    0%, 100% { opacity: 0.45; }
    50%      { opacity: 1; }
  }

  .r-meta {
    display: inline-flex;
    align-items: center;
    gap: 0.85rem;
    font-family: var(--mono);
    font-size: 0.72rem;
    color: var(--label);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .r-score b { color: var(--led-green); font-weight: 700; }
  .r-streak { color: var(--led-amber); font-weight: 700; }
</style>
