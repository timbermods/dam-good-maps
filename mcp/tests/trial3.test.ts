// Mends from the third blind trial (investigation/mcp-trial/run-3/): a place's water after an edit is said, with its
// numbers; the start is named by the middle of its 3×3 everywhere; a crater on ground at the floor says no bowl formed;
// the same force call makes the same land; the picture's legend lists only what it shows; the start's water check says
// what counts; generate counts its lakes.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAll, generateMap, START_WATER_COUNTS } from "../src/maps";
import { callTool } from "../src/server";

type R = Awaited<ReturnType<typeof callTool>>;
const textOf = (r: R) => r.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n");
const json = async (name: string, args: Record<string, unknown>) => {
  const r = await callTool(name, args);
  expect(r.isError, textOf(r)).toBeFalsy();
  return JSON.parse(textOf(r));
};

beforeAll(() => closeAll());
afterAll(() => closeAll());

describe("a real place after the trial", () => {
  it("keeps its water after an edit, names the start by its middle, and legends only what it draws", async () => {
    const handle = /^Map (map-\d+) /.exec(textOf(await callTool("generate", { place: "near-mount-fuji" })))![1];
    const d = await json("describe", { map: handle, checks: false });
    const start = d.objects.find((o: { kind: string }) => o.kind === "StartingLocation");
    expect([start.x, start.y]).toEqual([d.start.x, d.start.y]);
    expect(d.featuresNote).toMatch(/^An opened map or a real place has no generator's features/);
    // a one-tile raise in the far corner: the place's stored water is the water its sources keep (the places are built
    // under the game's rules; D148: this test held the old difference, 2852 wet before and 2371 after), so the edit
    // moves no water elsewhere and no note says the file's water gave way
    const b = await json("apply", { map: handle, ops: [{ op: "brush", params: { tool: "raise", size: 1, strength: 1, dabs: [10, 500] } }] });
    expect(b.water.wetAfter).toBe(b.water.wetBefore);
    expect((b.notes ?? []).join(" ")).not.toMatch(/file's own water|water changed beyond the edit/);
    await callTool("undo", { map: handle });
    expect((await json("describe", { map: handle, checks: false })).water.bodies.reduce((n: number, w: { tiles: number }) => n + w.tiles, 0)).toBe(b.water.wetBefore);
    // the start moved a tile east: the result's to is the tile asked for (its middle)
    const m = await json("apply", { map: handle, ops: [{ op: "moveEntity", params: { id: start.id, x: d.start.x + 1, y: d.start.y } }] });
    expect(m.start.to.slice(0, 2)).toEqual([d.start.x + 1, d.start.y]);
    await callTool("undo", { map: handle });
    // a crater on ground at the floor (level 1): no bowl, and the result says why; the same call makes the same land
    const c1 = await json("apply", { map: handle, ops: [{ op: "forceResult", params: { verb: "craterize", where: { origin: [104, 16] } } }] });
    expect(c1.ground.lowered).toBe(0);
    expect(c1.notes).toContain("No bowl formed: the ground there is too low for the crater to dig (a force never cuts below its floor, level 1 unless settings.floor is given), so only its rim rose. Craterize higher ground for a bowl.");
    await callTool("undo", { map: handle });
    const c2 = await json("apply", { map: handle, ops: [{ op: "forceResult", params: { verb: "craterize", where: { origin: [104, 16] } } }] });
    expect(c2.ground).toEqual(c1.ground);
    // the legend: no lakes outlined on a place, and it says why
    const legend = textOf(await callTool("picture", { map: handle }));
    expect(legend).not.toContain("Cyan outlines");
    expect(legend).toContain("Lakes are outlined on generated maps only.");
  });
});

describe("a generated map after the trial", () => {
  it("counts its lakes, and the start's water check says what counts", async () => {
    let r = await callTool("generate", { theme: "lakeBasin", size: 96, seed: 1 });
    for (let w = /^Map (map-\d+) is not ready yet/.exec(textOf(r)); w; w = /^Map (map-\d+) is not ready yet/.exec(textOf(r))) r = await callTool("wait", { map: w[1] });
    expect(textOf(r)).toMatch(/^Lakes: [1-9]\d* \(\d+(, \d+)* wet tiles\); waterfalls: \d+\.$/m);
    const { handle, session: s } = generateMap({ theme: "riverValley", size: 96, seed: 2 });
    const id = s.built.entities.find((e) => e.template === "StartingLocation")!.id;
    await callTool("apply", { map: handle, ops: [{ op: "moveEntity", params: { id, x: 4, y: 4 } }] });
    const k = await json("check", { map: handle });
    const w = k.warnings.find((x: { id: string }) => x.id === "start.water");
    expect(w.counts).toBe(START_WATER_COUNTS);
  });
});
