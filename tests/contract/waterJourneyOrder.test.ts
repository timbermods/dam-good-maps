// The water bar ends its journey however the worker's news arrives (PLAN §20 D345, B14 again; D341, D342).
// A CI run once left the bar at "Water flowing… 84%" after a redo: the worker's own settle was stopped by the
// background check putting the canonical water in place, and neither the check's answer nor anything else ended
// the page's journey. Nothing here waits on a clock: the worker's real messages after a redo (its answer, its
// frames and settled event, the check's answer) are recorded once, then delivered to the page's journey
// (`WaterJourney` over a `WaterPlayer`) in every interleaving, with each of the terminal messages dropped in
// turn, and the bar must read "Water settled" after every one of them.

import { beforeAll, describe, expect, it } from "vitest";
import { makeSpec } from "../../src/core/spec/mapspec";
import { WaterJourney, type WaterNews } from "../../src/editor/waterJourney";
import { WaterPlayer } from "../../src/editor/waterPlayer";
import type { WaterView } from "../../src/render3d/model";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const empty: WaterView = { count: 0, tile: new Int32Array(0), floor: new Float32Array(0), depth: new Float32Array(0), contamination: new Float32Array(0) };

/** The page's timers, stepped by hand: nothing waits on the wall clock. */
const timers: (() => void)[] = [];
(globalThis as unknown as { window: unknown }).window = {
  setTimeout: (fn: () => void) => timers.push(fn),
  clearTimeout: () => undefined,
};
function drain() {
  for (let k = 0; timers.length && k < 100_000; k++) timers.shift()!();
}

type Answer = { ok: boolean; waterSettled?: boolean; info: { version: number }; view: import("../../src/worker/session").ViewUpdate };
type Check = { view: import("../../src/worker/session").ViewUpdate; waterSettled?: boolean };
interface Run {
  redo: Answer;
  news: WaterNews[];
  check: Check;
}

const edit = () => ed.apply({ op: "sculpt", params: { mode: "lower", cells: [[40, 30, 46], [41, 30, 46], [42, 30, 46]], amount: 1 } });

/** The worker's messages after a redo, recorded: `checkFirst` runs the background check straight away (it puts
 *  the canonical water in place and stops the worker's own settle), else the settle finishes first. */
async function record(checkFirst: boolean): Promise<{ undo: Answer; run: Run }> {
  await runGenerate(makeSpec({ seed: 4, theme: "riverValley", size: { x: W, y: W } }));
  ed.refine();
  // (the worker's own settle runs only in the job-first case: with it off, the check is what settles the water,
  // deterministically, and the worker's settle is left stopped, as when the check gets there first)
  ed.setAutoWater(true);
  const news: WaterNews[] = [];
  ed.listen((e) => {
    if (e.kind === "water" && !e.draft) news.push({ kind: "water", version: e.version, water: e.water, done: e.done });
    else if (e.kind === "settled") news.push({ kind: "settled", version: e.version, view: e.view });
  });
  edit();
  await ed.whenWaterSettles();
  const undo = ed.undo();
  await ed.whenWaterSettles();
  news.length = 0;
  ed.setAutoWater(!checkFirst);
  const redo = ed.redo();
  expect(redo.waterSettled, "a redo of the edit leaves water to settle").toBe(false);
  let check: Check;
  if (checkFirst) {
    check = (await ed.backgroundCheck())!;
    expect(ed.waterSettling(), "the check stopped the worker's settle").toBe(false);
  } else {
    await ed.whenWaterSettles();
    check = (await ed.backgroundCheck())!;
  }
  ed.listen(null);
  ed.setAutoWater(false);
  return { undo, run: { redo, news, check } };
}

/** Every way to interleave `a` with `b`, each keeping its own order. */
function interleavings<T>(a: T[], b: T[]): T[][] {
  if (!a.length) return [b];
  if (!b.length) return [a];
  return [...interleavings(a.slice(1), b).map((r) => [a[0], ...r]), ...interleavings(a, b.slice(1)).map((r) => [b[0], ...r])];
}

type Item = { what: "update" } | { what: "news"; e: WaterNews } | { what: "check" };

/** The bar after the worker's messages are delivered in `order` (the page had settled water before). */
function bar(undo: Answer, run: Run, order: Item[]): { progress: number | null; playing: boolean } {
  const player = new WaterPlayer({ show: () => undefined, changed: () => undefined });
  const journey = new WaterJourney(player, { applyView: () => undefined, mapWater: () => empty, settledInPlace: () => undefined });
  journey.update(undo, undo.info.version);
  for (const it of order) {
    if (it.what === "update") journey.update(run.redo, run.redo.info.version);
    else if (it.what === "news") journey.news(it.e);
    else journey.check(run.check);
    drain();
  }
  return { progress: player.progress, playing: player.playing };
}

describe.each([
  ["the background check runs first and stops the worker's settle", true],
  ["the worker's settle finishes first", false],
])("after a redo, %s (D345 B14)", (_name, checkFirst) => {
  let rec: { undo: Answer; run: Run };
  beforeAll(async () => {
    rec = await record(checkFirst);
  }, 240_000);

  it("the worker sends its word on every channel", () => {
    const { run } = rec;
    expect(run.news.at(-1)!.kind, "the settled event ends the frames").toBe("settled");
    expect(run.check.waterSettled).toBe(true);
    expect(run.news.every((e) => e.version === run.redo.info.version)).toBe(true);
  });

  it("the bar reads settled whatever the order of the messages", () => {
    const { undo, run } = rec;
    // (a few of the frames, then the settled event, as the worker sent them)
    const some = [...run.news.filter((e) => e.kind === "water").slice(0, 3), run.news.find((e) => e.kind === "settled")!].map((e): Item => ({ what: "news", e }));
    const after = interleavings<Item>([{ what: "update" }, { what: "check" }], some);
    // (the news may also come before the page has the redo's answer: it waits for it)
    const early = interleavings<Item>(some, [{ what: "update" }, { what: "check" }]);
    let n = 0;
    for (const order of [...after, ...early]) {
      const b = bar(undo, run, order);
      expect(b, order.map((o) => (o.what === "news" ? o.e.kind : o.what)).join(" > ")).toEqual({ progress: null, playing: false });
      n++;
    }
    expect(n).toBeGreaterThan(3);
  });

  it("the bar reads settled with either terminal message lost", () => {
    const { undo, run } = rec;
    const settledEvent = run.news.findIndex((e) => e.kind === "settled");
    const frames = run.news.slice(0, 3).filter((e) => e.kind === "water");
    const items = (news: WaterNews[], check: boolean): Item[] => [{ what: "update" }, ...news.map((e): Item => ({ what: "news", e })), ...(check ? [{ what: "check" } as Item] : [])];
    // the settled event lost: the check's answer ends the journey (it carries the worker's word)
    expect(bar(undo, run, items(frames, true)), "settled event lost").toEqual({ progress: null, playing: false });
    // the check's answer lost: the settled event ends it
    expect(bar(undo, run, items([...frames, run.news[settledEvent]], false)), "check answer lost").toEqual({ progress: null, playing: false });
    // news for an older version is ignored, and never leaves a journey behind
    const old: WaterNews = { kind: "water", version: run.redo.info.version - 1, water: empty, done: 0.3 };
    expect(bar(undo, run, [{ what: "update" }, { what: "news", e: old }, ...run.news.map((e): Item => ({ what: "news", e }))]), "an old frame").toEqual({ progress: null, playing: false });
  });
});
