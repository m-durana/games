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

  <div class="footer">
    <button class="ghost" type="button" onclick={onCancel}>Back</button>
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
    <div class="right-actions">
      {#if i > 0}
        <button class="ghost" type="button" onclick={prev}>Previous</button>
      {/if}
      <button class="primary" type="button" onclick={next}>
        {last ? 'Start round' : 'Next'}
      </button>
    </div>
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
    gap: 0.7rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--bezel-lo);
  }
  .intro-tag {
    font-family: var(--mono);
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: var(--led-cyan);
    background: var(--panel-2);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 1px;
    padding: 0.18rem 0.55rem;
    font-weight: 700;
  }
  .intro-head h2 {
    flex: 1;
    font-family: var(--sans);
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--label);
    letter-spacing: -0.005em;
  }
  .skip {
    font-family: var(--mono);
    font-size: 0.62rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--label-dim);
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 1px;
    padding: 0.4rem 0.75rem;
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s;
  }
  .skip:hover { color: var(--led-cyan); border-color: var(--led-cyan); }
  .skip:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }

  .slide {
    position: relative;
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    border-radius: 2px;
    padding: 1.1rem 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    min-height: 240px;
  }
  .slide h3 {
    font-family: var(--sans);
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--label);
    letter-spacing: -0.005em;
  }
  .body {
    color: var(--label-2);
    font-family: var(--sans);
    font-size: 0.88rem;
    line-height: 1.55;
  }
  .body :global(strong) { color: var(--led-cyan); font-weight: 700; }
  .body :global(em) { color: var(--led-amber); font-style: normal; font-weight: 700; }

  .single-img {
    width: 100%;
    aspect-ratio: 16 / 9;
    background: var(--mfd-bg);
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
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
    gap: 0.55rem;
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
    background: var(--panel-2);
    border: 1px solid var(--bezel-lo);
    border-radius: 1px;
    overflow: hidden;
  }
  figure img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: contain;
    background: var(--mfd-bg);
    display: block;
  }
  figcaption {
    font-family: var(--mono);
    font-size: 0.66rem;
    letter-spacing: 0.06em;
    color: var(--label-dim);
    text-align: center;
    padding: 0.3rem 0.4rem 0.45rem;
    line-height: 1.3;
  }

  .footer {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 0.6rem;
  }
  .footer .ghost:first-child { justify-self: start; }
  .right-actions { display: inline-flex; align-items: center; gap: 0.5rem; justify-self: end; }

  .dots {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.45rem;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--led-off);
    border: 1px solid var(--bezel-lo);
    padding: 0;
    cursor: pointer;
    transition: background 0.15s;
  }
  .dot:hover { background: var(--bezel-hi); }
  .dot.active { background: var(--led-cyan); border-color: var(--led-cyan); }

  .footer button {
    font-family: var(--mono);
    font-weight: 700;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    border-radius: 1px;
    padding: 0.55rem 0.95rem;
    cursor: pointer;
  }
  .footer .dot { padding: 0; }
  .ghost {
    background: var(--panel);
    border: 1px solid var(--bezel-hi);
    border-bottom-color: var(--bezel-lo);
    border-right-color: var(--bezel-lo);
    color: var(--label-dim);
  }
  .ghost:hover { color: var(--led-cyan); border-color: var(--led-cyan); }
  .ghost:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
  .primary {
    background: var(--panel);
    border: 1px solid var(--led-cyan);
    color: var(--led-cyan);
  }
  .primary:hover { color: #b0ecf6; border-color: #b0ecf6; background: rgba(96, 216, 240, 0.08); }
  .primary:active { border-color: var(--bezel-lo); border-bottom-color: var(--bezel-hi); border-right-color: var(--bezel-hi); }
</style>
