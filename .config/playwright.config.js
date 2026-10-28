import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const baseURL = `http://127.0.0.1:${process.env.PAGECORE_TEST_PORT || 4173}`;

export default defineConfig({
  testDir: '../tests/browser',
  outputDir: '../.runtime/browser-tests',
  workers: 1,
  retries: 0,
  use: {
    channel: 'msedge',
    headless: true,
    baseURL,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve-preview.mjs',
    cwd: projectRoot,
    url: baseURL,
    reuseExistingServer: false,
  },
});
