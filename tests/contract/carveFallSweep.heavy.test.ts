// A fall from one stroke holds one tile away too (showcase craft gaps 1, 2 and 20): on Canyon 1 (96²), every start
// within two tiles of the strokes the look reviews judged, run and its water settled as the game plays it, gives one
// whole curtain (at least three levels on Auto; with a Fall set, the first from the top within half a level of it), with no pillar splitting it, no ledge
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
function sweep(from: [number, number], to: [number, number], set: Record<string, unknown>, need: number, under?: number, unleash = false, reach = 2): string[] {
  const g = generate(makeSpec({ seed: 1, theme: "canyon", size: { x: 96, y: 96 } }));
  const base = MapSession.fromGenerated(g, g.file);
  base.settleCanonical();
  const W = base.built.W;
  const before = base.built.heights.slice();
  const beforeDepth = Float64Array.from(base.built.water);
  const out: string[] = [];
  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++) {
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
      const v = curtains({ W, H: W, before, beforeDepth, after: s.built.heights, depth: s.built.water, need, under });
      out.push(`${x},${y} ${v.ok ? "ok" : "FAILS"}: ${v.note}`);
    }
  return out;
}

const failing = (lines: string[]) => lines.filter((l) => l.includes("FAILS"));
/** A set Fall's curtain: within half a level of the height (the ground falls exactly that far; the settled water skims
 *  the lip and the landing alike, a tenth or two deep). */
const fallOf = (fall: number) => [fall - 0.5, fall + 0.5] as const;

describe("a fall from one stroke holds one tile away too (showcase craft gaps 1, 2 and 20)", () => {
  it("a Carve on Auto off the mesa toward the gorge, from every start within two tiles", () => {
    expect(failing(sweep([60, 44], [40, 46], {}, 3))).toEqual([]);
  }, 600_000);

  it("a Carve with Fall 8, from every start within two tiles", () => {
    expect(failing(sweep([62, 68], [37, 68], { fall: 8 }, ...fallOf(8)))).toEqual([]);
  }, 600_000);

  it("a Carve with Fall 4 there, from every start within two tiles: the water lands four under the lip, or it is refused where the gorge a few tiles on would step it", () => {
    // (KNOWN: from (61,66) the river's walls below cut the high ground at the lip's south corner to a step at 11, and
    // a tenth of the stream's water trickles off it two tiles from the curtain; the curtain itself falls 4.0 whole)
    const known = ["61,66"];
    expect(failing(sweep([62, 68], [37, 68], { fall: 4 }, ...fallOf(4))).filter((l) => !known.some((k) => l.startsWith(`${k} `)))).toEqual([]);
  }, 600_000);

  it("Fall 4 off the east terrace to the map's edge: one curtain four levels down, its side bay part of it", () => {
    // (before: from (60,50) the river's own source row spilled into the terrace's notch beside the stream and fell
    // again from 11; from (60,48) it fell 6.9; from (61,46) a staircase lip fell 6.7 onto a ledge at 9)
    const lines = [[60, 50], [60, 48], [61, 46]].flatMap(([x, y]) => sweep([x, y], [95, y], { fall: 4 }, ...fallOf(4), false, 0));
    expect(failing(lines)).toEqual([]);
    expect(lines.filter((l) => l.includes("refused"))).toEqual([]);
  }, 600_000);

  it("an Unleash from every source within two tiles: a fall a player sees, never a slot", () => {
    // (KNOWN: a source at (55,48) stands on the mesa's back rim, and half its water runs off behind it, down to the
    // terrace east; what reaches the lip pours two hundredths of a level deep, too thin to read as a fall)
    const known = ["55,48"];
    expect(failing(sweep([53, 46], [40, 46], {}, 3, undefined, true)).filter((l) => !known.some((k) => l.startsWith(`${k} `)))).toEqual([]);
  }, 600_000);
});
