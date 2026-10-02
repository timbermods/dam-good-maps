// The start is the player's (PLAN §20 D323, feedback items 1 and 44; amends D288): it can be deleted
// like any object, a map without one is allowed while editing (the project saves, the checks say
// "No start"), Save to Timberborn and Download .timber refuse with "Place a start first", the shelf's
// Start places one again; "Clear everything" removes every object and source and the start, one
// undo step, leaving only the terrain.

import { describe, expect, it } from "vitest";
import { cornerFor } from "../../src/core/doc/tools";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const steps = () => ed.sessionView().info.history.filter((h) => h.applied).length;
const templates = () => {
  const e = ed.sessionView().view.entities;
  const out: string[] = [];
  for (let k = 0; k < e.count; k++) out.push(e.templates[e.template[k]]);
  return out;
};
const startTile = (): [number, number] => {
  const v = ed.sessionView();
  const e = v.view.entities;
  for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "StartingLocation") return [e.x[k], e.y[k]];
  throw new Error("no start");
};

async function fresh(seed = 4) {
  await runGenerate(makeSpec({ seed, theme: "riverValley", size: { x: W, y: W } }));
  ed.setEditorWaterMode("defer");
  ed.refine();
}

describe("the start can be deleted (D323 item 44)", () => {
  it("Delete takes the start like any object, one undo step; the map has no start, and its project still saves", async () => {
    await fresh();
    const [sx, sy] = startTile();
    const before = templates().filter((t) => t === "StartingLocation").length;
    expect(before).toBe(1);
    const n = steps();
    const r = ed.removeAt([sy * W + sx], ["start"]);
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(steps()).toBe(n + 1);
    expect(templates()).not.toContain("StartingLocation");
    expect(ed.sessionView().info.features.some((f) => f.kind === "start")).toBe(false);
    // the project saves; the checks say "No start"; the game's save and the download refuse
    expect(ed.project().bytes.length).toBeGreaterThan(100);
    const c = ed.exportCheck();
    expect(c.blocking.map((b) => b.message)).toContain("No start");
    const out = await ed.exportTimber(true);
    expect(out.ok).toBe(false);
    expect(out.errors[0]).toMatch(/^Place a start first/);
    ed.undo();
    expect(steps()).toBe(n);
    expect(templates()).toContain("StartingLocation");
  });

  it("the shelf's Start places one again where there is none, in one step", async () => {
    await fresh();
    const [sx, sy] = startTile();
    expect(ed.removeAt([sy * W + sx], ["start"]).ok).toBe(true);
    const n = steps();
    const r = ed.moveStartTo(sx, sy, "Cw0");
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(steps()).toBe(n + 1);
    expect(templates().filter((t) => t === "StartingLocation").length).toBe(1);
    expect(ed.exportCheck().blocking.map((b) => b.message)).not.toContain("No start");
    void cornerFor;
  });

  it("an opened map's start is deleted and placed the same way", async () => {
    await fresh();
    const saved = await ed.exportTimber(true);
    expect(saved.ok).toBe(true);
    ed.openTimber(saved.bytes, "Opened.timber");
    const [sx, sy] = startTile();
    const n = steps();
    expect(ed.removeAt([sy * W + sx], ["start"]).ok).toBe(true);
    expect(templates()).not.toContain("StartingLocation");
    const again = ed.moveStartTo(sx, sy, "Cw0");
    expect(again.ok, JSON.stringify(again.errors)).toBe(true);
    expect(templates().filter((t) => t === "StartingLocation").length).toBe(1);
    expect(steps()).toBe(n + 2);
  });
});

describe("Clear everything (D323 item 44)", () => {
  it("removes every source, tree, bush, ruin, object and the start, as one undo step, leaving the terrain", async () => {
    await fresh();
    const heights = Array.from(ed.sessionView().view.heights);
    expect(templates().length).toBeGreaterThan(20);
    const n = steps();
    const r = ed.clearEverything();
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(steps()).toBe(n + 1);
    expect(templates()).toEqual([]);
    expect(Array.from(ed.sessionView().view.heights)).toEqual(heights);
    ed.undo();
    expect(steps()).toBe(n);
    expect(templates().length).toBeGreaterThan(20);
  });
});
