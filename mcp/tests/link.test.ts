// The way back to the website (planning, 2026-11-14), and a start move never silent: generate, save and open name
// where the map opens on the site (an unedited generated map's share link, made by the page's own encoder; an unedited
// real place's link; else how its project opens there), and apply puts the start checks that now fail first.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { decodeSpecFragment } from "../../src/core/spec/mapspec";
import manifest from "../manifest.json" with { type: "json" };
import { closeAll, exportFiles, mapOf } from "../src/maps";
import { callTool, SITE } from "../src/server";

type R = Awaited<ReturnType<typeof callTool>>;
const textOf = (r: R) => r.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n");
async function made(args: Record<string, unknown>): Promise<R> {
  let r = await callTool("generate", args);
  for (let m = /^Map (map-\d+) is not ready yet/.exec(textOf(r)); m; m = /^Map (map-\d+) is not ready yet/.exec(textOf(r))) r = await callTool("wait", { map: m[1] });
  expect(r.isError, textOf(r)).toBeFalsy();
  return r;
}
const dir = mkdtempSync(join(tmpdir(), "dgm-mcp-link-"));

beforeAll(() => closeAll());
afterAll(() => {
  closeAll();
  rmSync(dir, { recursive: true, force: true });
});

describe("the website's link", () => {
  it("is the page's share link for an unedited map, and it makes the same map", async () => {
    expect(SITE).toBe(manifest.homepage);
    const r = await made({ theme: "riverValley", size: 96, seed: 2 });
    const handle = /^Map (map-\d+) /.exec(textOf(r))![1];
    const link = new RegExp(`^On the website: ${SITE.replace(/[.]/g, "\\.")}#(.+)$`, "m").exec(textOf(r));
    expect(link, textOf(r)).toBeTruthy();
    const decoded = decodeSpecFragment(link![1])!;
    expect(decoded.problems).toEqual([]);
    const s = mapOf(handle);
    // (the map's spec less what the generator recorded of its run, `accepted`: the link carries what was asked)
    const { accepted: _run, ...asked } = s.spec! as typeof s.spec & { accepted?: unknown };
    expect(decoded.spec).toEqual(asked);
    const g = generate(decoded.spec);
    const a = exportFiles(MapSession.fromGenerated(g, g.file));
    expect(Buffer.compare(Buffer.from(a.timber), Buffer.from(exportFiles(s).timber))).toBe(0);
    // saved unedited: the same link; edited: the project file and how it opens
    expect(textOf(await callTool("save", { map: handle, folder: dir }))).toContain(`On the website: ${SITE}#${link![1]}`);
    const id = s.built.entities.find((e) => e.template === "StartingLocation")!.id;
    await callTool("apply", { map: handle, ops: [{ op: "moveEntity", params: { id, x: s.built.start!.x + 1, y: s.built.start!.y } }] });
    const saved = textOf(await callTool("save", { map: handle, folder: dir }));
    expect(saved).toMatch(new RegExp(`^On the website: open .+\\.damgoodmaps\\.json at ${SITE.replace(/[.]/g, "\\.")} with File → Open… or by dropping it on the page\\.$`, "m"));
  });

  it("is the place's own link for an unedited real place", async () => {
    expect(textOf(await callTool("generate", { place: "near-aso-caldera" }))).toContain(`On the website: ${SITE}#place=near-aso-caldera`);
  });
});

describe("a start move", () => {
  it("returns the start checks that now fail first, and nothing when they pass", async () => {
    const r = await made({ theme: "riverValley", size: 96, seed: 2 });
    const handle = /^Map (map-\d+) /.exec(textOf(r))![1];
    const s = mapOf(handle);
    const st = s.built.start!;
    const id = s.built.entities.find((e) => e.template === "StartingLocation")!.id;
    // a tile over: every start check still passes
    const near = JSON.parse(textOf(await callTool("apply", { map: handle, ops: [{ op: "moveEntity", params: { id, x: st.x + 1, y: st.y } }] })));
    expect(near.start).toBeDefined();
    expect(near.startChecks).toBeUndefined();
    await callTool("undo", { map: handle });
    // to the dry corner (X 4 · Y 4, 30 tiles from water): cut off, and the result says so first, not refused
    const far = await callTool("apply", { map: handle, ops: [{ op: "moveEntity", params: { id, x: 4, y: 4 } }] });
    expect(far.isError, textOf(far)).toBeFalsy();
    expect(textOf(far)).toMatch(/^\{"startChecks":\[/);
    const c = JSON.parse(textOf(far));
    expect(c.startChecks).toContain("No clean water within 64 tiles' walk of the start: move the start to ground that walks to clean water, or lead water to it (canal, or a WaterSource with placeEntity).");
  });
});
