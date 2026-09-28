// The live check (.github/workflows/live-check.yml): the deployed site loads without page or console
// errors, is noindex until launch (DGM_PUBLIC), and its download for seed 4242 at 128² River Valley,
// Normal, default settings, is the file tools/gen.ts makes from the checked-out commit, byte for
// byte. Real places: a map downloaded from the live gallery is the file its deployed index records,
// which is the checked-out commit's, and the credits page loads. Pages can take a few minutes to
// serve a new build, so a failed attempt is retried before the check fails. It checks the main site
// only: a preview build under /preview/ (deploy.yml) is not part of the release and is never
// checked here.
//
//   npx playwright test -c playwright.live.config.ts

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { PlaceIndex } from "../../src/core/places/place";
import { encodeSpecFragment, makeSpec } from "../../src/core/spec/mapspec";

const SEED = 4242;
const SIZE = 128;
const ATTEMPTS = 6;
const RETRY_MS = 30_000;
const NOINDEX = 'meta[name="robots"][content~="noindex"]';

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** The file tools/gen.ts makes for the spec, and its sha256. */
function fromGen(): { name: string; sha: string } {
  const out = join(".scratch", "live-gen");
  rmSync(out, { recursive: true, force: true });
  const log = execSync(`npx tsx tools/gen.ts --seeds ${SEED} --sizes ${SIZE} --out ${out}`, { encoding: "utf8" });
  console.log(`tools/gen.ts: ${log.trim()}`);
  const dir = join(out, String(SIZE));
  const files = readdirSync(dir).filter((f) => f.endsWith(".timber"));
  expect(files, "tools/gen.ts writes one .timber").toHaveLength(1);
  return { name: files[0], sha: sha256(readFileSync(join(dir, files[0]))) };
}

test("the live site's download is the file tools/gen.ts makes", async ({ page }) => {
  const gen = fromGen();
  const title = /<title>([^<]*)<\/title>/.exec(readFileSync("index.html", "utf8"))?.[1] ?? "";
  const notPublic = process.env.DGM_PUBLIC !== "true";
  const fragment = encodeSpecFragment(makeSpec({ seed: SEED, size: { x: SIZE, y: SIZE }, theme: "riverValley", designedFor: "normal" }));

  let errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console error: ${m.text()}`));

  let live = "";
  for (let attempt = 1; ; attempt++) {
    errors = [];
    live = "";
    try {
      // the query only skips cached copies of the page; the spec is in the fragment
      const res = await page.goto(`./?live=${Date.now()}#${fragment}`);
      expect(res?.status(), "the page's HTTP status").toBe(200);
      await expect(page).toHaveTitle(title);
      await expect(page.locator(NOINDEX), notPublic ? "noindex until launch" : "no noindex after launch").toHaveCount(notPublic ? 1 : 0);
      await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });

      const button = page.getByRole("button", { name: /^Download .*\.timber$/ });
      await expect(button).toBeEnabled();
      const download = page.waitForEvent("download");
      await button.click();
      const d = await download;
      expect(d.suggestedFilename()).toBe(gen.name);
      live = sha256(readFileSync(await d.path()));
      expect(live, "the live download's sha256 (tools/gen.ts's is expected)").toBe(gen.sha);
      expect(errors, "page and console errors").toEqual([]);
      break;
    } catch (e) {
      if (attempt >= ATTEMPTS) throw e;
      console.log(`attempt ${attempt} failed, retrying in ${RETRY_MS / 1000} s: ${String(e).split("\n")[0]}`);
      await page.waitForTimeout(RETRY_MS);
    }
  }
  console.log(`live download  ${live}\ntools/gen.ts   ${gen.sha}\n${gen.name} from ${page.url().replace(/[?#].*$/, "")}`);
});

test("a real place downloads from the live gallery as its index's file, and the credits page loads", async ({ page }) => {
  const notPublic = process.env.DGM_PUBLIC !== "true";
  const ours = JSON.parse(readFileSync("public/real-places/index.json", "utf8")) as PlaceIndex;
  // the smallest map
  const id = [...ours.places].sort((a, b) => a.bytes - b.bytes)[0].id;

  let errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console error: ${m.text()}`));

  let live = "";
  for (let attempt = 1; ; attempt++) {
    errors = [];
    live = "";
    try {
      const index = (await (await page.request.get(`./real-places/index.json?live=${Date.now()}`)).json()) as PlaceIndex;
      const entry = index.places.find((p) => p.id === id);
      expect(entry, `the deployed index lists ${id}`).toBeDefined();
      expect(entry!.sha256, "the deployed index is the checked-out commit's").toBe(ours.places.find((p) => p.id === id)!.sha256);

      const res = await page.goto(`./real-places/?live=${Date.now()}&size=${entry!.size}`);
      expect(res?.status(), "the gallery's HTTP status").toBe(200);
      await expect(page.locator(NOINDEX), notPublic ? "noindex until launch" : "no noindex after launch").toHaveCount(notPublic ? 1 : 0);
      const download = page.waitForEvent("download");
      await page.getByRole("link", { name: `Download ${entry!.name}` }).click();
      const d = await download;
      expect(d.suggestedFilename()).toBe(`${entry!.name}.timber`);
      const bytes = readFileSync(await d.path());
      live = sha256(bytes);
      expect(live, "the live download's sha256 (the deployed index's is expected)").toBe(entry!.sha256);
      expect(bytes.length).toBe(entry!.bytes);

      const credits = await page.goto(`./real-places/credits/?live=${Date.now()}`);
      expect(credits?.status(), "the credits page's HTTP status").toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: "Real places credits" })).toBeVisible();
      await expect(page.locator("#credits").getByRole("listitem").first()).toBeVisible();
      await expect(page.locator(NOINDEX)).toHaveCount(notPublic ? 1 : 0);
      expect(errors, "page and console errors").toEqual([]);
      break;
    } catch (e) {
      if (attempt >= ATTEMPTS) throw e;
      console.log(`attempt ${attempt} failed, retrying in ${RETRY_MS / 1000} s: ${String(e).split("\n")[0]}`);
      await page.waitForTimeout(RETRY_MS);
    }
  }
  console.log(`live real place ${id}: ${live}`);
});
