// What the MCP server says beyond the engine's own words (D141, D501), mended from a usability trial in which a fresh
// agent read only the tool list (investigation/mcp-trial/): the apply schema shows a force's inputs, not its stored
// result, and states units, defaults and directions read from the code; apply's result notes a start a force moved,
// sources it cleared and a crater's missing water; describe places lakes and lists carved rivers; check gives a verdict.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import opsSchema from "../../src/core/doc/ops.schema.json" with { type: "json" };
import { naturalSize } from "../../src/core/forces/craterize";
import { closeAll, generateMap, mapOf } from "../src/maps";
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
    expect(TOOLS.find((t) => t.name === "generate")!.description).toContain('"intentions": ["twin-falls"]');
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

  it("marks the intentions asked for, and says what to do when one did not emerge", async () => {
    // (canyon 96, seed 7 with many waterfalls: the trial's map, whose twin falls did not emerge)
    let r = await callTool("generate", { theme: "canyon", size: "small", seed: 7, intentions: ["twin-falls"], settings: { water: { waterfalls: "many" } } });
    for (let m = /^Map (map-\d+) is not ready yet/.exec(textOf(r)); m; m = /^Map (map-\d+) is not ready yet/.exec(textOf(r))) r = await callTool("wait", { map: m[1] });
    const t = textOf(r);
    const line = /^- twin-falls \(asked for\): (emerged|did not emerge)/m.exec(t);
    expect(line, t).toBeTruthy();
    // drawn intentions are not marked
    expect(t).not.toMatch(/^- (?!twin-falls)[a-z-]+ \(asked for\)/m);
    const retry = "twin-falls did not emerge. The map is made and saves as it is. To try again, call generate with the same input and another seed";
    if (line![1] === "emerged") expect(t).not.toContain(retry);
    else expect(t).toContain(retry);
  });
});
