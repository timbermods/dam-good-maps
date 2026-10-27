// Carve's Maturity is retired (D473): Carve is the one Young carve. Kyler's saved projects keep
// opening (D379): a carve saved with Maturity (the operation kept `maturity: "mature"` when it resolved
// Mature) opens as its recorded result, the literal tiles, and loses the setting on open
// (doc/document.ts `dropRetiredCarveSetting`); run again, it is the Young carve.

import { strFromU8, gunzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { CarveRun, DEFAULTS, type CarveSettings } from "../../src/core/forces/carve/run";
import { carveForceParams, forceMapOf } from "../../src/core/forces/carve/result";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

const text = (b: Uint8Array) => strFromU8(b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b);

describe("a carve saved with Carve's retired Maturity (D473)", () => {
  it("opens as its recorded result, without the setting; run again, it is the Young carve", () => {
    const generated = generate(makeSpec({ theme: "highlands", seed: 3, size: { x: 96, y: 96 } }));
    const s = MapSession.fromGenerated(generated, generated.file);
    s.setWaterMode("defer");
    const m = forceMapOf(s.built);
    // a click far from the start, on high ground
    const st = m.entities.find((e) => e.template === "StartingLocation")!;
    let origin = 0;
    let best = -Infinity;
    for (let i = 0; i < m.heights.length; i++) {
      const d = ((i % 96) - st.x) ** 2 + (Math.floor(i / 96) - st.y) ** 2;
      if (m.heights[i] > 3 && d > best) { origin = i; best = d; }
    }
    const settings: CarveSettings = { ...DEFAULTS, power: 80, seed: 4 };
    const sourceId = "0c0ffee0-0000-4000-8000-000000000001";
    const young = new CarveRun(m, settings, { origin }, { sourceId });
    young.finish();
    const params = carveForceParams(m, young, { settings, origin: [origin % 96, Math.floor(origin / 96)], cut: null })!;

    // the operation as a Mature carve saved it: the setting kept, a result the Young carve doesn't make
    const occupied = new Set(s.built.entities.map((e) => e.y * 96 + e.x));
    const k = params.tiles.findIndex((t, j) => t !== origin && !occupied.has(t) && params.heights[j] > 2);
    expect(k).toBeGreaterThanOrEqual(0);
    const mature = { ...params, settings: { ...params.settings, maturity: "mature" }, heights: params.heights.map((h, j) => (j === k ? h - 1 : h)) };
    expect(s.apply({ op: "forceResult", params: mature as typeof params }, "user").errors).toEqual([]);
    const recorded = s.built.heights.slice();
    expect(recorded[params.tiles[k]]).toBe(young.map.heights[params.tiles[k]] - 1);
    const bytes = s.project();
    expect(text(bytes)).toContain('"maturity":"mature"');

    // opened: the recorded result, the setting gone from the log
    const doc = decodeProject(bytes);
    const op = doc.edits[doc.edits.length - 1];
    expect(op.op).toBe("forceResult");
    expect((op.params as { settings: Record<string, unknown> }).settings).not.toHaveProperty("maturity");
    const opened = MapSession.open(doc);
    expect(Array.from(opened.built.heights)).toEqual(Array.from(recorded));
    expect(text(opened.project())).not.toContain("maturity");

    // run again from the saved settings (the setting included, or as opened): the Young carve
    for (const saved of [mature.settings, (op.params as { settings: object }).settings]) {
      const again = new CarveRun(m, { ...DEFAULTS, ...saved } as CarveSettings, { origin }, { sourceId });
      again.finish();
      expect(Array.from(again.map.heights)).toEqual(Array.from(young.map.heights));
    }
  });
});
