import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The client lives in /client and is built into dist/client, which the
// Express server serves in production. In dev, /api is proxied to Express.
export default defineConfig({
  root: 'client',
  // Read .env / .env.local from the project root (where `npx convex dev` writes VITE_CONVEX_URL).
  envDir: '..',
  plugins: [react()],
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});
