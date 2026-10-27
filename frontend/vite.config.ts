import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const mode = process.env.VITE_APP_MODE ?? 'local';

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/',
  build: {
    outDir: mode === 'cloud' ? 'dist-cloud' : 'dist-local',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.NEXT_CLASS_DEV_API ?? 'http://127.0.0.1:17800',
      },
    },
  },
});
