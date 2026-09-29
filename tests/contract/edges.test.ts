// No edge walls (Kyler, 2026-09-25, D151, extending D111's no built walls to the map's edges): no
// generated or converted map may raise a wall along its edges to hold water (D151).
// `terrain.edge_wall` (analysis/edges.ts, prototype/validate.py `edge_walls`) is a principle beside
// the dam-wall rule: it blocks in `generate` and `export`, and is information on an import.
//
// The fixture is the terrain of one real place as converted for real-places-done: every one of
// the 85 conversions stands in a full-height wall one tile thick round the whole map.
//
// On the official maps (local only): none is flagged. Generated maps: the batches run the generate
// profile, so no accepted map has one; a sample here checks the first seeds of every theme.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { EDGE_RISE, EDGE_SHARE, edgeWalls } from "../../src/core/analysis/edges";
import { mapMetadata, readTimber, writeTimber, type TimberFile } from "../../src/core/format/timber";
import { emptySimulationSingletons, GAME_VERSION, LAYERS, voxelsFromHeights } from "../../src/core/format/world";
import { generate } from "../../src/core/gen/generate";
import { decodeHeights } from "../../src/core/places/place";
import { AVAILABLE_THEMES, makeSpec } from "../../src/core/spec/mapspec";
import { validateMap } from "../../src/core/validate/checks";
import { blocks, type CheckResult, type Profile } from "../../src/core/validate/report";

/** Python with numpy, for the oracle's side (CI has it; a machine without it skips). */
const PY = (() => {
  for (const exe of [process.env.PYTHON ?? "python", "python3"]) {
    const r = spawnSync(exe, ["-c", "import numpy"], { encoding: "utf8" });
    if (!r.error && r.status === 0) return exe;
  }
  return null;
})();

const fixture = JSON.parse(strFromU8(gunzipSync(new Uint8Array(readFileSync("tests/fixtures/edge-wall/near-aso-caldera.json.gz"))))) as { W: number; H: number; heights: string };

function fileOf(heights: Uint8Array, W: number, H: number): TimberFile {
  return {
    metadata: mapMetadata(W, H, "edge wall test"),
    thumbnail: null,
    versionTxt: GAME_VERSION + "\r\n",
    world: { gameVersion: GAME_VERSION, timestamp: "2026-09-25 00:00:00", sizeX: W, sizeY: H, layers: LAYERS, voxels: voxelsFromHeights(heights, W, H), singletons: emptySimulationSingletons(W, H), entities: [] },
    extraFiles: [],
  };
}

function edgeCheck(heights: Uint8Array, W: number, H: number, profile: Profile = "generate"): CheckResult {
  return validateMap(fileOf(heights, W, H), { profile, loadOnly: true }).report.checks.find((c) => c.id === "terrain.edge_wall")!;
}

/** Flat ground at level 5, 64 × 48. */
function flat(W = 64, H = 48, level = 5): Uint8Array {
  return new Uint8Array(W * H).fill(level);
}

