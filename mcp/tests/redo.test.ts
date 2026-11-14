// PR 4 of the MCP round (planning, 2026-11-14): redo beside undo, on the core's own history; the falls and lakes in
// describe and the picture; a refused placement naming the nearest tile the core's planner would take; Craterize's
// server default size.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAll, generateMap } from "../src/maps";
import { callTool } from "../src/server";

type R = Awaited<ReturnType<typeof callTool>>;
const textOf = (r: R) => r.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n");
const dir = mkdtempSync(join(tmpdir(), "dgm-mcp-redo-"));

beforeAll(() => closeAll());
afterAll(() => {
  closeAll();
  rmSync(dir, { recursive: true, force: true });
});

describe("redo", () => {
  it("brings back what undo took, says what, refuses when there is nothing, and a new edit clears it", async () => {
    const { handle, session: s } = generateMap({ theme: "riverValley", size: 96, seed: 2 });
    const flat = s.built.heights.slice();
    const force = { op: "forceResult", params: { verb: "craterize", where: { origin: [20, 20] }, settings: { size: 12 } } };
    expect((await callTool("apply", { map: handle, ops: [force] })).isError).toBeFalsy();
    const cratered = s.built.heights.slice();
    expect(textOf(await callTool("redo", { map: handle }))).toBe("There is nothing to redo");
    expect(textOf(await callTool("undo", { map: handle }))).toBe("Undone: Craterize.");
    expect(Buffer.compare(Buffer.from(s.built.heights), Buffer.from(flat))).toBe(0);
    // back at the generated map: the website line is the share link again (the core's edit count, as the page's)
    expect(textOf(await callTool("save", { map: handle, folder: dir }))).toMatch(/^On the website: https:\/\/\S+#/m);
    // a refused operation leaves redo as it was
    expect((await callTool("apply", { map: handle, ops: [{ op: "setDescription", params: { text: "a".repeat(700) } }] })).isError).toBe(true);
    expect(textOf(await callTool("redo", { map: handle }))).toBe("Redone: Craterize.");
    expect(Buffer.compare(Buffer.from(s.built.heights), Buffer.from(cratered))).toBe(0);
    expect(textOf(await callTool("save", { map: handle, folder: dir }))).toMatch(/^On the website: open .+ with File → Open… or by dropping it on the page\.$/m);
    // undo, then a new edit: redo has nothing to bring back
    await callTool("undo", { map: handle });
    await callTool("apply", { map: handle, ops: [{ ...force, params: { ...force.params, where: { origin: [70, 70] } } }] });
    const r = await callTool("redo", { map: handle });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toBe("There is nothing to redo");
  });
});

describe("falls, lakes, the nearest tile and the crater's size", () => {
  it("lists falls and lakes in describe and marks them on the picture", async () => {
    const { handle } = generateMap({ theme: "canyon", size: 96, seed: 12 });
    const d = JSON.parse(textOf(await callTool("describe", { map: handle, checks: false })));
    const falls = d.features.filter((f: { kind: string }) => f.kind === "waterfall");
    expect(falls.length).toBeGreaterThan(0);
    for (const f of falls) {
      expect(f.drop).toBeGreaterThanOrEqual(2);
      expect(f.tiles.length).toBeGreaterThan(0);
      expect(f.at).toEqual([expect.any(Number), expect.any(Number)]);
    }
    expect(d.features.some((f: { kind: string; wetTiles?: number }) => f.kind === "lake" && (f.wetTiles ?? 0) > 0)).toBe(true);
    const pic = await callTool("picture", { map: handle });
    expect(textOf(pic)).toContain("Orange: waterfalls (a drop of 2 levels or more). Cyan outlines: lakes.");
  });

  it("names the nearest tile a refused start can take, and that tile takes it", async () => {
    const { handle, session: s } = generateMap({ theme: "riverValley", size: 96, seed: 2 });
    const W = s.size.x;
    const id = s.built.entities.find((e) => e.template === "StartingLocation")!.id;
    let wet = 0;
    while (!(s.built.water[wet] > 0.5)) wet++;
    const r = await callTool("apply", { map: handle, ops: [{ op: "moveEntity", params: { id, x: wet % W, y: Math.floor(wet / W) } }] });
    expect(r.isError).toBe(true);
    const m = /^the start can't stand there: in a river\. The nearest tile where it can go is X (\d+) · Y (\d+)$/.exec(textOf(r));
    expect(m, textOf(r)).toBeTruthy();
    const ok = await callTool("apply", { map: handle, ops: [{ op: "moveEntity", params: { id, x: Number(m![1]), y: Number(m![2]) } }] });
    expect(ok.isError, textOf(ok)).toBeFalsy();
  });

  it("makes a craterize 20 across unless a size is given; null follows power", async () => {
    const { handle, session: s } = generateMap({ theme: "riverValley", size: 96, seed: 2 });
    const sizeOf = () => (s.logOps.at(-1)!.params as unknown as { settings: { size: number | null } }).settings.size;
    await callTool("apply", { map: handle, ops: [{ op: "forceResult", params: { verb: "craterize", where: { origin: [20, 20] } } }] });
    expect(sizeOf()).toBe(20);
    await callTool("undo", { map: handle });
    await callTool("apply", { map: handle, ops: [{ op: "forceResult", params: { verb: "craterize", where: { origin: [20, 20] }, settings: { size: null } } }] });
    expect(sizeOf()).toBeNull();
  });
});
