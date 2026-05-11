<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { onMount, untrack } from 'svelte';

  interface Props {
    /** Either pass `src` for a single image or `images` + `initialIndex` for a gallery. */
    src?: string;
    images?: string[];
    initialIndex?: number;
    alt?: string;
    onClose: () => void;
  }

  let { src, images, initialIndex = 0, alt = '', onClose }: Props = $props();

  const photos = $derived(images && images.length > 0 ? images : (src ? [src] : []));
  let index = $state(untrack(() => Math.min(Math.max(initialIndex, 0), Math.max((images?.length ?? 1) - 1, 0))));

  const current = $derived(photos[index] ?? '');
  const hasMany = $derived(photos.length > 1);

  // Track loading state per src so switching photos shows the spinner
  // until the new one decodes.
  let loaded = $state(false);
  let errored = $state(false);
  $effect(() => {
    // re-run on src change
    void current;
    loaded = false;
    errored = false;
  });

  function prev() {
    if (!hasMany) return;
    index = (index - 1 + photos.length) % photos.length;
  }
  function next() {
    if (!hasMany) return;
    index = (index + 1) % photos.length;
  }

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
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
    data-label={hasMany ? `Photo · ${index + 1} / ${photos.length}` : 'Photo'}
    role="dialog"
    aria-modal="true"
    aria-label="Enlarged photo"
    tabindex="0"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    in:fly={{ y: 12, duration: 180 }}
  >
    <button class="lb-close" type="button" onclick={onClose} aria-label="Close">✕</button>

    {#if hasMany}
      <button class="lb-nav lb-prev" type="button" onclick={prev} aria-label="Previous photo">‹</button>
      <button class="lb-nav lb-next" type="button" onclick={next} aria-label="Next photo">›</button>
    {/if}

    <div class="lb-stage">
      {#if !loaded && !errored}
        <div class="lb-loading" aria-live="polite">
          <span class="lb-spinner" aria-hidden="true"></span>
          <span class="lb-loading-text">Loading photo<span class="dots-anim"><span></span><span></span><span></span></span></span>
        </div>
      {/if}
      {#if errored}
        <div class="lb-error">Photo failed to load.</div>
      {/if}
      {#key current}
        <img
          class="lb-img"
          class:lb-img-hidden={!loaded || errored}
          src={current}
          {alt}
          draggable="false"
          onload={() => { loaded = true; errored = false; }}
          onerror={() => { errored = true; loaded = false; }}
        />
      {/key}
    </div>
  </div>
</div>

<style>
  .lb-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.92);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    padding: 0.6rem;
    cursor: zoom-out;
  }

  .lb-frame {
    position: relative;
    background: var(--mfd-bg);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 2px;
    padding: 0.5rem;
    width: min(98vw, 1800px);
    height: min(96vh, 1200px);
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
    z-index: 2;
  }
  .lb-close:hover { color: #ff9b9b; border-color: var(--led-red); }
  .lb-close:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }

  .lb-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 44px;
    height: 64px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--mono);
    font-weight: 700;
    font-size: 1.6rem;
    line-height: 1;
    color: var(--label-dim);
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 1px;
    cursor: pointer;
    z-index: 2;
    transition: color 0.15s, border-color 0.15s;
  }
  .lb-nav:hover { color: var(--led-cyan); border-color: var(--led-cyan); }
  .lb-nav:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
  .lb-prev { left: 0.6rem; }
  .lb-next { right: 0.6rem; }

  .lb-stage {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .lb-img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
    background: var(--mfd-bg);
  }
  .lb-img-hidden { visibility: hidden; }

  .lb-loading {
    position: absolute;
    inset: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.65rem;
    font-family: var(--mono);
    font-size: 0.7rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--mfd-text);
  }
  .lb-spinner {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid var(--bezel-hi);
    border-top-color: var(--led-cyan);
    animation: lb-spin 0.85s linear infinite;
  }
  @keyframes lb-spin { to { transform: rotate(360deg); } }
  .lb-loading-text { display: inline-flex; align-items: baseline; }
  .dots-anim { display: inline-flex; gap: 0.18em; margin-left: 0.18em; }
  .dots-anim span {
    width: 0.32em; height: 0.32em;
    border-radius: 50%;
    background: var(--mfd-text);
    opacity: 0.3;
    animation: lb-dot 1s infinite;
  }
  .dots-anim span:nth-child(2) { animation-delay: 0.18s; }
  .dots-anim span:nth-child(3) { animation-delay: 0.36s; }
  @keyframes lb-dot {
    0%, 60%, 100% { opacity: 0.3; }
    30%           { opacity: 1; }
  }

  .lb-error {
    position: absolute;
    inset: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--mono);
    font-size: 0.75rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--led-red);
  }
</style>
