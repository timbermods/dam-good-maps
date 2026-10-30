// The MCP server (D141, D501) driven in-process through the SDK's own client: generate, a force and a brush, a
// refusal word for word, the checks, then save; the saved files are the core's export of the same project, and the
// project opened and saved again gives the same bytes (D455). The map is made in the generator's worker, and a call
// here waits for it only a quarter of a second: so generate answers that the map is not ready, wait gets it, and the
// progress comes while they wait.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { setWaitMs } from "../src/jobs";
import { generate } from "../../src/core/gen/generate";
import { closeAll, exportFiles, mapOf, specOf } from "../src/maps";
import { createServer, TOOLS } from "../src/server";

type Content = { type: string; text?: string; data?: string; mimeType?: string };
type Result = { content: Content[]; isError?: boolean };

let client: Client;
const dir = mkdtempSync(join(tmpdir(), "dgm-mcp-"));
const again = mkdtempSync(join(tmpdir(), "dgm-mcp-again-"));

async function call(name: string, args: Record<string, unknown>): Promise<Result> {
  return (await client.callTool({ name, arguments: args })) as Result;
}
const textOf = (r: Result) => r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");

/** Generate, then wait until the map is ready, each call with a client time limit far shorter than the map takes. */
async function make(args: Record<string, unknown>): Promise<{ result: Result; calls: number; progress: string[] }> {
  const progress: string[] = [];
  const options = { timeout: 20_000, onprogress: (p: { message?: string }) => void (p.message && progress.push(p.message)) };
  let result = (await client.callTool({ name: "generate", arguments: args }, undefined, options)) as Result;
  let calls = 1;
  for (;;) {
    const waiting = /^Map (map-\d+) is not ready yet/.exec(textOf(result));
    if (!waiting) return { result, calls, progress };
    result = (await client.callTool({ name: "wait", arguments: { map: waiting[1] } }, undefined, options)) as Result;
    calls++;
  }
}

beforeAll(async () => {
  closeAll();
  setWaitMs(250);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer().connect(a);
  client = new Client({ name: "test", version: "0" });
  await client.connect(b);
});

afterAll(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
  rmSync(again, { recursive: true, force: true });
});

