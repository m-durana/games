<script lang="ts">
  import IntroRadarDemo from './IntroRadarDemo.svelte';

  export interface IntroImage {
    id?: string;
    src: string;
    caption?: string;
    spec?: string;
    poolKind?: 'aircraft' | 'military';
    pool?: string[];
  }
  export interface IntroSlide {
    title: string;
    body: string;
    image?: string;
    images?: IntroImage[];
    scene?: import('./IntroRadarDemo.svelte').SceneKey;
    sceneCaption?: string;
  }

  interface Props {
    title: string;
    slides: IntroSlide[];
    onStart: () => void;
    onCancel: () => void;
  }

  let { title, slides, onStart, onCancel }: Props = $props();

  let i = $state(0);
  const last = $derived(i === slides.length - 1);
  const slide = $derived(slides[i]);

  function next() {
    if (last) onStart();
    else i += 1;
  }
  function prev() {
    if (i > 0) i -= 1;
  }

  function fullSizeUrl(u: string): string | null {
    if (!u) return null;
    return u.replace('/commons/thumb/', '/commons/').replace(/\/\d{1,5}px-[^/]+$/, '');
  }
  function onImgError(e: Event) {
    const img = e.currentTarget as HTMLImageElement | null;
    if (!img) return;
    const full = fullSizeUrl(img.src);
    if (full && full !== img.src) img.src = full;
  }
</script>

<div class="intro-wrap">
  <header class="intro-head">
    <div class="intro-tag">Guide</div>
    <h2>{title}</h2>
    <button class="skip" type="button" onclick={onStart}>Skip</button>
  </header>

  <div class="slide">
    <h3>{slide.title}</h3>
    {#if slide.scene}
      <IntroRadarDemo scene={slide.scene} caption={slide.sceneCaption} />
    {/if}
    {#if slide.image}
      <div class="single-img">
        <img src={slide.image} alt="" loading="lazy" onerror={onImgError} referrerpolicy="no-referrer" />
      </div>
    {/if}
    {#if slide.images && slide.images.length > 0}
      <div class="grid" class:two={slide.images.length === 2} class:three={slide.images.length === 3} class:four={slide.images.length >= 4}>
        {#each slide.images as img}
          <figure>
            <img src={img.src} alt={img.caption ?? ''} loading="lazy" onerror={onImgError} referrerpolicy="no-referrer" />
            {#if img.caption}<figcaption>{img.caption}</figcaption>{/if}
          </figure>
        {/each}
      </div>
    {/if}
    <p class="body">{@html slide.body}</p>
  </div>

  <div class="dots" role="tablist" aria-label="Guide progress">
    {#each slides as _, idx}
      <button
        type="button"
        class="dot"
        class:active={idx === i}
        aria-label={`Slide ${idx + 1}`}
        onclick={() => (i = idx)}
      ></button>
    {/each}
  </div>

  <div class="controls">
    <button class="ghost" type="button" onclick={onCancel}>Back</button>
    <div class="spacer"></div>
    {#if i > 0}
      <button class="ghost" type="button" onclick={prev}>Previous</button>
    {/if}
    <button class="primary" type="button" onclick={next}>
      {last ? 'Start round' : 'Next'}
    </button>
  </div>
</div>

<style>
  .intro-wrap {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding-bottom: 1rem;
  }
  .intro-head {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  .intro-tag {
    font-size: 0.625rem;
    font-family: var(--font-main);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--accent);
    background: var(--surface-2);
    border: 1px solid rgba(39, 76, 119, 0.28);
    border-radius: 4px;
    padding: 0.15rem 0.5rem;
    font-weight: 600;
  }
  .intro-head h2 {
    flex: 1;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text);
    letter-spacing: 0.01em;
  }
  .skip {
    font-size: 0.75rem;
    color: var(--muted);
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.3rem 0.6rem;
    transition: color 0.12s, border-color 0.12s;
  }
  .skip:hover { color: var(--accent); border-color: var(--panel-line); }

  .slide {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 240px;
  }
  .slide h3 {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text);
  }
  .body {
    color: var(--text);
    font-size: 0.875rem;
    line-height: 1.5;
  }
  .body :global(strong) { color: var(--accent); font-weight: 600; }
  .body :global(em) { color: var(--accent-2); font-style: normal; font-weight: 600; }

  .single-img {
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #0a0a0c;
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .single-img img {
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
  }

  .grid {
    display: grid;
    gap: 0.5rem;
    grid-template-columns: 1fr;
  }
  .grid.two { grid-template-columns: 1fr 1fr; }
  .grid.three { grid-template-columns: repeat(3, 1fr); }
  .grid.four { grid-template-columns: repeat(2, 1fr); }
  @media (min-width: 640px) {
    .grid.four { grid-template-columns: repeat(4, 1fr); }
  }
  figure {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    background: var(--surface-2);
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  figure img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: contain;
    background: #0a0a0c;
    display: block;
  }
  figcaption {
    font-size: 0.6875rem;
    color: var(--muted);
    text-align: center;
    padding: 0.3rem 0.4rem 0.45rem;
    line-height: 1.25;
  }

  .dots {
    display: flex;
    justify-content: center;
    gap: 0.4rem;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 4px;
    background: var(--border);
    border: none;
    padding: 0;
    transition: background 0.15s, transform 0.15s;
  }
  .dot.active { background: var(--accent); transform: scale(1.25); }

  .controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .spacer { flex: 1; }
  .controls button {
    border-radius: 4px;
    padding: 0.55rem 0.85rem;
    font-size: 0.85rem;
    font-family: var(--font-main);
    font-weight: 600;
  }
  .ghost {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--muted);
  }
  .ghost:hover { color: var(--accent); border-color: var(--panel-line); }
  .primary {
    background: var(--accent);
    color: var(--bg);
    border: 1px solid var(--accent);
  }
  .primary:hover { filter: brightness(1.05); }
</style>
