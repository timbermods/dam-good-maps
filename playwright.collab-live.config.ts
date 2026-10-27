import { defineConfig } from "@playwright/test";

// The connection test against the deployed function and the real Cloudflare relay (tests/collab/live.spec.ts,
// .github/workflows/collab-live.yml, run by hand once Kyler's Cloudflare secrets exist). DGM_COLLAB_LIVE_URL is the
// function's address.
export default defineConfig({
  testDir: "tests/collab",
  testMatch: /live\.spec\.ts/,
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
});
