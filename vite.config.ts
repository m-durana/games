import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  base: '/games/',
  build: {
    outDir: '/var/www/miro/games',
    emptyOutDir: true,
  },
})
