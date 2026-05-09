<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { Achievement } from './achievements';

  interface Props {
    queue: Achievement[];
    onClear: () => void;
  }

  let { queue, onClear }: Props = $props();

  let active: Achievement | null = $state(null);
  let timer: number | null = null;

  $effect(() => {
    if (queue.length === 0) return;
    if (active) return;
    show(queue[0]);
  });

  function show(a: Achievement) {
    active = a;
    if (timer !== null) clearTimeout(timer);
    timer = window.setTimeout(dismiss, 3000);
  }

  function dismiss() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    active = null;
    onClear();
  }
</script>

{#if active}
  <div class="toast" transition:fly={{ y: 20, duration: 220 }}>
    <span class="icon">{active.icon}</span>
    <div class="text">
      <span class="label">Achievement unlocked</span>
      <span class="name">{active.name}</span>
      <span class="desc">{active.desc}</span>
    </div>
    <button type="button" onclick={(event) => { event.stopPropagation(); dismiss(); }} aria-label="Dismiss">✕</button>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    bottom: max(1rem, env(safe-area-inset-bottom));
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    width: calc(100% - 2rem);
    max-width: 420px;
    background: var(--panel);
    border: 1px solid var(--led-cyan);
    border-radius: 2px;
    padding: 0.7rem 0.85rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .icon {
    font-size: 1.6rem;
    flex-shrink: 0;
  }
  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.12rem;
    min-width: 0;
  }
  .label {
    font-family: var(--mono);
    font-size: 0.6rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--led-cyan);
    font-weight: 700;
  }
  .name { font-family: var(--sans); font-size: 0.9rem; font-weight: 700; color: var(--label); letter-spacing: -0.005em; }
  .desc { font-family: var(--sans); font-size: 0.74rem; color: var(--label-dim); }
  button {
    width: 36px; height: 36px;
    border-radius: 1px;
    color: var(--label-dim);
    flex-shrink: 0;
    font-family: var(--mono); font-weight: 700;
    font-size: 0.95rem;
    background: var(--panel-2);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    cursor: pointer;
  }
  button:hover { color: var(--led-red); border-color: var(--led-red); }
  button:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
</style>
