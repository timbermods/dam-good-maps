import { defineConfig } from "@playwright/test";

// The e2e tests run against the production build, served under the same base as GitHub Pages.
// Locally they use the installed Chrome (channel "chrome"); CI installs Playwright's Chromium.
// CI serves them on 4173. Off CI each checkout gets its own port from its folder's path, because the
// server is reused when one is up: on a shared port, one worktree's tests would run against another's
// build. DGM_E2E_PORT overrides it.
// The build is made in the "e2e" mode, which shows what the preview shows (the forces, before
// their release: src/editor/release.ts); a second build, as the public site is built, is served
// beside it under public-build/ for the checks of what the public site hides.
const channel = process.env.PW_CHANNEL ?? (process.env.CI ? undefined : "chrome");
const checkoutPort = () => 4174 + ([...process.cwd().toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 800);
const port = Number(process.env.DGM_E2E_PORT ?? (process.env.CI ? 4173 : checkoutPort()));

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  fullyParallel: false,
  // off CI, two workers at most (DGM_E2E_WORKERS overrides): the machine is shared by several sessions' agents
  workers: process.env.CI ? undefined : Number(process.env.DGM_E2E_WORKERS ?? 2),
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    baseURL: `http://localhost:${port}/dam-good-maps/`,
    channel,
    // the Standard look, held: the tests of the look check Standard's colours, and a GPU would
    // otherwise pick the High look by itself (D284); look-high.spec.ts clears it to try High
    storageState: { cookies: [], origins: [{ origin: `http://localhost:${port}`, localStorage: [{ name: "dgm.look", value: "standard" }] }] },
  },
  webServer: {
    command: `npx vite build --mode e2e && npx vite build --base /dam-good-maps/public-build/ --outDir dist/public-build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}/dam-good-maps/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { DGM_BASE: "/dam-good-maps/" },
  },
});
