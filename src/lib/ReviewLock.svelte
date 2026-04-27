<script lang="ts">
  interface Props {
    label: string;
    onUnlock: (pin: string) => boolean;
    onHome: () => void;
  }

  let { label, onUnlock, onHome }: Props = $props();
  let pin = $state('');
  let error = $state('');

  function submit() {
    if (onUnlock(pin)) return;
    error = 'Wrong PIN';
    pin = '';
  }
</script>

<section class="lock">
  <h1>{label}</h1>
  <p>Enter the review PIN to continue.</p>
  <form onsubmit={(e) => { e.preventDefault(); submit(); }}>
    <input type="password" bind:value={pin} autocomplete="current-password" />
    <button type="submit">Unlock</button>
  </form>
  {#if error}<p class="err">{error}</p>{/if}
  <button class="ghost" type="button" onclick={onHome}>Back home</button>
</section>

<style>
  .lock {
    margin: auto 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
  }
  h1 { font-size: 1.5rem; color: var(--accent); }
  p { color: var(--muted); }
  form { display: flex; gap: 0.5rem; }
  input {
    flex: 1;
    min-width: 0;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    padding: 0.7rem 0.8rem;
    font: inherit;
  }
  button {
    background: var(--accent);
    color: var(--bg);
    border-radius: 6px;
    padding: 0.7rem 0.9rem;
    font-weight: 600;
  }
  .ghost {
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--border);
  }
  .err { color: var(--bad); }
</style>
