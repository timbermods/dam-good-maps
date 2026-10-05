import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', workers: 1, fullyParallel: false,
  timeout: 180_000, retries: 0, reporter: 'list',
  outputDir: 'local/test-results',
  use: {
    baseURL: process.env.DGM_PAGE_URL ?? 'http://127.0.0.1:52763/dam-good-maps/',
    headless: false, viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath: process.env.DGM_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--renderer-process-limit=1', '--num-raster-threads=2'] },
  },
});
