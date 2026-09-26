// Real places (ROADMAP "Real places", PLAN §20 D136): the gallery's data, its credits, both
// validators on a sample, the editor's import of a place, and the rule that real places never feed
// the generator. Every place's own build and validation: places-build-*.test.ts.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { gzipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { jpegSize } from "../../src/core/validate/checks";
import { readTimber } from "../../src/core/format/timber";
import { PROVIDER_NOTICES } from "../../src/core/places/attribution";
import { placeDescription, placeTimber } from "../../src/core/places/place";
import { validateMap } from "../../src/core/validate/checks";
import type { CheckResult } from "../../src/core/validate/report";
import { INDEX, PLACES_DIR, PLACES_HAVE_EDGE_WALLS, PLACES_LACK_MINE_SITES, PLACES_SOURCES_IN_FLOW, placeData, sha256 } from "./placesCommon";

describe("the gallery's data", () => {
  it("holds the survey's real places: no random-land controls, one entry and two files each", () => {
    expect(INDEX.format).toBe(1);
    expect(INDEX.count).toBe(INDEX.places.length);
    expect(INDEX.count).toBe(85);
    expect(INDEX.places.filter((p) => p.family === "random" || /random/i.test(p.name))).toEqual([]);
    expect(new Set(INDEX.places.map((p) => p.id)).size).toBe(INDEX.count);
    expect(new Set(INDEX.places.map((p) => p.name)).size).toBe(INDEX.count);
    expect(INDEX.sizes).toEqual([96, 128, 256]);
    expect(INDEX.families.map((f) => f.id).sort()).toEqual([...new Set(INDEX.places.map((p) => p.family))].sort());
    for (const p of INDEX.places) {
      expect(p.id, p.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(p.name, p.id).toMatch(/^Near \S/);
      expect(p.name, p.id).not.toMatch(/sample|m per tile|badwater/i);
      expect(p.plays.length, p.id).toBeLessThan(100);
      expect(existsSync(join(PLACES_DIR, p.data)), p.data).toBe(true);
      const card = new Uint8Array(readFileSync(join(PLACES_DIR, p.image)));
      expect(jpegSize(card), p.image).toEqual([240, 240]);
      expect(card.length, p.image).toBeLessThan(16_000);
    }
    // nothing else is published
    const listed = new Set(INDEX.places.flatMap((p) => [p.data, p.image]));
    for (const dir of ["data", "cards"]) for (const f of readdirSync(join(PLACES_DIR, dir))) expect(listed.has(`${dir}/${f}`), `${dir}/${f}`).toBe(true);
  });

  it("each place's data matches its entry", () => {
    for (const entry of INDEX.places) {
      const p = placeData(entry);
      expect([p.id, p.name, p.family, p.familyName, p.plays, p.W, p.H, p.metres], entry.id).toEqual([entry.id, entry.name, entry.family, entry.familyName, entry.plays, entry.size, entry.size, entry.metres]);
      expect(p.heights.length).toBe(p.W * p.H);
      expect(p.place).toBe(p.name.replace(/^Near /, ""));
    }
  });

  it("stays light: the page loads the index and the cards, a map's data only when it is used", () => {
    const size = (p: string) => statSync(join(PLACES_DIR, p)).size;
    const data = INDEX.places.reduce((s, p) => s + size(p.data), 0);
    const cards = INDEX.places.reduce((s, p) => s + size(p.image), 0);
    console.log(`real places: index ${size("index.json")} B, data ${data} B (largest ${Math.max(...INDEX.places.map((p) => size(p.data)))} B), cards ${cards} B`);
    expect(size("index.json")).toBeLessThan(64_000);
    expect(Math.max(...INDEX.places.map((p) => size(p.data)))).toBeLessThan(64_000);
  });
});

describe("credits and the in-game description (investigation/landscapes/ATTRIBUTION.md)", () => {
  it("every map says what it is, that it is not a replica, and credits the elevation data", () => {
    for (const entry of INDEX.places) {
      const p = placeData(entry);
      const d = placeDescription(p);
      expect(d).toContain(`Inspired by the land near ${p.place}, at Timberborn's scale; not a replica.`);
      expect(d).toContain("public elevation data");
      expect(d).toContain("Terrain Tiles");
      expect(d).toContain("do not endorse");
      for (const n of PROVIDER_NOTICES) expect(d).toContain(n);
      expect(d.startsWith(`${p.familyName} · ${p.W}×${p.H} · ${p.metres} m per tile. ${p.plays}`)).toBe(true);
    }
  });
});

// A sample for the slower checks: the first two places at 96² and 128², and the first at 256².
const SAMPLE = INDEX.sizes.flatMap((s) => INDEX.places.filter((p) => p.size === s).slice(0, s < 256 ? 2 : 1));
const builds = new Map<string, ReturnType<typeof placeTimber>>();
const built = (id: string) => {
  if (!builds.has(id)) builds.set(id, placeTimber(placeData(INDEX.places.find((p) => p.id === id)!)));
  return builds.get(id)!;
};

describe("a sample of places", () => {
  it("writes the description into the file, and the file is the index's", () => {
    for (const e of SAMPLE) {
      const r = built(e.id);
      const file = readTimber(r.bytes);
      expect(file.metadata?.MapDescription).toBe(placeDescription(placeData(e)));
      expect(sha256(r.bytes)).toBe(e.sha256);
    }
  });

  it("Refine: the editor imports a place, and exports it unedited as the same file", () => {
    for (const e of SAMPLE) {
      const r = built(e.id);
      const s = MapSession.importMap(r.bytes, r.fileName);
      expect(s.mode).toBe("import");
      expect(s.meta.name).toBe(e.name);
      expect(s.size).toEqual({ x: e.size, y: e.size });
      expect(s.validate("import", { loadOnly: true }).report.passed).toBe(true);
      const out = s.exportTimber();
      expect(out.fileName).toBe(`${e.name}.timber`);
      expect(sha256(out.bytes)).toBe(e.sha256);
    }
  });
});

// The Python validator (prototype/validate.py), as the oracle runs it: the same verdict for every
// check. CI installs Python; a machine without it skips this.
function python(): string | null {
  for (const exe of [process.env.PYTHON ?? "python", "python3"]) {
    const r = spawnSync(exe, ["-c", "import numpy"], { encoding: "utf8" });
    if (!r.error && r.status === 0) return exe;
  }
  return null;
}
const PY = python();
if (!PY && process.env.CI) throw new Error("CI needs Python with numpy for the real places oracle");

describe.skipIf(!PY)("both validators agree on the sample (prototype/validate.py)", () => {
  it("every check has the same verdict, and every map passes both but for the conversion's known faults, which both flag", () => {
    const dir = join(".scratch", "places-oracle");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const paths: string[] = [];
    for (const e of SAMPLE) {
      const p = join(dir, `${e.id}.timber`);
      writeFileSync(p, built(e.id).bytes);
      // an explicit empty feature list, as the survey's oracle wrote it: Python also checks outflow
      writeFileSync(join(dir, `${e.id}.damgoodmaps.json`), gzipSync(strToU8(JSON.stringify({ spec: null, features: [] })), { mtime: 0 }));
      paths.push(p);
    }
    const r = spawnSync(PY!, ["-B", "prototype/validate.py", "--json", ...paths], { encoding: "utf8", maxBuffer: 256 << 20 });
    expect(r.error).toBeUndefined();
    const reports = new Map<string, { passed: boolean; checks: { id: string; ok: boolean; na: boolean; approx?: string }[] }>();
    for (const line of (r.stdout ?? "").split(/\r?\n/)) if (line.startsWith("{")) {
      const j = JSON.parse(line) as { path: string; passed: boolean; checks: { id: string; ok: boolean; na: boolean; approx?: string }[] };
      reports.set(relative(".", j.path).split(sep).join("/"), j);
    }
    const ts = (c: CheckResult) => (c.applicable === false ? "na" : c.approximate ? "approx" : c.ok ? "pass" : "fail");
    const py = (c: { ok: boolean; na: boolean; approx?: string }) => (c.na ? "na" : c.approx ? "approx" : c.ok ? "pass" : "fail");
    for (const [k, e] of SAMPLE.entries()) {
      const rep = reports.get(paths[k].split(sep).join("/"));
      expect(rep, `${e.id}: no Python report. ${r.stderr ?? ""}`).toBeDefined();
      const known = [...(PLACES_HAVE_EDGE_WALLS ? ["terrain.edge_wall"] : []), ...(PLACES_SOURCES_IN_FLOW.has(e.id) ? ["water.source_in_flow"] : []), ...(PLACES_LACK_MINE_SITES ? ["resources.mine_site"] : [])];
      expect(rep!.passed, e.id).toBe(known.length === 0);
      expect(rep!.checks.filter((c) => !c.ok && !c.na && !c.approx && !(c as { advisory?: boolean }).advisory).map((c) => c.id).sort(), e.id).toEqual(known.sort());
      const b = built(e.id);
      const v = validateMap(readTimber(b.bytes), { profile: "generate", designedFor: "normal", features: [], water: { model: b.validation.model!, settled: b.validation.water! } });
      const a = Object.fromEntries(v.report.checks.map((c) => [c.id, ts(c)]));
      const p = Object.fromEntries(rep!.checks.map((c) => [c.id, py(c)]));
      expect(p, e.id).toEqual(a);
    }
    expect(r.status).toBe(PLACES_HAVE_EDGE_WALLS || PLACES_LACK_MINE_SITES || SAMPLE.some((e) => PLACES_SOURCES_IN_FLOW.has(e.id)) ? 1 : 0);
  });
});

describe("real places stay out of the generator (D108)", () => {
  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      if (e.isDirectory()) out.push(...sources(path));
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(path);
    }
    return out;
  }

  it("only the gallery, the editor's worker and the page's Refine link use them", () => {
    const users = sources("src")
      .filter((f) => /from\s+["'][^"']*places\/[^"']*["']/.test(readFileSync(f, "utf8")))
      .map((f) => f.split(sep).join("/"))
      .filter((f) => !f.startsWith("src/places/") && !f.startsWith("src/core/places/"))
      .sort();
    expect(users).toEqual(["src/ui/App.tsx", "src/worker/generator.worker.ts"]);
    // the page's Refine link loads only the fetch helpers, never the place builder
    expect(readFileSync("src/ui/App.tsx", "utf8")).not.toMatch(/core\/places/);
  });
});
