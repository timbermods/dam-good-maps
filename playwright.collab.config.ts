import { defineConfig } from "@playwright/test";

// The connection test for collaborative editing (tests/collab, .github/workflows/collab.yml): the room-code function
// run by wrangler, a local TURN relay and two separate browser processes. No web server of the app's: the test starts
// its own stack (tests/collab/localStack.ts). Locally the browsers are the installed Chrome and Edge; CI installs
// Chromium and Firefox. The test against the deployed function (live.spec.ts) has its own config.
export default defineConfig({
  testDir: "tests/collab",
  testIgnore: /live\.spec\.ts/,
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
});
