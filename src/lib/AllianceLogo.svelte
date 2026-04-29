<script lang="ts">
  interface Props {
    alliance: string;
    size?: number;
  }

  let { alliance, size = 28 }: Props = $props();

  type Style = { bg: string; fg: string; symbol: string };

  const styles: Record<string, Style> = {
    'Star Alliance': { bg: '#0a2c5a', fg: '#ffffff', symbol: '★' },
    'Oneworld': { bg: '#1a1a1a', fg: '#ffffff', symbol: '◉' },
    'SkyTeam': { bg: '#c8102e', fg: '#ffffff', symbol: '✈' },
    'Independent': { bg: '#2e2e33', fg: '#9aa0a6', symbol: ' - ' },
  };

  const s = $derived(styles[alliance] ?? styles['Independent']);
</script>

<span
  class="badge"
  style="background: {s.bg}; color: {s.fg}; width: {size}px; height: {size}px; font-size: {size * 0.55}px;"
  aria-hidden="true"
>{s.symbol}</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    flex-shrink: 0;
    font-weight: 600;
    line-height: 1;
  }
</style>