describe("the Dam Good Maps MCP server", () => {
  it("lists its nine tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["apply", "check", "describe", "generate", "open", "picture", "save", "undo", "wait"]);
    expect(TOOLS.every((t) => t.description && t.description.length < 1200)).toBe(true);
  });

  it("generates, edits, refuses, checks, saves and reopens a map byte for byte", async () => {
    // a map made in more time than a call waits: generate says so, wait gets it, and the stages come as progress
    const made = await make({ theme: "riverValley", size: 96, seed: 7 });
    const g = made.result;
    expect(g.isError, textOf(g)).toBeFalsy();
    expect(made.calls).toBeGreaterThan(1);
    expect(made.progress.some((m) => /^Attempt \d+: (raising the land|running the rivers|settling the water)/.test(m)), made.progress.join(" | ")).toBe(true);
    // (wait again gives the made map again)
    expect(textOf(await call("wait", { map: "map-1" }))).toMatch(/^Map map-1 \(generated in /);
    // the map made in the worker is the map made on this thread, byte for byte
    {
      const r = generate(specOf({ theme: "riverValley", size: 96, seed: 7 }).spec);
      const here = MapSession.fromGenerated(r, r.file);
      const a = exportFiles(here);
      const b = exportFiles(mapOf("map-1"));
      expect(Buffer.compare(Buffer.from(a.timber), Buffer.from(b.timber))).toBe(0);
      expect(Buffer.compare(Buffer.from(a.project), Buffer.from(b.project))).toBe(0);
    }
    expect(textOf(g)).toMatch(/^Map map-1 /);
    expect(textOf(g)).toContain("Start: X ");
    expect(g.content.some((c) => c.type === "image" && c.mimeType === "image/png" && (c.data?.length ?? 0) > 1000)).toBe(true);
    const s = mapOf("map-1");
    const start = s.built.start!;
    // a water source moves as the page drags one, and a crop is one step, each taken back
    const src = s.built.entities.find((e) => e.template === "WaterSource")!;
    const moved = await call("apply", { map: "map-1", ops: [{ op: "moveEntity", params: { id: src.id, x: src.x + 1, y: src.y } }] });
    expect(moved.isError, textOf(moved)).toBeFalsy();
    expect(textOf(await call("undo", { map: "map-1" }))).toBe("Undone: Move an object.");
    const cropped = await call("apply", { map: "map-1", ops: [{ op: "crop", params: { x: Math.max(0, start.x - 30), y: Math.max(0, start.y - 30), w: 60, h: 60 } }] });
    expect(cropped.isError, textOf(cropped)).toBeFalsy();
    expect(JSON.parse(textOf(cropped)).size).toEqual({ x: 60, y: 60 });
    await call("undo", { map: "map-1" });
    expect(s.size).toEqual({ x: 96, y: 96 });
    // a force away from the start, by its verb and where: the engine plans and keeps it
    const fx = start.x < 48 ? 72 : 22;
    const fy = start.y < 48 ? 72 : 22;
    const force = await call("apply", { map: "map-1", ops: [{ op: "forceResult", params: { verb: "craterize", settings: { power: 35 }, where: { origin: [fx, fy] } } }], picture: true });
    expect(force.isError, textOf(force)).toBeFalsy();
    const fc = JSON.parse(force.content[0].text!);
    expect(fc.ground.tiles).toBeGreaterThan(0);
    expect(force.content.some((c) => c.type === "image")).toBe(true);
    // a brush stroke: a raise pressed again and again on one tile
    const bx = fx === 72 ? 20 : 76;
    const dabs = Array.from({ length: 40 }, () => [4 * bx + 2, 4 * fy + 2]).flat();
    const brush = await call("apply", { map: "map-1", ops: [{ op: "brush", params: { tool: "raise", size: 3, strength: 8, dabs } }] });
    expect(brush.isError, textOf(brush)).toBeFalsy();
    expect(JSON.parse(brush.content[0].text!).ground.raised).toBeGreaterThan(0);
    // a refusal comes back word for word, and nothing changes
    const steps = s.history().filter((h) => h.applied).length;
    const tooLong = { op: "setDescription", params: { text: "a".repeat(700) } } as const;
    const why = s.check(tooLong)[0];
    expect(why).toBeTruthy();
    const refused = await call("apply", { map: "map-1", ops: [{ op: "sculpt", params: { mode: "raise", cells: [[10, 10, 12]], amount: 1 } }, tooLong] });
    expect(refused.isError).toBe(true);
    expect(textOf(refused)).toBe(why);
    expect(s.history().filter((h) => h.applied).length).toBe(steps);
    // undo takes back the brush stroke; the checks run; save writes both files
    expect(textOf(await call("undo", { map: "map-1" }))).toMatch(/^Undone: /);
    const check = JSON.parse(textOf(await call("check", { map: "map-1" })));
    expect(check.saves).toBe(true);
    const saved = await call("save", { map: "map-1", folder: dir });
    expect(saved.isError, textOf(saved)).toBeFalsy();
    const files = readdirSync(dir).sort();
    expect(files).toEqual(["dgm-river-valley-7.damgoodmaps.json", "dgm-river-valley-7.timber"]);
    const timber = readFileSync(join(dir, files[1]));
    const project = readFileSync(join(dir, files[0]));
    // the bytes are the core's export of the same project: the project opened afresh and exported as the page does
    const fresh = MapSession.open(decodeProject(new Uint8Array(project)));
    const core = exportFiles(fresh);
    expect(Buffer.compare(timber, Buffer.from(core.timber))).toBe(0);
    expect(Buffer.compare(project, Buffer.from(core.project))).toBe(0);
    // and the edited map's own project file, as the page's File > Save project writes it (gzip level 9)
    expect(Buffer.compare(project, Buffer.from(s.project(9)))).toBe(0);
    // a second save never overwrites: it takes the next free name
    await call("save", { map: "map-1", folder: dir });
    expect(readdirSync(dir).sort()).toContain("dgm-river-valley-7-2.timber");
    // open, then save: the same bytes
    const opened = await call("open", { path: join(dir, files[0]) });
    expect(opened.isError, textOf(opened)).toBeFalsy();
    const handle = /^Map (map-\d+)\./.exec(textOf(opened))![1];
    const d = JSON.parse(textOf(await call("describe", { map: handle, tiles: [[start.x, start.y]] })));
    expect(d.start).toEqual({ x: start.x, y: start.y, z: expect.any(Number) });
    expect(d.checks.stopSaving).toEqual([]);
    await call("save", { map: handle, folder: again });
    expect(Buffer.compare(readFileSync(join(again, files[1])), timber)).toBe(0);
    expect(Buffer.compare(readFileSync(join(again, files[0])), project)).toBe(0);
    // a picture of a region with a layer
    const pic = await call("picture", { map: handle, layer: "depth", region: { x: 0, y: 0, w: 32, h: 32 } });
    expect(pic.content.some((c) => c.type === "image")).toBe(true);
  });
});
