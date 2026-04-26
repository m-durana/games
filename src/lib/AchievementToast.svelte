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
    active = null;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    setTimeout(onClear, 200);
  }
</script>

{#if active}
  <div class="toast" transition:fly={{ y: -20, duration: 220 }}>
    <span class="icon">{active.icon}</span>
    <div class="text">
      <span class="label">Achievement unlocked</span>
      <span class="name">{active.name}</span>
      <span class="desc">{active.desc}</span>
    </div>
    <button onclick={dismiss} aria-label="Dismiss">✕</button>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    top: max(1rem, env(safe-area-inset-top));
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    width: calc(100% - 2rem);
    max-width: 420px;
    background: var(--surface);
    border: 1px solid rgba(251, 191, 36, 0.5);
    border-radius: 14px;
    padding: 0.75rem 0.875rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    box-shadow: 0 10px 32px rgba(0, 0, 0, 0.4);
  }
  .icon {
    font-size: 1.75rem;
    flex-shrink: 0;
  }
  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }
  .label {
    font-size: 0.6875rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #fbbf24;
  }
  .name { font-size: 0.9375rem; font-weight: 600; }
  .desc { font-size: 0.75rem; color: var(--muted); }
  button {
    width: 44px; height: 44px;
    border-radius: 999px;
    color: var(--muted);
    flex-shrink: 0;
    font-size: 1.125rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  button:hover, button:active { color: var(--text); background: var(--surface); }
</style>
