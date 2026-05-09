import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'node:url'
import { cpSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

// Source-of-truth mockup lives at ./mockup. Vite's emptyOutDir wipes the
// deployed copy on every build, so we recopy it in closeBundle.
const __dir = dirname(fileURLToPath(new URL(import.meta.url)));
const copyMockup = () => ({
  name: 'copy-mockup',
  closeBundle() {
    const src = resolve(__dir, 'mockup');
    const dst = '/var/www/miro/games/flight-deck/mockup';
    if (existsSync(src)) cpSync(src, dst, { recursive: true });
  },
});

export default defineConfig({
  plugins: [svelte(), copyMockup()],
  base: '/games/flight-deck/',
  resolve: {
    alias: {
      'radarscope/svelte': fileURLToPath(new URL('./node_modules/radarscope/dist/svelte/index.js', import.meta.url)),
    },
  },
  build: {
    outDir: '/var/www/miro/games/flight-deck',
    emptyOutDir: true,
  },
})