describe("the edge-wall rule (terrain.edge_wall)", () => {
  it("flags the real places' conversion: a full-height wall round the whole map", () => {
    const { W, H } = fixture;
    const h = decodeHeights(fixture.heights);
    const edges = edgeWalls(h, W, H);
    // every edge is walled along most of it: the wall stands at 16, the land inside lower
    for (const e of edges) expect(e.share, e.edge).toBeGreaterThanOrEqual(EDGE_SHARE);
    const c = edgeCheck(h, W, H);
    expect(c.ok).toBe(false);
    expect(c.class).toBe("principle");
    expect(c.message).toMatch(/wall runs along the south edge .*, north edge .*, west edge .*, east edge/);
    expect(c.where?.tiles?.length).toBe(4);
    // the same land without the wall: the outer tile takes the level of the tile inside it
    const opened = h.slice();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const ix = x === 0 ? 1 : x === W - 1 ? W - 2 : x;
        const iy = y === 0 ? 1 : y === H - 1 ? H - 2 : y;
        opened[y * W + x] = h[iy * W + ix];
      }
    expect(edgeCheck(opened, W, H).ok).toBe(true);
  });

  it(`a wall one or two tiles thick, ${EDGE_RISE} levels above the land inside, along ${EDGE_SHARE * 100}% of an edge is a wall`, () => {
    const W = 64;
    const H = 48;
    const wall = (rise: number, share: number, thick = 1): Uint8Array => {
      const h = flat(W, H);
      for (let x = 0; x < Math.round(share * W); x++) for (let d = 0; d < thick; d++) h[d * W + x] = 5 + rise;
      return h;
    };
    expect(edgeCheck(wall(2, 1), W, H).ok).toBe(false);
    expect(edgeCheck(wall(2, 1, 2), W, H).ok).toBe(false);
    expect(edgeCheck(wall(2, 0.65), W, H).ok).toBe(false);
    // lower, or along less of the edge: not a wall
    expect(edgeCheck(wall(1, 1), W, H).ok).toBe(true);
    expect(edgeCheck(wall(2, 0.55), W, H).ok).toBe(true);
    // thicker than two tiles, it is high ground, not a wall
    expect(edgeCheck(wall(4, 1, 3), W, H).ok).toBe(true);
    // a river's gap through it does not open it
    const gap = wall(3, 1);
    for (let x = 20; x < 28; x++) gap[x] = 3;
    expect(edgeCheck(gap, W, H).ok).toBe(false);
  });

  it("land that rises to the edge is not a wall: highlands, terraces, a cliff set back from it", () => {
    const W = 64;
    const H = 48;
    const high = flat(W, H);
    for (let y = 0; y < 12; y++) for (let x = 0; x < W; x++) high[y * W + x] = 12;
    expect(edgeCheck(high, W, H).ok).toBe(true);
    // terraces climbing to the east edge, a level every three tiles
    const terraces = flat(40, 40);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) terraces[y * 40 + x] = 2 + Math.floor(x / 3);
    expect(edgeCheck(terraces, 40, 40).ok).toBe(true);
    // a cliff five tiles in from the edge, the high ground running on to it
    const cliff = flat(W, H);
    for (let y = 0; y < 5; y++) for (let x = 0; x < W; x++) cliff[y * W + x] = 11;
    expect(edgeCheck(cliff, W, H).ok).toBe(true);
  });

  it("blocks a generated map and an export, and is information on an import", () => {
    const h = decodeHeights(fixture.heights);
    const at = (p: Profile) => edgeCheck(h, fixture.W, fixture.H, p);
    expect(at("generate").severity).toBe("error");
    expect(blocks("generate", at("generate"))).toBe(true);
    expect(at("export").severity).toBe("error");
    expect(blocks("export", at("export"))).toBe(true);
    expect(at("import").severity).toBe("info");
    expect(blocks("import", at("import"))).toBe(false);
  });

  it("does not apply to a map under 10 tiles a side", () => {
    const c = edgeCheck(flat(8, 40), 8, 40);
    expect(c.applicable).toBe(false);
    expect(c.ok).toBe(true);
  });

  it("finds no wall on the generator's maps (seeds 1–2 of every theme at 96²)", () => {
    for (const theme of AVAILABLE_THEMES)
      for (const seed of [1, 2]) {
        const r = generate(makeSpec({ seed, theme, size: { x: 96, y: 96 } }));
        const c = r.report.checks.find((x) => x.id === "terrain.edge_wall")!;
        expect(c.ok, `${theme} ${seed}: ${c.message}`).toBe(true);
        expect(Number(c.value)).toBeLessThan(EDGE_SHARE);
      }
  });
});

const OFFICIAL = "investigation/raw/builtin";
const official = existsSync(OFFICIAL) ? readdirSync(OFFICIAL).filter((n) => n.endsWith(".timber") && !n.startsWith("_")) : [];

