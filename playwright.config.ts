import { defineConfig } from "@playwright/test";

// The e2e tests run against the production build, served under the same base as GitHub Pages.
// Locally they use the installed Chrome (channel "chrome"); CI installs Playwright's Chromium.
// CI serves them on 4173. Off CI each checkout gets its own port from its folder's path (DGM_E2E_PORT
// overrides it), and builds its own server for each run: a server already up on the port is reused
// only with DGM_E2E_REUSE=1. With some 90 worktrees two paths can share a port, and a reused server
// could be another worktree's old build (2026-10-25); without reuse, a taken port fails the run at
// once, saying so.
// The build is made in the "e2e" mode, which shows what the preview shows (the forces, before
// their release: src/editor/release.ts); a second build, as the public site is built, is served
// beside it under public-build/ for the checks of what the public site hides.
const channel = process.env.PW_CHANNEL ?? (process.env.CI ? undefined : "chrome");
// (the ports Chrome refuses in that range, net::ERR_UNSAFE_PORT: a checkout landing on one takes the next)
const UNSAFE_PORTS = new Set([4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697]);
const checkoutPort = () => {
  let p = 4174 + ([...process.cwd().toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 5000);
  while (UNSAFE_PORTS.has(p)) p++;
  return p;
};
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
    // otherwise pick the High look by itself (D284); look-high.spec.ts clears it to try High. The first-keep note marked
    // as shown: up for 8 s over the view's middle after a test's first edit, it takes the clicks and hovers meant for
    // the map (dev's run 40766826335); generate-new-map.spec.ts clears it to check the note
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://localhost:${port}`,
          localStorage: [
            { name: "dgm.look", value: "standard" },
            { name: "dgm.keptNote", value: "1" },
          ],
        },
      ],
    },
  },
  webServer: {
    command: `npx vite build --mode e2e && npx vite build --base /dam-good-maps/public-build/ --outDir dist/public-build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}/dam-good-maps/`,
    reuseExistingServer: !process.env.CI && process.env.DGM_E2E_REUSE === "1",
    // the two builds take minutes on a loaded machine
    timeout: process.env.CI ? 180_000 : 600_000,
    env: { DGM_BASE: "/dam-good-maps/" },
  },
});
