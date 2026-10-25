import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // strictPort: si el 5173 está ocupado, falla en vez de abrirse en otro puerto que la API (CORS) rechazaría.
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    env: { VITE_MOCK_AUTH: 'true' },
  },
});
