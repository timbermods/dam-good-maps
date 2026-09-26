// ROADMAP M4 acceptance: every investigation map imports, renders and exports unchanged, through
// the page. Each map is opened with the settings page's file input, drawn by the 3D view (its
// chunks, triangles and a screenshot in .scratch/renders, never committed: the maps are not ours
// to share), and exported from the editor without edits. The download must be the file Node's
// session exports, byte for byte, and for voxel-format maps its world.json must be the normalized
// world with the original thumbnail (M3's "exports unchanged" rule, PLAN §19.6). The maps are
// local only (investigation/raw), so CI skips this.

import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { expect, test } from "@playwright/test";
import { MapSession } from "../../src/core/doc/session";
import { normalizeImport } from "../../src/core/format/normalize";
import { readTimber } from "../../src/core/format/timber";
import { encodeWorld } from "../../src/core/format/world";

const RAW = "investigation/raw";
const list = (dir: string) => (existsSync(join(RAW, dir)) ? readdirSync(join(RAW, dir)).filter((f) => f.endsWith(".timber")).map((f) => join(RAW, dir, f)) : []);
const maps = [...list("builtin"), ...list("workshop"), ...list("user")];
const worldText = (bytes: Uint8Array) => strFromU8(unzipSync(bytes)["world.json"]).replace(/^\uFEFF/, "");
const isLegacy = (bytes: Uint8Array) => /"TerrainMap":\{"Heights"/.test(worldText(bytes));

test.describe("every investigation map imports, renders and exports unchanged (local only)", () => {
  test.skip(maps.length === 0, "the investigation maps are not here (they stay local)");

  test("there are 32 of them: 30 voxel-format maps and the two 0.6 maps", () => {
    const legacy = maps.filter((p) => isLegacy(new Uint8Array(readFileSync(p))));
    expect(maps.length).toBe(32);
    expect(legacy.length).toBe(2);
  });

  for (const path of maps) {
    const name = path.replace(/^.*[\\/]/, "");
    test(name, async ({ page }) => {
      const bytes = new Uint8Array(readFileSync(path));
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(m.text()));
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("./#s=1&z=96&d=n&t=riverValley");
      await expect(page.getByText(/checks passed|checks failed/)).toBeVisible({ timeout: 60_000 });

      // import
      await page.getByLabel("Open a map or a project file in the editor").setInputFiles(path);
      await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 120_000 });
      const info = await page.evaluate(() => window.dgmEditor!.info());
      const node = MapSession.importMap(bytes, name);
      expect(info.kind).toBe("import");
      expect([info.W, info.H]).toEqual([node.size.x, node.size.y]);

      // render: every chunk meshed, triangles drawn, objects instanced
      const build = await page.evaluate(() => window.dgm3d!.build);
      const drawn = await page.evaluate(() => window.dgm3d!.renderer.info());
      expect(build.chunks).toBe(Math.ceil(info.W / 32) * Math.ceil(info.H / 32));
      expect(build.terrainQuads).toBeGreaterThan(0);
      expect(drawn.triangles).toBeGreaterThan(0);
      expect(build.instances).toBeGreaterThan(0);
      mkdirSync(".scratch/renders", { recursive: true });
      await page.screenshot({ path: `.scratch/renders/${name.replace(/\.timber$/, "")}.png` });
      console.log(`${name}: ${info.W}×${info.H}, ${build.terrainQuads} terrain quads, ${build.waterQuads} water quads, ${build.instances} objects, ${drawn.triangles} triangles, built in ${Math.round(build.ms)} ms`);

      // export without edits: nothing blocks, nothing worth a look
      await expect(page.getByRole("button", { name: /^Checks: Ready to play/ })).toBeVisible({ timeout: 120_000 });
      const download = page.waitForEvent("download", { timeout: 120_000 });
      await page.getByRole("button", { name: "More", exact: true }).click();
      await page.getByRole("menuitem", { name: "Download .timber" }).click();
      const d = await download;
      expect(d.suggestedFilename()).toBe(name);
      const out = new Uint8Array(readFileSync(await d.path()));

      // unchanged: the browser's export is Node's, byte for byte
      const expected = node.exportTimber().bytes;
      expect(Buffer.from(out).equals(Buffer.from(expected))).toBe(true);
      if (!isLegacy(bytes)) {
        // M3's rule: the normalized world byte for byte, with the original thumbnail
        const file = readTimber(bytes);
        normalizeImport(file);
        expect(worldText(out)).toBe(encodeWorld(file.world));
        expect(Buffer.from(unzipSync(out)["map_thumbnail.jpg"]).equals(Buffer.from(unzipSync(bytes)["map_thumbnail.jpg"]))).toBe(true);
      }
      expect(errors).toEqual([]);
    });
  }
});
