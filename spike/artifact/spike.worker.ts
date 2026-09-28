// The spike's worker (EDITOR_PLAN §7, roadmap M3): the real Dam Good Maps core, bundled into a blob
// worker the way the artifact edition will ship it. It generates a map, reads and normalizes a
// .timber the viewer opened, and answers the page tools Claude calls.

import { zipSync } from "fflate";
import { importDocument } from "../../src/core/doc/document";
import { readTimber } from "../../src/core/format/timber";
import { generate } from "../../src/core/gen/generate";
import { fileName } from "../../src/core/gen/pack";
import { makeSpec } from "../../src/core/spec/mapspec";
import { validateMap } from "../../src/core/validate/checks";
import { MapSession } from "../../src/core/doc/session";

type Request =
  | { id: number; kind: "ping" }
  | { id: number; kind: "generate"; seed: number; size: number }
  | { id: number; kind: "open"; name: string; bytes: ArrayBuffer }
  | { id: number; kind: "zip"; name: string; bytes: ArrayBuffer }
  | { id: number; kind: "tool"; tool: string; input: Record<string, unknown> };

let session: MapSession | null = null;

async function sha256(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function countTemplates(templates: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of templates) out[t] = (out[t] ?? 0) + 1;
  return out;
}

async function handle(req: Request): Promise<unknown> {
  switch (req.kind) {
    case "ping":
      return { worker: true, crypto: typeof crypto?.subtle?.digest === "function", userAgent: self.navigator.userAgent };
    case "generate": {
      const t0 = performance.now();
      const r = generate(makeSpec({ seed: req.seed, size: { x: req.size, y: req.size } }));
      const ms = Math.round(performance.now() - t0);
      session = MapSession.fromGenerated(r);
      const bytes = r.bytes.slice();
      return {
        name: fileName(r.spec),
        size: `${req.size}×${req.size}`,
        ms,
        passed: r.report.passed,
        attempts: r.attempts,
        entities: r.built.entities.length,
        sha256: await sha256(bytes),
        bytes,
      };
    }
    case "open": {
      const t0 = performance.now();
      const bytes = new Uint8Array(req.bytes);
      const raw = readTimber(bytes);
      const doc = importDocument(bytes, req.name);
      const s = MapSession.open(doc);
      const w = s.exportFile().world;
      const load = validateMap(s.exportFile(), { profile: "import", loadOnly: true, external: true }).report.checks;
      session = s;
      const templates = countTemplates(w.entities.map((e) => String(e.Template)));
      const top = Object.entries(templates)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
      return {
        name: req.name,
        bytes: bytes.length,
        ms: Math.round(performance.now() - t0),
        size: `${w.sizeX}×${w.sizeY}`,
        version: raw.world.gameVersion,
        layers: raw.world.layers,
        entities: w.entities.length,
        starts: templates.StartingLocation ?? 0,
        topTemplates: top,
        caves: doc.base.runs.length,
        changes: doc.meta.source!.report.changes.map((c) => c.message),
        flags: doc.meta.source!.report.flags.map((f) => f.message),
        loadChecks: { passed: load.filter((c) => c.ok).length, failed: load.filter((c) => !c.ok).map((c) => c.id) },
      };
    }
    case "zip": {
      const zip = zipSync({ [req.name]: [new Uint8Array(req.bytes), { level: 6, mtime: new Date(2026, 0, 1) }] });
      return { bytes: zip, sha256: await sha256(zip) };
    }
    case "tool":
      return tool(req.tool, req.input);
  }
}

/** The page functions offered to Claude, answered from the open map. */
function tool(name: string, input: Record<string, unknown>): unknown {
  if (!session) throw new Error("no map is open yet");
  const b = session.built;
  const W = b.W;
  switch (name) {
    case "map_facts": {
      const counts = countTemplates(b.entities.map((e) => e.template));
      return { width: b.W, height: b.H, seed: session.spec?.seed ?? null, name: session.meta.name, entities: b.entities.length, pineTrees: counts.Pine ?? 0, slopes: counts.Slope ?? 0 };
    }
    case "height_at": {
      const x = Math.floor(Number(input.x));
      const y = Math.floor(Number(input.y));
      if (!(x >= 0 && x < b.W && y >= 0 && y < b.H)) throw new Error(`(${String(input.x)}, ${String(input.y)}) is outside the ${b.W}×${b.H} map`);
      return { x, y, height: b.heights[y * W + x], waterDepth: Math.round(b.water[y * W + x] * 1000) / 1000 };
    }
    case "find_start": {
      const s = b.entities.find((e) => e.template === "StartingLocation");
      if (!s) throw new Error("the map has no start");
      return { x: s.x, y: s.y, z: s.z, orientation: s.orientation };
    }
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

self.onmessage = async (ev: MessageEvent<Request>) => {
  const req = ev.data;
  try {
    const result = await handle(req);
    const transfer: Transferable[] = [];
    if (result && typeof result === "object" && "bytes" in result && (result as { bytes: unknown }).bytes instanceof Uint8Array) {
      transfer.push(((result as { bytes: Uint8Array }).bytes.buffer as ArrayBuffer));
    }
    (self as unknown as Worker).postMessage({ id: req.id, ok: true, result }, transfer);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
