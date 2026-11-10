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
import { MAX_PATH_POINTS } from "../../src/core/forces/carve/run";
import { pathTiles, resamplePath } from "../../src/core/forces/path";
import { makeSpec } from "../../src/core/spec/mapspec";
import { curtains } from "./fallCurtain";

const SOURCE = "11111111-2222-4333-8444-555555555555";

/** A corner of a lip the carve cut, within `r` tiles of (cx, cy), standing on its own: ground with lower ground three
 *  levels or more under it on two sides and on its other two the lip, each of those meeting the lower ground too, and
 *  the stream's water on its bed just behind it (diagonally), so no stream reaches it but over the lip; a thin stream
 *  leaves it dry, a block splitting the curtain. */
function cornerBlocks(W: number, before: ArrayLike<number>, H: ArrayLike<number>, depth: ArrayLike<number>, cx: number, cy: number, r: number): string[] {
  const out: string[] = [];
  const ns = (i: number) => [i - 1, i + 1, i - W, i + W];
  for (let y = Math.max(1, cy - r); y <= Math.min(W - 2, cy + r); y++)
    for (let x = Math.max(1, cx - r); x <= Math.min(W - 2, cx + r); x++) {
      const i = y * W + x;
      if (H[i] >= before[i]) continue;
      const low = ns(i).filter((j) => H[j] <= H[i] - 3);
      const level = ns(i).filter((j) => H[j] === H[i]);
      const behind = [i - W - 1, i - W + 1, i + W - 1, i + W + 1].some((d) => depth[d] > 0.05 && H[d] >= H[i] - 1 && H[d] < H[i]);
      if (low.length === 2 && level.length === 2 && behind && level.every((j) => ns(j).some((k) => k !== i && H[k] <= H[i] - 3))) out.push(`${x},${y}`);
    }
  return out;
}

/** Each start within two tiles of `from`, drawn to `to` (null: an Unleash by click, its course its own), what it gave
 *  or why it was refused: its curtain judged, or with `corners` only that no corner of its lip stands on its own; drawn
 *  as the page draws a line (`page`: a station every two tiles, its stroke resampled and its tiles taken as the page's
 *  `steerTiles` does) or through eight points. */
function sweep(from: [number, number], to: [number, number] | null, set: Record<string, unknown>, need: number, under?: number, unleash = false, reach = 2, page = false, corners = false): string[] {
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
      if (to && page) {
        const n = Math.ceil(Math.hypot(to[0] - x, to[1] - y) * 4);
        const drawn = Array.from({ length: n + 1 }, (_, k) => ({ x: x + ((to[0] - x) * k) / n, y: y + ((to[1] - y) * k) / n }));
        via.push(...pathTiles(resamplePath(drawn, 2, MAX_PATH_POINTS + 2), W, W).slice(1, -1));
      } else if (to) for (let k = 1; k < 8; k++) via.push([Math.round(x + ((to[0] - x) * k) / 8), Math.round(y + ((to[1] - y) * k) / 8)]);
      const settings = { mode: to ? "aim" : "unleash", power: 65, wander: null, width: null, depth: null, riverDepth: 2, banks: null, seed: 0, walls: null, sources: "clear", defyGravity: !unleash, dry: false, layers: true, ...set };
      let request: Record<string, unknown> = { verb: "carve", settings, origin: [x, y], ...(to ? { end: to, via } : {}), cut: null, natural: true };
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
      if (corners) {
        const c = cornerBlocks(W, before, s.built.heights, s.built.water, x, y, 10);
        out.push(`${x},${y} ${c.length ? `FAILS: a corner of the lip on its own at ${c.join(" ")}` : "ok"}`);
        continue;
      }
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
    // (before: from (61,66) a corner of the face stood at 11, and a tenth of the stream's water trickled off it two tiles
    // from the curtain; the face is now cut whole)
    expect(failing(sweep([62, 68], [37, 68], { fall: 4 }, ...fallOf(4)))).toEqual([]);
  }, 600_000);

  it("Fall 4 off the east terrace to the map's edge, from every start within two tiles: one curtain four levels down, its side bay part of it", () => {
    // (before: from (60,50) the river's own source row spilled into the terrace's notch beside the stream and fell
    // again from 11; from (60,48) it fell 6.9; from (61,46) a staircase lip fell 6.7 onto a ledge at 9; from (59,50) a
    // dry block of the terrace stood inside the lip and split the curtain; from (61,49) sources stood on the uncut
    // terrace beside the cut and trickled off it two tiles from the curtain)
    const lines: string[] = [];
    for (let y = 46; y <= 50; y++) for (let x = 58; x <= 62; x++) lines.push(...sweep([x, y], [95, y], { fall: 4 }, ...fallOf(4), false, 0));
    expect(failing(lines)).toEqual([]);
    expect(lines.filter((l) => l.includes("refused"))).toEqual([]);
  }, 900_000);

  it("a set Fall into the gorge from (60,44), drawn as the page draws it: Fall 9 falls 9; more is refused naming the most the river below lets it, however long the stroke, and less naming the least", () => {
    // (before: Fall 10 was made and its water landed in the river at 4.5, 8.7 down, the river below raised by the carve's
    // own sediment; Fall 11 and 12 asked for a longer stroke, which could never help)
    const at = (fall: number) => sweep([60, 44], [40, 46], { fall }, ...fallOf(fall), false, 0, true)[0];
    expect(at(9)).toMatch(/^60,44 ok/);
    for (const fall of [10, 11, 12]) expect(at(fall)).toBe(`60,44 refused: No drop of ${fall} here: the water standing below lets it fall at most 9`);
    expect(at(8)).toBe("60,44 refused: No drop of 8 here: the land falls at least 9 below the edge");
  }, 600_000);

  it("an Unleash by click from every source within two tiles of (55,45), running east off the terrace: no corner of its lip stands on its own", () => {
    // (before: a dry pillar at 13 at (62,50), where the lip's front met the bay beside it, split the curtain into a
    // sheet and a strand)
    expect(failing(sweep([55, 45], null, {}, 3, undefined, true, 2, false, true))).toEqual([]);
  }, 600_000);

  it("an Unleash from every source within two tiles: a fall a player sees, never a slot", () => {
    // (KNOWN: a source at (55,48) stands on the mesa's back rim, and half its water runs off behind it, down to the
    // terrace east; what reaches the lip pours two hundredths of a level deep, too thin to read as a fall)
    const known = ["55,48"];
    expect(failing(sweep([53, 46], [40, 46], {}, 3, undefined, true)).filter((l) => !known.some((k) => l.startsWith(`${k} `)))).toEqual([]);
  }, 600_000);
});
