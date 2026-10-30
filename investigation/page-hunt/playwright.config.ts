import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
export default defineConfig({
  testDir: './repro', workers: 1, fullyParallel: false, timeout: 180_000,
  outputDir: './local/playwright', reporter: 'list',
  use: {
    baseURL: process.env.DGM_PAGE_URL ?? 'http://127.0.0.1:5197/dam-good-maps/',
    headless: false, viewport: { width: 1400, height: 900 },
    launchOptions: {
      executablePath: process.env.DGM_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      chromiumSandbox: true,
      args: ['--renderer-process-limit=1', '--num-raster-threads=2'],
      ignoreDefaultArgs: ['--enable-unsafe-swiftshader', '--unsafely-disable-devtools-self-xss-warnings'],
    },
  },
});
