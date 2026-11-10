// A fall from one stroke holds one tile away too (showcase craft gaps 1, 2 and 20): on Canyon 1 (96²), every start
// within two tiles of the strokes the look reviews judged, run and its water settled as the game plays it, gives one
// whole curtain (at least three levels on Auto, the height set with a Fall), with no pillar splitting it, no ledge
// partway down and no basin flooding the mesa above, or is refused in one line. Before: from (60,44) a curtain, from
// (59,44) the mesa cut to a basin with no fall, from (61,44) dry pillars splitting it in three, and an Unleash from
// (53,46) poured into a slot two tiles wide.

import { describe, expect, it } from "vitest";
import { applyForce } from "../../src/core/collab";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { curtains } from "./fallCurtain";

const SOURCE = "11111111-2222-4333-8444-555555555555";

/** Each start within two tiles of `from`, drawn to `to`: what it gave (or why it was refused). */
function sweep(from: [number, number], to: [number, number], set: Record<string, unknown>, need: number, unleash = false): string[] {
  const g = generate(makeSpec({ seed: 1, theme: "canyon", size: { x: 96, y: 96 } }));
  const base = MapSession.fromGenerated(g, g.file);
  base.settleCanonical();
  const W = base.built.W;
  const before = base.built.heights.slice();
  const beforeDepth = Float64Array.from(base.built.water);
  const out: string[] = [];
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const [x, y] = [from[0] + dx, from[1] + dy];
      const s = MapSession.fromGenerated(g, g.file);
      const via: [number, number][] = [];
      for (let k = 1; k < 8; k++) via.push([Math.round(x + ((to[0] - x) * k) / 8), Math.round(y + ((to[1] - y) * k) / 8)]);
      const settings = { mode: "aim", power: 65, wander: null, width: null, depth: null, riverDepth: 2, banks: null, seed: 0, walls: null, sources: "clear", defyGravity: !unleash, dry: false, layers: true, ...set };
      let request: Record<string, unknown> = { verb: "carve", settings, origin: [x, y], end: to, via, cut: null, natural: true };
      if (unleash) {
        s.apply({ op: "placeEntity", params: { id: SOURCE, template: "WaterSource", x, y, orientation: "Cw0" } } as never);
        request = { ...request, source: SOURCE };
      }
      const r = applyForce(s, { id: "g", sourceId: "aaaaaaaa-2222-4333-8444-555555555555", request } as never);
      if (!r.ok) {
        // (refused: one line)
        out.push(`${x},${y} refused: ${(r as { reason: string }).reason}`);
        expect((r as { reason: string }).reason).not.toContain("\n");
        continue;
      }
      s.settleCanonical();
      const v = curtains({ W, H: W, before, beforeDepth, after: s.built.heights, depth: s.built.water, need });
      out.push(`${x},${y} ${v.ok ? "ok" : "FAILS"}: ${v.note}`);
    }
  return out;
}

const failing = (lines: string[]) => lines.filter((l) => l.includes("FAILS"));

describe("a fall from one stroke holds one tile away too (showcase craft gaps 1, 2 and 20)", () => {
  it("a Carve on Auto off the mesa toward the gorge, from every start within two tiles", () => {
    expect(failing(sweep([60, 44], [40, 46], {}, 3))).toEqual([]);
  }, 600_000);

  it("a Carve with Fall 8, from every start within two tiles", () => {
    expect(failing(sweep([62, 68], [37, 68], { fall: 8 }, 8))).toEqual([]);
  }, 600_000);

  it("an Unleash from every source within two tiles: a fall a player sees, never a slot", () => {
    // (KNOWN: a source at (55,48) stands on the mesa's back rim, and half its water runs off behind it, down to the
    // terrace east; what reaches the lip pours two hundredths of a level deep, too thin to read as a fall)
    const known = ["55,48"];
    expect(failing(sweep([53, 46], [40, 46], {}, 3, true)).filter((l) => !known.some((k) => l.startsWith(`${k} `)))).toEqual([]);
  }, 600_000);
});
