// The brushes on runs (D280 (3)) on the official maps with caves and overhangs: random strokes keep
// every run under a roof, drop no ground the map held, and are refused with their reason when they
// would (the page's stroke shows the same ground falling first); undo gives back the exact runs, an
// incremental build equals a full one, and an unedited map still exports byte for byte. The maps are
// not ours to redistribute, so this runs only where they were copied locally (`DGM_OFFICIAL_MAPS`,
// the main checkout's `.scratch/official`, or `investigation/raw/builtin`); CI runs the same rules on
// a hand-made cave map (strokesOnRuns.test.ts).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import type { BrushParams } from "../../src/core/features/raster/brush";
import { StrokePreview } from "../../src/core/features/raster/strokePreview";
import { groundUnderObjects } from "../../src/core/features/raster/objectGround";
import { ridingPieces } from "../../src/core/features/edits";
import { normalizeImport } from "../../src/core/format/normalize";
import { readTimber } from "../../src/core/format/timber";
import { encodeWorld } from "../../src/core/format/world";
import type { ColumnTerrain } from "../../src/core/terrain/runs";
import { unsupportedVoxels } from "../../src/core/terrain/support";
import { mulberry } from "./brushRandom";
import { randomBrush, STROKE_TOOLS } from "./strokeRandom";

const DIRS = [process.env.DGM_OFFICIAL_MAPS ?? "", ".scratch/official", resolve("../../../.scratch/official"), "investigation/raw/builtin"];
const DIR = DIRS.find((d) => d && existsSync(d)) ?? null;
const mapPath = (name: string) => (DIR ? readdirSync(DIR).filter((f) => f.endsWith(".timber") && f.includes(name)).map((f) => join(DIR, f))[0] : undefined);
const MAPS = ["Hollows", "Canyon", "Pillars"].map((n) => [n, mapPath(n)] as const);

const worldText = (bytes: Uint8Array) => strFromU8(unzipSync(bytes)["world.json"]).replace(/^﻿/, "");
const under = (t: ColumnTerrain, i: number) => t.runs(i).slice(0, Math.max(0, t.runs(i).length - 2));

describe("the brushes on the official maps with caves (local only)", () => {
  for (const [name, path] of MAPS)
    it.skipIf(!path)(`${name}: strokes keep every roofed run, drop nothing, refuse what would fall, and undo exactly`, () => {
      const bytes = new Uint8Array(readFileSync(path!));
      const s = MapSession.importMap(bytes, `${name}.timber`);
      // unedited, it exports its normalized world byte for byte
      const file = readTimber(bytes);
      normalizeImport(file);
      expect(worldText(s.exportTimber().bytes) === encodeWorld(file.world)).toBe(true);
      s.setWaterMode("defer");
      const { x: W, y: H } = s.size;
      const base = s.terrain;
      const fell = unsupportedVoxels(base);
      const roofs = [...s.roofedTiles];
      expect(roofs.length).toBeGreaterThan(100);
      const rand = mulberry(name.length * 97);
      const states: Uint32Array[] = [base.mask.slice()];
      let refused = 0;
      let shaped = 0;
      const stroke = (p: BrushParams, k: string) => {
        // the page's copy first, as the page paints it (the ground under objects a Naturalize leaves,
        // the pieces that ride it, what it records): what it shows falling is what the session refuses
        const shown = s.built.heights.slice();
        const { dabs, ...settings } = p;
        const preview = new StrokePreview(settings, s.terrainState(), shown, W, H, p.tool === "naturalize" ? groundUnderObjects(s.built.entities) : undefined);
        for (let j = 0; j < dabs.length; j += 8) preview.add(dabs.slice(j, j + 8));
        const rides = preview.rides(ridingPieces(s.built.entities, W, H));
        if (rides.length) preview.finish(rides);
        const falls = preview.falls();
        const u = s.apply({ op: "brush", params: { ...settings, dabs } as BrushParams });
        if (!u.ok) {
          expect(u.errors, k).toEqual([falls.length === 1 ? "1 block of ground would fall: nothing would hold it up" : `${falls.length} blocks of ground would fall: nothing would hold them up`]);
          expect(Array.from(s.terrain.mask), k).toEqual(Array.from(states.at(-1)!));
          refused++;
          return;
        }
        expect(falls, k).toEqual([]);
        expect(Array.from(shown), k).toEqual(Array.from(s.built.heights));
        const t = s.terrain;
        for (const i of roofs) {
          expect(under(t, i), `${k} tile ${i}`).toEqual(under(base, i));
          if (t.surface(i) !== base.surface(i)) shaped++;
        }
        // nothing falls that the map held
        const now = unsupportedVoxels(t);
        for (let c = 0; c < now.length; c++) if (now[c] && !fell[c]) expect.fail(`${k}: cell ${c} falls`);
        states.push(t.mask.slice());
      };
      // random strokes over roofs, and a few that cut the ground round a roof away
      for (let k = 0; k < 24; k++) {
        const i = roofs[Math.floor(rand() * roofs.length)];
        stroke(randomBrush(rand, W, H, STROKE_TOOLS[k % STROKE_TOOLS.length], { x: i % W, y: Math.floor(i / W), r: 4 }), `stroke ${k}`);
      }
      for (let k = 0; k < 6; k++) {
        const i = roofs[Math.floor(rand() * roofs.length)];
        const x = i % W;
        const y = Math.floor(i / W);
        const c = (v: number, n: number) => Math.min(4 * n - 1, Math.max(0, 4 * v + 2));
        stroke({ tool: "lower", size: 1, strength: 5, shape: "area", target: 0, dabs: [c(x - 4, W), c(y - 4, H), c(x + 4, W), c(y + 4, H)] }, `cut ${k}`);
      }
      expect(shaped).toBeGreaterThan(0);
      expect(refused).toBeGreaterThan(0);
      expect(Array.from(s.fullBuild().heights)).toEqual(Array.from(s.built.heights));
      for (let k = states.length - 2; k >= 0; k--) {
        expect(s.undo()).toBe(true);
        expect(Array.from(s.terrain.mask), `undo to ${k}`).toEqual(Array.from(states[k]));
      }
    });
});
