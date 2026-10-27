// The delivery spike (roadmap M3, docs/spike-m3.md): the artifact edition's single-file page runs
// the generator in a blob worker under the artifact's content security policy and opens a .timber
// through its file input. The page is served from an https origin with the policy as a header; the
// checks that need the Claude viewer (saving, sampling, sharing) are Kyler's (docs/progress.md).

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

const CSP =
  "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net/npm/ https://cdn.tailwindcss.com https://code.jquery.com; " +
  "style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: blob:; connect-src 'self'; worker-src blob:";

// Skipped (PLAN §20 D452, with D277): the water runs only in Rust's WebAssembly now (D381), which the
// artifact's policy refuses, so the spike can't settle a map there. The artifact edition is Claude work,
// deferred to M12 with the rest (D277); this test comes back with it.
test.skip(true, "the artifact's policy refuses WebAssembly, and the water is Rust's (D452, D277)");

test.beforeAll(() => {
  execSync("npx tsx tools/build-spike.ts", { stdio: "inherit" });
});

test("the spike page generates in a blob worker and opens a .timber under the artifact CSP", async ({ page }) => {
  const node = generate(makeSpec({ seed: 4242, size: { x: 96, y: 96 } }));
  mkdirSync("test-results/spike", { recursive: true });
  const path = "test-results/spike/River Valley (4242).timber";
  writeFileSync(path, node.bytes);
  const html = readFileSync("dist-spike/local.html", "utf8");
  await page.route("https://spike.dam-good-maps.test/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", headers: { "content-security-policy": CSP }, body: html }),
  );
  await page.goto("https://spike.dam-good-maps.test/");
  await expect(page.locator('[data-chip="worker"]')).toHaveAttribute("data-state", "pass", { timeout: 120_000 });
  const results = async () => JSON.parse((await page.textContent("#results-json")) ?? "{}");
  // the browser's generator in the blob worker makes the Node file, byte for byte
  expect((await results()).worker.generate.sha256).toBe(createHash("sha256").update(node.bytes).digest("hex"));
  await page.setInputFiles("#timber-file", path);
  await expect(page.locator('[data-chip="open"]')).toHaveAttribute("data-state", "pass", { timeout: 60_000 });
  const r = await results();
  expect(r.open).toMatchObject({ ok: true, via: "file input", size: "96×96", layers: 23, entities: node.built.entities.length, changes: [] });
  expect(r.open.loadChecks.failed).toEqual([]);
  // the artifact rules let the page reach only its own origin
  expect(r.environment.messagesApi).toMatch(/^blocked/);
});
