// What the MCP server says beyond the engine's own words (D141, D501), mended from a usability trial in which a fresh
// agent read only the tool list (investigation/mcp-trial/): the apply schema shows a force's inputs, not its stored
// result, and states units, defaults and directions read from the code; apply's result notes a start a force moved,
// sources it cleared and a crater's missing water; describe places lakes and lists carved rivers; check gives a verdict.

import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import opsSchema from "../../src/core/doc/ops.schema.json" with { type: "json" };
import { naturalSize } from "../../src/core/forces/craterize";
import { closeAll, generateMap, mapOf, MOST_OPEN, WHERE_MOST } from "../src/maps";
import { callTool, TOOLS } from "../src/server";

const textOf = (r: { content: { type: string; text?: string }[] }) => r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
const json = async (name: string, args: Record<string, unknown>) => {
  const r = await callTool(name, args);
  expect(r.isError, textOf(r)).toBeFalsy();
  return JSON.parse(textOf(r));
};

beforeAll(() => closeAll());
afterAll(() => closeAll());

describe("the MCP server's words", () => {
  it("shows a force's inputs with their units, defaults and directions, and still takes every operation", () => {
    const apply = TOOLS.find((t) => t.name === "apply")!;
    const schema = apply.inputSchema as Record<string, any>;
    const force = schema.$defs.forceResult;
    expect(force.required).toEqual(["verb", "where"]);
    // the stored result is still taken (a stored force replays) but shows no shape
    const stored = Object.keys((opsSchema as Record<string, any>).$defs.forceResult.properties).filter((k) => !["verb", "settings", "where"].includes(k));
    for (const k of stored) expect(force.properties[k], k).toEqual({ description: "The engine fills this. Leave it out." });
    // the craterize's size at its default power, as the code makes it
    expect(force.properties.settings.properties.size.description).toContain(`a craterize is ${naturalSize(55)} tiles across`);
    expect(force.properties.settings.description).toContain("craterize: mode strike, power 55, size null");
    expect(force.properties.settings.properties.sources.description).toMatch(/"clear" \(the default\): the force removes them/);
    expect(force.properties.where.description).toContain("Y south to north");
    expect(apply.description).toContain("A crater is a dry bowl");
    // every operation of the page's schema is still there
    expect(Object.keys(schema.$defs).sort()).toEqual(Object.keys((opsSchema as Record<string, any>).$defs).sort());
    expect(TOOLS.find((t) => t.name === "generate")!.description).toContain('"intentions": ["under-cliff"]');
  });

  it("notes a start a force moved, the sources it cleared and a crater's missing water; lists a carved river until it is undone", async () => {
    const { handle, session: s } = generateMap({ theme: "riverValley", size: 96, seed: 2 });
    const st = s.built.start!;
    // a craterize at its default size on the start: the start is carried with its ground (D257), and the result says so
    const c = await json("apply", { map: handle, ops: [{ op: "forceResult", params: { verb: "craterize", where: { origin: [st.x, st.y] } } }] });
    expect(c.start.from).toEqual([st.x, st.y, st.z]);
    expect(c.start.to).toEqual([s.built.start!.x, s.built.start!.y, s.built.start!.z]);
    expect(c.notes[0]).toMatch(/^The force broke the ground under the start, so the start moved from X /);
    expect(c.notes).toContain("A crater is a dry bowl. For a crater lake, place a WaterSource in the bowl with placeEntity.");
    await callTool("undo", { map: handle });
    // an eruption on a water source clears it, and says how to keep it
    const src = s.built.entities.find((e) => e.template === "WaterSource")!;
    const e = await json("apply", { map: handle, ops: [{ op: "forceResult", params: { verb: "erupt", where: { origin: [src.x, src.y] } } }] });
    expect(e.objects.removed.WaterSource).toBeGreaterThan(0);
    expect(e.notes.join(" ")).toMatch(/The force cleared \d+ water sources? on the ground it changed\. To keep sources, give settings\.sources "ride"\./);
    expect(e.start).toBeUndefined();
    await callTool("undo", { map: handle });
    // the start moved on purpose gets no note
    const startId = s.built.entities.find((x) => x.template === "StartingLocation")!.id;
    const m = await json("apply", { map: handle, ops: [{ op: "moveEntity", params: { id: startId, x: st.x + 1, y: st.y } }] });
    expect(m.start).toBeDefined();
    expect(m.notes).toBeUndefined();
    await callTool("undo", { map: handle });
    // a carve's river is listed in describe, and goes with its undo
    await json("apply", { map: handle, ops: [{ op: "forceResult", params: { verb: "carve", where: { origin: [20, 80] } } }] });
    const carved = (await json("describe", { map: handle, checks: false })).rivers.filter((r: { carved?: boolean }) => r.carved);
    expect(carved).toHaveLength(1);
    expect(carved[0]).toMatchObject({ carved: true, from: [20, 80], changedTiles: expect.any(Number), area: expect.any(Object) });
    await callTool("undo", { map: handle });
    expect((await json("describe", { map: handle, checks: false })).rivers.some((r: { carved?: boolean }) => r.carved)).toBe(false);
    // the check's verdict, in one line
    const k = await json("check", { map: handle });
    expect(k.verdict).toMatch(k.warnings.length ? /^It saves and Timberborn plays it, but / : /^It saves and passes every check\.$/);
  });

  it("places a lake: its basin, the water in it, its area and outlet", async () => {
    const { handle } = generateMap({ theme: "lakeBasin", size: 96, seed: 1 });
    const lakes = (await json("describe", { map: handle, checks: false })).features.filter((f: { kind: string }) => f.kind === "lake");
    expect(lakes.length).toBeGreaterThan(0);
    const s = mapOf(handle);
    for (const l of lakes) {
      expect(l.wetTiles).toBeGreaterThan(0);
      expect(l.basinTiles).toBeGreaterThanOrEqual(l.wetTiles);
      const { x0, y0, x1, y1 } = l.area;
      expect(x0 >= 0 && y0 >= 0 && x1 < s.size.x && y1 < s.size.y && x0 <= x1 && y0 <= y1).toBe(true);
      expect(l.outlet).toMatchObject({ at: [expect.any(Number), expect.any(Number)], level: expect.any(Number) });
    }
  });

  it("gives an example that works, marks the intentions asked for, and says what to do when one did not emerge", async () => {
    const made = async (args: Record<string, unknown>) => {
      let r = await callTool("generate", args);
      for (let m = /^Map (map-\d+) is not ready yet/.exec(textOf(r)); m; m = /^Map (map-\d+) is not ready yet/.exec(textOf(r))) r = await callTool("wait", { map: m[1] });
      expect(r.isError, textOf(r)).toBeFalsy();
      return textOf(r);
    };
    // the example in generate's description, as it stands there, gives its intention (under-cliff on River Valley: 12 of
    // 12 in the intention table); Canyon 128, seed 1 is offered it (4 of 12) and misses (re-pin both if the generator
    // moves, D148)
    const example = JSON.parse(/(\{"theme": "riverValley"[^}]*\})/.exec(TOOLS.find((t) => t.name === "generate")!.description!)![1]);
    const [hit, miss] = await Promise.all([made(example), made({ theme: "canyon", size: 128, seed: 1, intentions: ["under-cliff"] })]);
    expect(hit).toMatch(/^- under-cliff \(asked for\): emerged/m);
    expect(hit).not.toContain("did not emerge. The map is made");
    // drawn intentions are not marked
    expect(miss).not.toMatch(/^- (?!under-cliff)[a-z-]+ \(asked for\)/m);
    expect(miss).toMatch(/^- under-cliff \(asked for\): did not emerge \(/m);
    expect(miss).toContain("under-cliff did not emerge. The map is made and saves as it is. To try again, call generate with the same input and another seed: each seed gives another map. After about five misses, tell the player it did not come out.");
  });

  it("pictures a change of water alone, caps a check's lists, names save's files by its rule, and says what to do for a closed map", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dgm-mcp-words-"));
    try {
      const { handle, session: s } = generateMap({ theme: "riverValley", size: 96, seed: 2 });
      // a water source on dry ground: no ground changes, the water does, and the picture shows where
      const wet = (x: number, y: number) => s.built.water[y * s.size.x + x] > 0.05;
      let at: [number, number] | null = null;
      for (let y = 20; y < 76 && !at; y += 4) for (let x = 20; x < 76 && !at; x += 4) if (!wet(x, y) && !s.built.entities.some((e) => Math.abs(e.x - x) < 3 && Math.abs(e.y - y) < 3)) at = [x, y];
      const r = await callTool("apply", { map: handle, ops: [{ op: "placeEntity", params: { template: "WaterSource", x: at![0], y: at![1] } }], picture: true });
      expect(r.isError, textOf(r)).toBeFalsy();
      const c = JSON.parse(textOf({ content: [r.content[0]] }));
      expect(c.ground.area).toBeNull();
      expect(c.water.wetAfter).toBeGreaterThan(c.water.wetBefore);
      expect(c.water.area).toBeDefined();
      expect(r.content.some((x) => x.type === "image")).toBe(true);
      await callTool("undo", { map: handle });
      // nothing changed on the ground or in the water: the result says why there is no picture
      const tree = s.built.entities.find((e) => e.template === "Pine" || e.template === "Birch" || e.template === "Oak")!;
      const d = await callTool("apply", { map: handle, ops: [{ op: "deleteEntities", params: { entities: [tree.id] } }], picture: true });
      expect(d.isError, textOf(d)).toBeFalsy();
      expect(textOf(d)).toContain("No ground or water changed, so there is no picture.");
      // a check's lists of objects and tiles are cut, with their totals
      const k = await json("check", { map: handle });
      for (const row of [...k.stopSaving, ...k.warnings, ...k.advice])
        for (const [key, v] of Object.entries((row.where ?? {}) as Record<string, unknown>))
          if (Array.isArray(v)) {
            expect(v.length, `${row.id} ${key}`).toBeLessThanOrEqual(WHERE_MOST);
            if (v.length === WHERE_MOST) expect(row.where[`${key}Total`] ?? WHERE_MOST).toBeGreaterThanOrEqual(WHERE_MOST);
          }
      // save: a generated map with its own name keeps the seed's file name; another name names the files
      const own = s.meta.name;
      expect((await callTool("save", { map: handle, folder: dir, name: own })).isError).toBeFalsy();
      expect(readdirSync(dir)).toContain("dgm-river-valley-2.timber");
      await callTool("save", { map: handle, folder: dir, name: "Hollow Test" });
      expect(readdirSync(dir)).toContain("dgm-hollow-test.timber");
      // a map no longer open: the refusal says why and what to do
      for (let k2 = 0; k2 < MOST_OPEN; k2++) generateMap({ theme: "riverValley", size: 48, seed: k2 + 1 });
      const gone = await callTool("describe", { map: handle });
      expect(gone.isError).toBe(true);
      expect(textOf(gone)).toContain(`Only the newest ${MOST_OPEN} maps stay open: open its saved project, or generate it again with the same input and seed`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
