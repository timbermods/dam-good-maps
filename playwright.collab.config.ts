import { defineConfig } from "@playwright/test";

// The connection test for collaborative editing (tests/collab, .github/workflows/collab.yml): the room-code function
// run by wrangler, a local TURN relay and two separate browser processes. No web server of the app's: the test starts
// its own stack (tests/collab/localStack.ts). Locally the browsers are the installed Chrome and, when Playwright's
// Firefox is not installed, Edge; CI installs Chromium and Firefox.
export default defineConfig({
  testDir: "tests/collab",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
});
