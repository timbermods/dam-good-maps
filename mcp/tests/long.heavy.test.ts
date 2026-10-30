// A 256² generate through the MCP server (D501) with the SDK client's own time limit on every call (60 s): the map comes
// however long the generator takes, since each call waits for it at most WAIT_MS and then says it is not ready, and
// wait gets it. The stages come as progress while the calls wait, and the map's handle refuses an edit until it is made.
// The map is the one made on this thread, byte for byte.
// (the heavy suite: a 256² map takes a minute or more)

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { DEFAULT_REQUEST_TIMEOUT_MSEC } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { afterAll, beforeAll, expect, it } from "vitest";
import { WAIT_MS } from "../src/jobs";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { closeAll, exportFiles, mapOf, specOf } from "../src/maps";
import { createServer } from "../src/server";

type Result = { content: { type: string; text?: string }[]; isError?: boolean };
const textOf = (r: Result) => r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");

let client: Client;

beforeAll(async () => {
  closeAll();
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer().connect(a);
  client = new Client({ name: "test", version: "0" });
  await client.connect(b);
});

afterAll(async () => {
  await client.close();
});

it("makes a 256² map within the client's time limit on each call, with progress", async () => {
  const progress: string[] = [];
  const longest: number[] = [];
  // (the SDK's default time limit, as Claude Desktop and other clients built on it keep it)
  const options = { timeout: DEFAULT_REQUEST_TIMEOUT_MSEC, onprogress: (p: { message?: string }) => void (p.message && progress.push(p.message)) };
  const t0 = performance.now();
  const timed = async (name: string, args: Record<string, unknown>) => {
    const t = performance.now();
    const r = (await client.callTool({ name, arguments: args }, undefined, options)) as Result;
    longest.push(performance.now() - t);
    return r;
  };
  let r = await timed("generate", { theme: "riverValley", size: 256, seed: 1 });
  let calls = 1;
  for (;;) {
    const waiting = /^Map (map-\d+) is not ready yet/.exec(textOf(r));
    if (!waiting) break;
    if (calls === 1) {
      // (the handle refuses an edit while the map is made, and says to wait)
      const d = (await client.callTool({ name: "describe", arguments: { map: waiting[1] } })) as Result;
      expect(d.isError).toBe(true);
      expect(textOf(d)).toBe(`Map ${waiting[1]} is not ready yet: call wait with it`);
    }
    r = await timed("wait", { map: waiting[1] });
    calls++;
  }
  const seconds = (performance.now() - t0) / 1000;
  expect(r.isError, textOf(r)).toBeFalsy();
  expect(textOf(r)).toMatch(/^Map map-1 \(generated in /);
  expect(progress.some((m) => /^Attempt \d+: (raising the land|running the rivers|settling the water)/.test(m)), progress.join(" | ")).toBe(true);
  // (every call answered within the client's limit, or the client would have thrown; a map that took longer to make
  // than one call waits came through wait)
  const genSeconds = Number(/generated in ([\d.]+) s/.exec(textOf(r))![1]);
  if (genSeconds * 1000 > WAIT_MS) expect(calls).toBeGreaterThan(1);
  // the map made in the worker (its 3D forms' voxel terrain crossed to this thread) is the map made here, byte for byte
  const here = generate(specOf({ theme: "riverValley", size: 256, seed: 1 }).spec);
  const a = exportFiles(MapSession.fromGenerated(here, here.file));
  const b = exportFiles(mapOf("map-1"));
  expect(Buffer.compare(Buffer.from(a.timber), Buffer.from(b.timber))).toBe(0);
  expect(Buffer.compare(Buffer.from(a.project), Buffer.from(b.project))).toBe(0);
  console.info(`256²: generated in ${genSeconds} s, ${seconds.toFixed(0)} s in ${calls} calls (the longest ${(Math.max(...longest) / 1000).toFixed(0)} s), ${progress.length} progress notifications`);
});
