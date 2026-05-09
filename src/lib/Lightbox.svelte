<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { onMount } from 'svelte';

  interface Props {
    src: string;
    alt?: string;
    onClose: () => void;
  }

  let { src, alt = '', onClose }: Props = $props();

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  });
</script>

<div
  class="lb-backdrop"
  role="presentation"
  onclick={onClose}
  transition:fade={{ duration: 150 }}
>
  <div
    class="bezel lb-frame"
    data-label="Photo"
    role="dialog"
    aria-modal="true"
    aria-label="Enlarged photo"
    onclick={(e) => e.stopPropagation()}
    in:fly={{ y: 12, duration: 180 }}
  >
    <button class="lb-close" type="button" onclick={onClose} aria-label="Close">✕</button>
    <img class="lb-img" {src} {alt} draggable="false" />
  </div>
</div>

<style>
  .lb-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    padding: 1rem;
    cursor: zoom-out;
  }

  .lb-frame {
    position: relative;
    background: var(--mfd-bg);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 2px;
    padding: 0.6rem;
    max-width: min(96vw, 1400px);
    max-height: 92vh;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: default;
  }
  .lb-frame::before {
    content: attr(data-label);
    position: absolute;
    top: -0.42rem;
    left: 0.85rem;
    background: var(--bg);
    padding: 0 0.45rem;
    font-family: var(--mono);
    font-size: 0.6rem;
    letter-spacing: 0.34em;
    text-transform: uppercase;
    color: var(--led-cyan);
    font-weight: 700;
    height: 14px;
    display: inline-flex;
    align-items: center;
  }

  .lb-close {
    position: absolute;
    top: -0.5rem;
    right: -0.5rem;
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--mono);
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--led-red);
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 1px;
    cursor: pointer;
    z-index: 1;
  }
  .lb-close:hover { color: #ff9b9b; border-color: var(--led-red); }
  .lb-close:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }

  .lb-img {
    display: block;
    max-width: 100%;
    max-height: calc(92vh - 1.6rem);
    width: auto;
    height: auto;
    object-fit: contain;
    background: var(--mfd-bg);
  }
</style>
