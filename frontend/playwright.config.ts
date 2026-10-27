import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const python = path.join(root, '.venv', 'Scripts', 'python.exe');
const fixture = path.join(root, 'scripts', 'dev_fixture_server.py');
const cloudFixture = path.join(root, 'scripts', 'dev_cloud_fixture_server.py');

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:17999',
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
  },
  webServer: [
    {
      command: `"${python}" "${fixture}" --port 17999`,
      url: 'http://127.0.0.1:17999/api/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: `"${python}" "${cloudFixture}" --port 17998`,
      url: 'http://127.0.0.1:17998/',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
