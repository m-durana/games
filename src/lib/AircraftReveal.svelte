<script lang="ts">
  import type { Aircraft } from './aircraft';

  interface Props {
    plane: Aircraft;
    correct: boolean;
    photoUrl?: string | null;
  }

  let { plane, correct, photoUrl = null }: Props = $props();
</script>

<div class="reveal" class:correct class:wrong={!correct}>
  <header class="reveal-head">
    <span class="verdict">{correct ? '✓ Correct' : '✗ Wrong'}</span>
    <h3>{plane.name}</h3>
  </header>

  {#if photoUrl}
    <img class="reveal-photo" src={photoUrl} alt={plane.name} loading="lazy" />
  {/if}

  <div class="step">
    <span class="step-num">1</span>
    <div class="step-body">
      <strong>It's a {plane.manufacturer}</strong>
      <p>{plane.identification.manufacturer}</p>
    </div>
  </div>

  <div class="step">
    <span class="step-num">2</span>
    <div class="step-body">
      <strong>It's the {plane.family}</strong>
      <p>{plane.identification.family}</p>
    </div>
  </div>

  <div class="step">
    <span class="step-num">3</span>
    <div class="step-body">
      <strong>Specifically the {plane.name}</strong>
      <p>{plane.identification.variant}</p>
    </div>
  </div>

  <div class="tell">
    <span class="tell-label">Key tell</span>
    <p>{plane.keyTell}</p>
  </div>
</div>

<style>
  .reveal {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 1rem;
    border-radius: 2px;
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .reveal.correct {
    border-color: rgba(34, 197, 94, 0.55);
    background: rgba(34, 197, 94, 0.08);
  }
  .reveal.wrong {
    border-color: rgba(239, 68, 68, 0.45);
    background: rgba(239, 68, 68, 0.06);
  }

  .reveal-head {
    display: flex;
    align-items: baseline;
    gap: 0.625rem;
    flex-wrap: wrap;
  }
  .verdict {
    font-family: var(--font-main);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .reveal.correct .verdict { color: var(--good); }
  .reveal.wrong .verdict { color: var(--bad); }
  .reveal-head h3 {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
  }

  .reveal-photo {
    width: 100%;
    max-height: 220px;
    object-fit: cover;
    border-radius: 1px;
    background: var(--surface-3, var(--surface));
  }

  .step {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
  }
  .step-num {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border-radius: 1px;
    background: var(--accent);
    color: var(--bg);
    font-family: var(--font-main);
    font-size: 0.75rem;
    font-weight: 700;
    display: grid;
    place-items: center;
  }
  .step-body { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
  .step-body strong {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text);
  }
  .step-body p {
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--muted);
  }

  .tell {
    border-top: 1px dashed var(--border);
    padding-top: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .tell-label {
    font-family: var(--font-main);
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--accent);
  }
  .tell p {
    font-size: 0.8125rem;
    line-height: 1.4;
    color: var(--text);
  }
</style>