describe("the official maps (local only)", () => {
  it.skipIf(official.length !== 19)("none of the 19 has an edge wall", () => {
    const flagged: string[] = [];
    for (const n of official) {
      const v = validateMap(readTimber(new Uint8Array(readFileSync(join(OFFICIAL, n)))), { profile: "import", loadOnly: true });
      const c = v.report.checks.find((x) => x.id === "terrain.edge_wall")!;
      if (!c.ok) flagged.push(n);
    }
    expect(flagged).toEqual([]);
  });
});

// Tall maps (D172 (1), after DGM Probe run 20260925-tall): heights up to 22 load in the game, with
// voxel layer 22 empty; the in-game map editor edits only up to 16, which the check notes.
describe("the height limit (terrain.max_height)", () => {
  const tall = (top: number) => {
    const h = flat(24, 24, 8);
    h[12 * 24 + 12] = top;
    return h;
  };
  it("a map with a column at 22 passes, with the editor's note; one at 23 fails", () => {
    const at = (top: number) => validateMap(fileOf(tall(top), 24, 24), { profile: "generate", loadOnly: true }).report.checks;
    const ok = at(22).find((c) => c.id === "terrain.max_height")!;
    expect(ok.ok).toBe(true);
    expect(ok.limit).toBe(22);
    expect(ok.message).toMatch(/the in-game map editor edits only up to level 16/);
    expect(at(22).find((c) => c.id === "terrain.top_layer_free")!.ok).toBe(true);
    expect(at(16).find((c) => c.id === "terrain.max_height")!.message).not.toMatch(/editor/);
    const over = at(23);
    expect(over.find((c) => c.id === "terrain.max_height")!.ok).toBe(false);
    expect(over.find((c) => c.id === "terrain.top_layer_free")!.ok).toBe(false);
  });

  it.skipIf(!PY)("the Python validator agrees", () => {
    const dir = join(".scratch", "tall-check");
    mkdirSync(dir, { recursive: true });
    const paths = [22, 23].map((top) => {
      const p = join(dir, `tall-${top}.timber`);
      writeFileSync(p, writeTimber({ ...fileOf(tall(top), 24, 24), thumbnail: null }));
      return p;
    });
    const r = spawnSync(PY!, ["-B", "prototype/validate.py", "--load-only", "--json", ...paths], { encoding: "utf8" });
    const verdicts = (r.stdout ?? "").split(/\r?\n/).filter((l) => l.startsWith("{")).map((l) => (JSON.parse(l) as { checks: { id: string; ok: boolean }[] }).checks.find((c) => c.id === "terrain.max_height")!.ok);
    expect(verdicts).toEqual([true, false]);
  });
});

describe("the edge-wall rule on an edited map (D323)", () => {
  it("is a warning with a Lower the wall fix, never a block; the same land on generate and export still blocks", () => {
    const { W, H } = fixture;
    const h = decodeHeights(fixture.heights);
    const edited = validateMap(fileOf(h, W, H), { profile: "export", loadOnly: true, editing: true });
    const c = edited.report.checks.find((x) => x.id === "terrain.edge_wall")!;
    expect(c.ok).toBe(false);
    expect(c.severity).toBe("warning");
    expect(blocks("export", c)).toBe(false);
    expect(c.fix?.[0]?.label).toBe("Lower the wall");
    // the fix (a flatten a level at a time) leaves no wall
    const fixed = h.slice();
    for (const op of c.fix!) {
      if (op.op !== "sculpt") throw new Error("a sculpt");
      for (const [y, a, b] of op.params.cells) for (let x = a; x <= b; x++) fixed[y * W + x] = op.params.level!;
    }
    expect(edgeCheck(fixed, W, H).ok).toBe(true);
    // without `editing`, the export still blocks
    expect(blocks("export", edgeCheck(h, W, H, "export"))).toBe(true);
  });
});
