import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const appMode = env.VITE_APP_MODE ?? process.env.VITE_APP_MODE ?? 'local';

  return {
    plugins: [react()],
    base: env.VITE_BASE_PATH ?? process.env.VITE_BASE_PATH ?? '/',
    build: {
      outDir: appMode === 'cloud' ? 'dist-cloud' : 'dist-local',
      emptyOutDir: true,
    },
    server: {
      proxy: {
        '/api': {
          target:
            env.NEXT_CLASS_DEV_API ??
            process.env.NEXT_CLASS_DEV_API ??
            'http://127.0.0.1:17800',
        },
      },
    },
  };
});
