import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
  build: {
    // Place the production bundle where the Express server can serve it.
    // In dev (vite dev server) this has no effect.
    outDir: '../../apps/server/public',
    emptyOutDir: true,
  },
});
