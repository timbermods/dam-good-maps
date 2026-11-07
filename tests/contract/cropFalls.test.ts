// A crop never leaves ground floating (D340, D121, D280 (3)): a ledge or a roof held from a column the new edge cuts
// off would be deleted by the game as the cropped map loads, so the crop is refused in one line, as an edit that makes
// ground fall is (the Any 128² map, seed 2: a column of six blocks at X 91 · Y 79 held from north of it, which a crop
// with its north edge on y = 79 leaves unheld; generator 0.10.11 makes 3D forms only at 128² and over, D503, so a 64²
// map has none to cut). A crop whose edge leaves every block held goes ahead, and its file's ground is all supported.

import { describe, expect, it } from "vitest";
import { cropFalls, cropObjects } from "../../src/core/doc/crop";
import { MapSession } from "../../src/core/doc/session";
import { readTimber } from "../../src/core/format/timber";
import { validateMap } from "../../src/core/validate/checks";
import { map } from "./gateHelpers";

const supported = (s: MapSession) => validateMap(readTimber(s.exportTimber().bytes), { profile: "import", loadOnly: true }).report.checks.find((c) => c.id === "terrain.supported")!;

describe("a crop never leaves ground floating", () => {
  it("an edge that would leave blocks unheld is refused with how many and where; one that holds them all goes ahead", () => {
    const r = map(2, 128);
    const session = () => {
      const s = MapSession.fromGenerated(r, r.file);
      s.setWaterMode("defer");
      return s;
    };
    const s = session();
    const bad = { x: 44, y: 79, w: 48, h: 48 };
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
    // (a crop whose edge is three tiles further north keeps what holds them, and the game keeps all its ground)
    const ok = { x: 44, y: 76, w: 48, h: 51 };
    const t = session();
    expect(cropFalls(t.terrain, ok)).toEqual([]);
    expect(t.apply({ op: "crop", params: ok }).errors).toEqual([]);
    expect(t.size).toEqual({ x: 48, y: 51 });
    expect(supported(t).ok).toBe(true);
  }, 300_000);
});
