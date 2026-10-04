// The file a player downloads is the generator's file (D7, PLAN §19.7): for a freshly generated map, File →
// Download .timber in the editor gives exactly the bytes tools/gen.ts makes for the same seed, size and theme,
// under the same name. The live check reads the made map's sha256 from a test hook; this checks the file itself.

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { encodeSpecFragment, makeSpec } from "../../src/core/spec/mapspec";
import { expectReady, openEditor, openFileMenu } from "./open";

const SEED = 4242;
const SIZE = 128;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

test("File → Download .timber on a freshly generated map gives exactly the file tools/gen.ts makes", async ({ page }) => {
  test.setTimeout(600_000);
  // tools/gen.ts's own file for the spec (River Valley, Normal, default settings)
  const out = join(".scratch", "download-gen");
  rmSync(out, { recursive: true, force: true });
  execSync(`npx tsx tools/gen.ts --seeds ${SEED} --sizes ${SIZE} --out ${out} --quiet`, { encoding: "utf8" });
  const dir = join(out, String(SIZE));
  const files = readdirSync(dir).filter((f) => f.endsWith(".timber"));
  expect(files, "tools/gen.ts writes one .timber").toHaveLength(1);
  const gen = { name: files[0], sha: sha256(readFileSync(join(dir, files[0]))) };

  const spec = makeSpec({ seed: SEED, size: { x: SIZE, y: SIZE }, designedFor: "normal" });
  await openEditor(page, encodeSpecFragment(spec), { timeout: 300_000 });
  await expectReady(page, 300_000);
  const menu = await openFileMenu(page);
  const download = page.waitForEvent("download", { timeout: 120_000 });
  await menu.getByRole("menuitem", { name: "Download .timber" }).click();
  const d = await download;
  expect(d.suggestedFilename(), "the downloaded file's name").toBe(gen.name);
  expect(sha256(readFileSync((await d.path())!)), "the downloaded file's sha256 against tools/gen.ts's").toBe(gen.sha);
});
