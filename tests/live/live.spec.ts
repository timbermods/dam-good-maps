// The live check (.github/workflows/live-check.yml): the deployed site loads without page or console
// errors, is noindex until launch (DGM_PUBLIC), and the map its link makes for seed 4242 at 128² River Valley,
// Normal, default settings, is the file tools/gen.ts makes from the checked-out commit, byte for
// byte. Pages can take a few minutes to serve a new build, so a failed attempt is retried before the
// check fails. It checks the main site only: a preview build under /preview/ (deploy.yml) is not
// part of the release and is never checked here.
//
//   npx playwright test -c playwright.live.config.ts

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
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
      // the page is the editor (D330): the link's map is made and opens in the editor; the page's hook gives the
      // made .timber's sha256 (the file the link makes, before any edit)
      const made = await page.waitForFunction(() => (window as unknown as { dgm?: { current?(): { sha256: string; passed: boolean } | null } }).dgm?.current?.() ?? null, null, { timeout: 120_000 });
      const shown = (await made.jsonValue()) as { sha256: string; passed: boolean };
      expect(shown.passed, "the link's map passes its checks").toBe(true);
      live = shown.sha256;
      expect(live, "the live map's sha256 (tools/gen.ts's is expected)").toBe(gen.sha);
      expect(errors, "page and console errors").toEqual([]);
      break;
    } catch (e) {
      if (attempt >= ATTEMPTS) throw e;
      console.log(`attempt ${attempt} failed, retrying in ${RETRY_MS / 1000} s: ${String(e).split("\n")[0]}`);
      await page.waitForTimeout(RETRY_MS);
    }
  }
  console.log(`live map       ${live}\ntools/gen.ts   ${gen.sha}\n${gen.name} from ${page.url().replace(/[?#].*$/, "")}`);
});
