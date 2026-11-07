// A crop never leaves ground floating (D340, D121, D280 (3)): a ledge or a roof held from a column the new edge cuts
// off would be deleted by the game as the cropped map loads, so the crop is refused in one line, as an edit that makes
// ground fall is (the Any 128² map, seed 1: five blocks at X 86–87 · Y 80–82, which a crop with its corner at
// X 40 · Y 80 leaves unheld, the start at X 83 · Y 86 staying in it;
// generator 0.10.11 makes 3D forms only at 128² and over, D503, so a 64² map has none to cut; the fixture moved twice:
// since generator 0.10.11's maps, #726, D148, it was the corner at X 60 · Y 71 of seed 2, which left three blocks there
// unheld, and since generator 0.10.12's, whose starts frame the map (D507), seed 2's map has none that leaves a
// block unheld and keeps the start (corners scanned in steps of four, the 48 × 48 crops; of seeds 1–3 only seed 1's has one), so
// seed 1's, D148). A crop whose edge
// leaves every block held goes ahead, and its file's ground is all supported.

import { describe, expect, it } from "vitest";
import { cropFalls, cropObjects } from "../../src/core/doc/crop";
import { MapSession } from "../../src/core/doc/session";
import { readTimber } from "../../src/core/format/timber";
import { validateMap } from "../../src/core/validate/checks";
import { map } from "./gateHelpers";

const supported = (s: MapSession) => validateMap(readTimber(s.exportTimber().bytes), { profile: "import", loadOnly: true }).report.checks.find((c) => c.id === "terrain.supported")!;

describe("a crop never leaves ground floating", () => {
  it("an edge that would leave blocks unheld is refused with how many and where; one that holds them all goes ahead", () => {
    const r = map(1, 128);
    const session = () => {
      const s = MapSession.fromGenerated(r, r.file);
      s.setWaterMode("defer");
      return s;
    };
    const s = session();
    const bad = { x: 40, y: 80, w: 48, h: 48 };
    expect(cropObjects(s.built.entities, bad).cutStart).toBeNull();
    const falls = cropFalls(s.terrain, bad);
    expect(falls.length).toBeGreaterThan(0);
    const why = s.check({ op: "crop", params: bad });
    expect(why).toEqual([`${falls.length === 1 ? "1 block" : `${falls.length} blocks`} of ground would fall at X ${falls[0] % 128} · Y ${Math.floor((falls[0] % 16384) / 128)}: nothing would hold ${falls.length === 1 ? "it" : "them"} up`]);
    const before = s.built.heights.slice();
    const res = s.apply({ op: "crop", params: bad });
    expect(res.ok).toBe(false);
    expect(res.errors).toEqual(why);
    expect(s.size).toEqual({ x: 128, y: 128 });
    expect(Buffer.from(s.built.heights).equals(Buffer.from(before))).toBe(true);
    // (a crop whose west edge is four tiles further east keeps what holds them, and the game keeps all its ground)
    const ok = { x: 44, y: 80, w: 48, h: 48 };
    const t = session();
    expect(cropFalls(t.terrain, ok)).toEqual([]);
    expect(t.apply({ op: "crop", params: ok }).errors).toEqual([]);
    expect(t.size).toEqual({ x: 48, y: 48 });
    expect(supported(t).ok).toBe(true);
  }, 300_000);
});
