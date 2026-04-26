<script lang="ts">
  import { logoUrl } from './engine';

  interface Props {
    iata: string;
    name: string;
    big?: boolean;
  }

  let { iata, name, big = false }: Props = $props();

  let failed = $state(false);
  let loaded = $state(false);

  function initials(s: string) {
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
</script>

<div class="logo" class:big aria-hidden="true">
  {#if failed}
    <span class="mono">{iata || initials(name)}</span>
  {:else}
    {#if !loaded}
      <span class="skeleton"></span>
    {/if}
    <img
      src={logoUrl(iata)}
      alt=""
      loading="lazy"
      class:visible={loaded}
      onload={() => (loaded = true)}
      onerror={() => (failed = true)}
    />
  {/if}
</div>

<style>
  .logo {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
    padding: 4px;
  }
  .logo img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    opacity: 0;
    transition: opacity 0.18s ease;
  }
  .logo img.visible { opacity: 1; }
  .skeleton {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, #f1f1f3 0%, #e4e4e7 50%, #f1f1f3 100%);
    background-size: 200% 100%;
    animation: shimmer 1.2s ease-in-out infinite;
  }
  @keyframes shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  .logo .mono {
    color: #0e0e10;
    font-weight: 700;
    font-size: 0.875rem;
    letter-spacing: 0.02em;
  }
  .logo.big {
    width: clamp(140px, 50vw, 200px);
    height: clamp(140px, 50vw, 200px);
    border-radius: 24px;
    padding: 1.25rem;
  }
  .logo.big .mono {
    font-size: 2.5rem;
  }
</style>
