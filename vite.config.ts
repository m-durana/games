import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [svelte()],
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
