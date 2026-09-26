import { defineConfig } from "@playwright/test";

// The e2e tests run against the production build, served under the same base as GitHub Pages.
// Locally they use the installed Chrome (channel "chrome"); CI installs Playwright's Chromium.
// DGM_E2E_PORT serves them on another port, when 4173 is taken (another checkout's tests).
// The build is made in the "e2e" mode, which shows what the preview shows (the forces, before
// their release: src/editor/release.ts); a second build, as the public site is built, is served
// beside it under public-build/ for the checks of what the public site hides.
const channel = process.env.PW_CHANNEL ?? (process.env.CI ? undefined : "chrome");
const port = Number(process.env.DGM_E2E_PORT ?? 4173);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  fullyParallel: false,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}/dam-good-maps/`,
    channel,
  },
  webServer: {
    command: `npx vite build --mode e2e && npx vite build --base /dam-good-maps/public-build/ --outDir dist/public-build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}/dam-good-maps/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { DGM_BASE: "/dam-good-maps/" },
  },
});
