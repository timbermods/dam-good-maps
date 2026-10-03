// Carves saved before D220 open exactly (D158, D462 answer 2). Before the forces shared one operation,
// `forceResult`, a carve was kept as its own `carve` operation. A project holding one is converted to
// `forceResult` when it opens (doc/document.ts `upgradeCarves`, with forces/op.ts `forceOfCarve`, the
// conversion the build always applied), so Kyler's saved projects open with their land, objects and
// water as they were. The project (tests/fixtures/carves-before-d220.*) holds an aimed carve that
// sealed an oxbow lake, a river kept with its row of sources, its Width, Depth and walls set and the
// layer showing, a dry canyon stopped early, and a Try another path that replaced it (its undo data
// holding the canyon's `carve`). Project and digests were written by the code before the `carve`
// operation was retired (this file's DGM_RECORD branch at f8b61db6), so the digests are of the map that
// code built.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";

const DIR = join(__dirname, "../fixtures");
const PROJECT = join(DIR, "carves-before-d220.damgoodmaps.json");
const DIGESTS = join(DIR, "carves-before-d220.json");
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex").slice(0, 16);
const entitiesOf = (s: MapSession) => sha(new TextEncoder().encode(s.built.entities.map((e) => `${e.id}@${e.template},${e.x},${e.y},${e.z},${e.orientation}`).join("|")));

interface Digests {
  written: string;
  heights: string;
  entities: string;
  water: string;
  timber: string;
  /** The last carve (Try another path) undone: the dry canyon it replaced is back. */
  undone: string;
}

describe("carves saved before D220 open exactly (D158)", () => {
  it("the file holds carve operations; opened, they are the forces' one operation", () => {
    const bytes = new Uint8Array(readFileSync(PROJECT));
    const raw = JSON.parse(strFromU8(gunzipSync(bytes))) as { edits: { op: string; undo?: { replaced?: { op: { op: string } } } }[] };
    expect(raw.edits.map((e) => e.op)).toEqual(["carve", "carve", "carve", "carve"]);
    expect(raw.edits[3].undo?.replaced?.op.op).toBe("carve");
    const doc = decodeProject(bytes);
    expect(doc.edits.map((e) => e.op)).toEqual(["forceResult", "forceResult", "forceResult", "forceResult"]);
    expect((doc.edits[3].undo?.replaced?.op as { op: string }).op).toBe("forceResult");
    const s = MapSession.open(doc);
    expect(s.history().filter((h) => h.applied).map((h) => h.label)).toEqual(["Carve a river", "Carve a river", "Carve a dry canyon", "Try another path"]);
    // saved again, it holds only the shared operation and opens to the same map
    const again = MapSession.open(decodeProject(s.project()));
    expect(strFromU8(gunzipSync(s.project()))).not.toContain('"op":"carve"');
    expect(Array.from(again.built.heights)).toEqual(Array.from(s.built.heights));
  });

  it("the project saved with them opens to the same map, its objects, water and file, and undo brings back the carve Try another replaced", () => {
    const d = JSON.parse(readFileSync(DIGESTS, "utf8")) as Digests;
    const doc = decodeProject(new Uint8Array(readFileSync(PROJECT)));
    const s = MapSession.open(doc);
    expect(sha(s.built.heights)).toBe(d.heights);
    expect(entitiesOf(s)).toBe(d.entities);
    s.settleCanonical();
    expect(sha(new Uint8Array(Float64Array.from(s.built.water).buffer))).toBe(d.water);
    expect(sha(s.exportTimber().bytes)).toBe(d.timber);
    expect(s.undo()).toBe(true);
    expect(sha(s.built.heights)).toBe(d.undone);
    expect(s.redo()).toBe(true);
    expect(sha(s.built.heights)).toBe(d.heights);
  });
});
