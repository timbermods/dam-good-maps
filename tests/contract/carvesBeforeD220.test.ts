// Carves saved before D220 open exactly (D158, D462 answer 2). Before the forces shared one operation,
// `forceResult`, a carve was kept as its own `carve` operation. A project holding one is converted to
// `forceResult` when it opens (doc/document.ts `upgradeCarves`, with forces/op.ts `forceOfCarve`, the
// conversion the build always applied), so Kyler's saved projects open with their land, objects and
// water as they were. The project (tests/fixtures/carves-before-d220.*) holds an aimed carve that
// sealed an oxbow lake, a river kept with its row of sources, its Width, Depth and walls set and the
// layer showing, a dry canyon stopped early, and a Try another path that replaced it (its undo data
// holding the canyon's `carve`). Project and digests were written by the code before the `carve`
// operation was retired (this file's DGM_RECORD branch at f8b61db6), so the digests are of the map that
// code built; the file's digest was taken again when #310 F3 wrote the water's tokens to nine places
// (generator 0.8.1, D455: a project from an older version may reopen a few bytes different).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { componentsOf } from "../../src/core/format/entities";
import { GENERATOR_VERSION } from "../../src/core/spec/mapspec";

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

  // (opened live by today's generator: the carves' conversion alone; a live map's file carries today's
  // generator version, so its file is compared only frozen, below)
  it("opened live by today's generator, the project gives the same map, its objects and water, and undo brings back the carve Try another replaced", () => opensAsSaved(false));

  // A newer generator opens it frozen ("It opens exactly as it was saved", D336, D455): the stored
  // generation's slopes, trees and bushes stand as stored, and only where the carves changed a tile
  // are they judged again (a slope whose step went is gone, a bush the water reached dies), so it is
  // the same map, objects and file. Generator 0.8.1 (#265) found it growing back two slopes the
  // carves had taken away.
  it("opened by a newer generator (frozen), it is the same map, its objects, water and file", () => opensAsSaved(true));

  // Frozen, the stored generation is the older generator's, whatever today's rules would make: a
  // tree's species and a slope today's rule would not lay, on tiles the carves left alone, come back
  // as stored; a bush on a tile the carves changed is judged again, as a live map judges it.
  it("frozen, what the carves left alone stands as stored, and what they changed is judged again", () => {
    const doc = decodeProject(new Uint8Array(readFileSync(PROJECT)));
    const opened = MapSession.open(decodeProject(new Uint8Array(readFileSync(PROJECT))));
    const live = opened.built;
    const generated = opened.openedHeights;
    const W = live.W;
    type Raw = { Id: string; Template: string; Components: { BlockObject: { Coordinates: { X: number; Y: number }; Orientation?: string }; LivingNaturalResource?: { IsDead?: boolean } } };
    const world = JSON.parse(doc.base.world!) as { Entities: Raw[] };
    // (the tiles the carves changed, and their water: what is far from them they left alone)
    const changed: number[] = [];
    const wet = (i: number) => live.water[i] > 0;
    for (let i = 0; i < live.heights.length; i++) if (live.heights[i] !== generated[i] || wet(i)) changed.push(i);
    const far = (e: Raw) => changed.every((i) => Math.abs((i % W) - e.Components.BlockObject.Coordinates.X) + Math.abs(Math.floor(i / W) - e.Components.BlockObject.Coordinates.Y) > 6);
    const birch = world.Entities.find((e) => e.Template === "Birch" && far(e))!;
    birch.Template = "Pine";
    const slope = world.Entities.find((e) => e.Template === "Slope" && far(e))!;
    const turned = slope.Components.BlockObject.Orientation === "Cw180" ? "Cw0" : "Cw180";
    slope.Components.BlockObject.Orientation = turned;
    doc.base.world = JSON.stringify(world);
    doc.stored = undefined;
    doc.generatorVersion = `${doc.generatorVersion}-older`;
    const s = MapSession.open(doc);
    expect(s.mode).toBe("frozen");
    const at = (id: string) => s.built.entities.find((e) => e.id === id);
    expect(at(birch.Id)?.template, "a tree the carves left alone keeps its stored species").toBe("Pine");
    expect(at(slope.Id)?.orientation, "a slope the carves left alone stands as stored").toBe(turned);
    // the bushes the carves' water or soil killed die frozen as they do live
    const dead = (e: { raw?: unknown; components: unknown; before?: unknown } | undefined) => !!(e && (componentsOf(e as never).LivingNaturalResource as { IsDead?: boolean } | undefined)?.IsDead);
    const killed = live.entities.filter((e) => e.template === "BlueberryBush" && dead(e) && !(world.Entities.find((r) => r.Id === e.id)?.Components.LivingNaturalResource?.IsDead));
    expect(killed.length, "the carves killed bushes").toBeGreaterThan(0);
    for (const e of killed) expect(dead(at(e.id)), `${e.id} judged again`).toBe(true);
  });

  function opensAsSaved(newer: boolean): void {
    const d = JSON.parse(readFileSync(DIGESTS, "utf8")) as Digests;
    const doc = decodeProject(new Uint8Array(readFileSync(PROJECT)));
    // (saved by any generator but this one, a project opens frozen: no newer generator needed; the
    // project was saved by 0.8.0, so it opens live only when it says today's generator saved it)
    doc.generatorVersion = newer ? `${GENERATOR_VERSION}-older` : GENERATOR_VERSION;
    const s = MapSession.open(doc);
    expect(s.mode).toBe(newer ? "frozen" : "live");
    expect(sha(s.built.heights)).toBe(d.heights);
    expect(entitiesOf(s)).toBe(d.entities);
    s.settleCanonical();
    expect(sha(new Uint8Array(Float64Array.from(s.built.water).buffer))).toBe(d.water);
    if (newer) expect(sha(s.exportTimber().bytes)).toBe(d.timber);
    expect(s.undo()).toBe(true);
    expect(sha(s.built.heights)).toBe(d.undone);
    expect(s.redo()).toBe(true);
    expect(sha(s.built.heights)).toBe(d.heights);
  }
});
