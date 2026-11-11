// The edit queue (core/doc/editQueue.ts; the stroke pipeline's design, migration step 1) against the real worker
// session through a seeded channel (editQueue.harness.ts): a property test over random interleavings with a sequential
// oracle, and one pinned scenario per issue of the family (#410, #873, #880, #884, #868, #829) and per failure nobody
// had filed (U1–U10, #922).
//
// The page does not use the queue yet. The harness plays the page as steps 2 and 3 make it play (strokes, moves and
// edits as tickets; Naturalize through `StrokeFeed`; a map switch awaiting `idle()`), so each scenario passes here now
// and is the acceptance test the page's step must meet: its title says which step ("step 2", "step 3", "step 4").
// Where today's page still behaves otherwise, its own tests (tests/unit/remoteStroke.test.ts) keep asserting today's
// behaviour until that step changes it (D148): planning's three rulings on #922's behaviours are asserted here, on the
// queue, already.

import { beforeAll, describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { EditQueue, MAP_SILENT, STALE, type MapAnswer, type QueueOpen, type StepRef } from "../../src/core/doc/editQueue";
import type { EditOp } from "../../src/core/doc/ops";
import { STEP_GONE } from "../../src/core/doc/session";
import { WEATHER_SILENT, WeatherHost } from "../../src/core/features/raster/remoteStroke";
import * as ed from "../../src/worker/session";
import type { Command } from "../../src/core/collab";
import { mapProject, Stream } from "./collabFixtures";
import { checkConverged, checkOracle, checkOrder, Clock, flush, Harness, seeded } from "./editQueue.harness";

const W = 48;
let P1: Uint8Array;
let P2: Uint8Array;

beforeAll(() => {
  P1 = mapProject(11, "riverValley", W);
  P2 = mapProject(12, "riverValley", W);
});

/** A wandering line of tiles from (x, y). */
function line(x: number, y: number, n: number, dx = 1, dy = 0): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < n; k++) out.push([Math.max(1, Math.min(W - 2, x + k * dx)), Math.max(1, Math.min(W - 2, y + k * dy))]);
  return out;
}

/** A hard stroke drawn and let go; nothing delivered. */
async function stroke(h: Harness, tool: "raise" | "lower" | "naturalize", x: number, y: number, opts: { refused?: boolean; n?: number } = {}): Promise<number> {
  const id = h.press(tool, 3, { refused: opts.refused });
  await h.drag(line(x, y, opts.n ?? 6));
  await h.letGo();
  return id;
}

/** The step the worker's history stands at. */
const head = (): number | null => ed.sessionInfo().history.filter((r) => r.applied).at(-1)?.seq ?? null;
const lastOp = (): EditOp | undefined => {
  const e = ed.collabSession()!.document.edits.at(-1);
  return e ? ({ op: e.op, params: e.params } as EditOp) : undefined;
};

describe("the edit queue against the worker: pinned scenarios", () => {
  it("#410 (step 2): a stroke begun before the one before it is answered: no wrong guess, and the page shows the worker's land", async () => {
    const h = new Harness(P1);
    await stroke(h, "raise", 10, 10);
    const second = h.press("raise", 3);
    await h.drag(line(12, 11, 3));
    // (the first stroke's answer arrives while the second is being drawn over the same ground)
    h.deliverMap();
    await h.answerMap();
    await h.drag(line(15, 11, 4));
    await h.letGo();
    await h.settle();
    expect(h.queue.ticket(second)!.state).toBe("done");
    expect(h.queue.mispredictions).toBe(0);
    checkConverged(h, "#410");
    checkOracle(h, h.queue.epoch, "#410");
  });

  it("#873 (step 3): a Naturalize stroke's operation is built once, from its worker's whole record", async () => {
    const h = new Harness(P1);
    const id = h.press("naturalize", 5, { seed: 3 });
    await h.drag(line(20, 30, 12));
    await h.letGo();
    await h.settle();
    const t = h.queue.ticket(id)!;
    expect(t.state).toBe("done");
    const sent = ((t.call as { args: unknown[] }).args[0] as Extract<EditOp, { op: "brush" }>).params;
    const logged = (lastOp() as Extract<EditOp, { op: "brush" }>).params;
    // (the record the worker's preview grew is the one the session replays)
    for (const k of ["weathering", "shore", "pools", "moist", "dabs", "seed"] as const) expect(logged[k], k).toEqual(sent[k]);
    // (whether it lands as it was shown is step 4's: below)
    checkConverged(h, "#873");
    checkOracle(h, h.queue.epoch, "#873");
  });

  it("#873 (step 4's acceptance, today's gap): the session still completes a Naturalize stroke with what only it works out", async () => {
    // (step 4's composer completes the operation on the page, `completeStroke`, so the session adds nothing and the
    // operation logged deep-equals the operation sent; step 4 changes this list to [] and the oracle's I6 then covers
    // every stroke)
    const h = new Harness(P1);
    const id = h.press("naturalize", 5, { seed: 3 });
    await h.drag(line(20, 30, 12));
    await h.letGo();
    await h.settle();
    const sent = ((h.queue.ticket(id)!.call as { args: unknown[] }).args[0] as Extract<EditOp, { op: "brush" }>).params;
    const logged = (lastOp() as Extract<EditOp, { op: "brush" }>).params;
    const added = Object.keys(logged).filter((k) => !(k in sent)).sort();
    expect(added).toEqual(["hold", "keep"]);
    // (and so it does not land quite as it was shown: the hold's tiles come back protected, which the page's guess did
    // not know; step 4 changes this to 0)
    expect(h.queue.mispredictions).toBe(1);
    expect(h.queue.ticket(id)!.mispredicted).toBe(true);
  });

  it("#880 (1) (step 3): Ctrl+Z while a Naturalize stroke lands takes back that stroke, the step before stands, and redo brings it back", async () => {
    const h = new Harness(P1);
    await stroke(h, "raise", 30, 30);
    await h.settle();
    const before = head();
    const id = await stroke(h, "naturalize", 20, 30, { n: 10 });
    expect(h.queue.ticket(id)!.state).toBe("closing");
    h.undo();
    await h.settle();
    const rows = ed.sessionInfo().history;
    expect(rows.at(-1)!.applied).toBe(false);
    expect(rows.at(-1)!.seq).toBe(h.queue.ticket(id)!.step);
    expect(head()).toBe(before);
    h.redo();
    await h.settle();
    expect(head()).toBe(h.queue.ticket(id)!.step);
    checkConverged(h, "#880 (1)");
    checkOracle(h, h.queue.epoch, "#880 (1)");
  });

  it("#880 (2), U5 (step 3; planning's ruling 3): a map opened while a Naturalize stroke lands waits for it; nothing of the first map reaches the second", async () => {
    const h = new Harness(P1);
    const first = h.queue.epoch;
    await stroke(h, "naturalize", 20, 30, { n: 10 });
    const leaving = await h.switchMap(P2);
    const edits = decodeProject(leaving).edits;
    const last = edits.at(-1) as Extract<EditOp, { op: "brush" }>;
    expect(last.op).toBe("brush");
    expect(last.params.tool).toBe("naturalize");
    expect(h.queue.epoch).not.toBe(first);
    expect(ed.collabSession()!.document.edits).toEqual(decodeProject(P2).edits);
    expect(h.queue.staleDrops).toBe(0);
    // (the backstop: a call still meant for the first map changes nothing on the second)
    const r = ed.ticketed({ epoch: first, ticket: 99 }, () => ed.apply({ op: "deleteEntities", params: { entities: [] } }));
    expect(r).toEqual({ ok: false, errors: [STALE], stale: true, epoch: first, ticket: 99 });
    expect(ed.collabSession()!.document.edits).toEqual(decodeProject(P2).edits);
  });

  it("#884 (1), U8 (step 3): a silent Naturalize worker: the stroke is refused with its line within its bound, the next edit runs, idle() resolves", async () => {
    const h = new Harness(P1);
    const id = h.press("naturalize", 4);
    await h.drag(line(8, 20, 3));
    // (begin, then the first dabs: lost)
    h.deliverNat();
    await h.answerNat();
    h.loseNextNat = true;
    await h.drag(line(11, 20, 3));
    h.deliverNat();
    await h.letGo();
    const after = await stroke(h, "raise", 30, 30);
    await h.settle();
    const t = h.queue.ticket(id)!;
    expect(t.state).toBe("refused");
    expect(t.timedOut).toBe(true);
    expect(t.line).toBe(WEATHER_SILENT);
    expect(h.lines, h.lines.join(" | ")).toEqual([WEATHER_SILENT]);
    expect(h.queue.ticket(after)!.state).toBe("done");
    await h.queue.idle();
    checkConverged(h, "#884 (1) Naturalize");
    checkOracle(h, h.queue.epoch, "#884 (1) Naturalize");
  });

  it("#884 (1), U8 (step 2): a silent map worker: the head ticket is refused with its line within its bound, the next runs, idle() resolves", async () => {
    const h = new Harness(P1, { mapBound: 5000 });
    const lost = await stroke(h, "raise", 10, 10);
    h.loseNextMap = true;
    h.deliverMap();
    const next = await stroke(h, "lower", 30, 30);
    const t0 = h.clock.t;
    await h.settle();
    expect(h.queue.ticket(lost)!.state).toBe("refused");
    expect(h.queue.ticket(lost)!.line).toBe(MAP_SILENT);
    expect(h.clock.t - t0).toBeLessThanOrEqual(5000);
    expect(h.queue.ticket(next)!.state).toBe("done");
    await h.queue.idle();
    checkConverged(h, "#884 (1) map");
    checkOracle(h, h.queue.epoch, "#884 (1) map");
  });

  it("#884 (2) (step 3): a History row clicked while a stroke lands goes to that row's step, or is refused with STEP_GONE", async () => {
    const h = new Harness(P1);
    await stroke(h, "raise", 10, 10);
    await stroke(h, "raise", 30, 30);
    await h.settle();
    const [a, b] = ed.sessionInfo().history.map((r) => r.seq!);
    h.undo();
    await h.settle();
    // (b is the redo row; a stroke lands while the player clicks it, and replaces it)
    const landing = await stroke(h, "naturalize", 20, 30, { n: 10 });
    const gone = h.jump({ seq: b })!;
    await h.settle();
    expect(h.queue.ticket(gone)!.state).toBe("refused");
    expect(h.queue.ticket(gone)!.line).toBe(STEP_GONE);
    expect(head()).toBe(h.queue.ticket(landing)!.step);
    // (a row still there: the history stands at it)
    const landing2 = await stroke(h, "naturalize", 10, 35, { n: 10 });
    const there = h.jump({ seq: a })!;
    await h.settle();
    expect(h.queue.ticket(there)!.state).toBe("done");
    expect(head()).toBe(a);
    expect(ed.sessionInfo().history.find((r) => r.seq === h.queue.ticket(landing2)!.step)!.applied).toBe(false);
    checkConverged(h, "#884 (2)");
    checkOracle(h, h.queue.epoch, "#884 (2)");
  });

  it("#868 (step 3): 500 dabs against a worker ten times slower than the pointer: one call out at a time, the land never more than a batch behind", async () => {
    const h = new Harness(P1);
    h.press("naturalize", 3);
    const feed = () => h.feeds[0];
    let worst = 0;
    for (let frame = 0; frame < 250; frame++) {
      const x = 4 + (frame % 40);
      const y = 10 + Math.floor(frame / 40) * 4;
      await h.drag([[x, y], [x, y + 1]]);
      // (the worker takes and answers one call every ten frames)
      if (frame % 10 === 9) {
        h.deliverNat();
        await h.answerNat();
      }
      if (feed()) worst = Math.max(worst, feed()!.lag());
    }
    await h.letGo();
    await h.settle();
    expect(feed()!.maxOut).toBe(1);
    // (what waits is at most what the pointer made while one call was out: ten frames of two dabs)
    expect(worst).toBeLessThanOrEqual(20);
    checkConverged(h, "#868");
  });

  it("#829 (step 2): an edit's answer and a check's news are one channel: an event naming another map is dropped at the door", async () => {
    const h = new Harness(P1);
    const before = h.queue.base.heights;
    h.queue.event({ ok: true, errors: [], epoch: h.queue.epoch + 1, view: { heights: new Uint8Array(before.length) } });
    expect(h.queue.base.heights).toBe(before);
    expect(h.queue.staleDrops).toBe(1);
  });

  it("U1 (step 2; planning's ruling 1): an undo waiting behind a stroke the worker refuses does nothing: the step before the stroke stands", async () => {
    const h = new Harness(P1);
    await stroke(h, "raise", 30, 30);
    await h.settle();
    const before = head();
    const refused = await stroke(h, "raise", 10, 10, { refused: true });
    const undo = h.undo()!;
    await h.settle();
    expect(h.queue.ticket(refused)!.state).toBe("refused");
    expect(h.queue.ticket(undo)!.state).toBe("dropped");
    expect(head()).toBe(before);
    expect(h.lines.length).toBe(1);
    checkConverged(h, "U1");
    checkOracle(h, h.queue.epoch, "U1");
  });

  it("U1 (step 3; planning's ruling 1): an undo waiting behind a Naturalize stroke that times out does nothing", async () => {
    const h = new Harness(P1);
    await stroke(h, "raise", 30, 30);
    await h.settle();
    const before = head();
    const id = h.press("naturalize", 4);
    await h.drag(line(8, 20, 4));
    h.deliverNat();
    await h.answerNat();
    h.loseNextNat = true;
    h.deliverNat();
    await h.letGo();
    const undo = h.undo()!;
    await h.settle();
    expect(h.queue.ticket(id)!.line).toBe(WEATHER_SILENT);
    expect(h.queue.ticket(undo)!.state).toBe("dropped");
    expect(head()).toBe(before);
    checkConverged(h, "U1 Naturalize");
  });

  it("U2 (step 2): an object placed and Ctrl+Z before its answer: the object goes, and the stroke under it never leaves the screen", async () => {
    const h = new Harness(P1);
    const s = await stroke(h, "raise", 20, 20);
    await h.settle();
    const seq = h.queue.ticket(s)!.step!;
    const r = { x0: 19, y0: 19, x1: 26, y1: 21 };
    const land = () => Array.from({ length: 3 }, (_, k) => Buffer.from(h.queue.shown.subarray((r.y0 + k) * W + r.x0, (r.y0 + k) * W + r.x1 + 1)).toString("hex")).join();
    const shownStroke = land();
    const stream = new Stream(5, W);
    const c = stream.command("place", ed.collabSession()!) as Extract<Command, { kind: "edit" }>;
    const placed = h.edit("applyAll", [c.ops, c.label], c.label);
    h.undo();
    for (let k = 0; k < 6; k++) {
      expect(land(), `the stroke's land, step ${k}`).toBe(shownStroke);
      h.deliverMap();
      await h.answerMap();
    }
    await h.settle();
    expect(head()).toBe(seq);
    expect(h.queue.ticket(placed)!.state).toBe("done");
    expect(land()).toBe(shownStroke);
    checkConverged(h, "U2");
    checkOracle(h, h.queue.epoch, "U2");
  });

  it("U3, U4 (step 2): a stroke, its undo and a new stroke at once: no wrong guess", async () => {
    const h = new Harness(P1);
    await stroke(h, "raise", 10, 10);
    h.undo();
    await stroke(h, "lower", 11, 10);
    await h.settle();
    expect(h.queue.mispredictions).toBe(0);
    checkConverged(h, "U3");
    checkOracle(h, h.queue.epoch, "U3");
  });

  it("U6 (step 3; planning's ruling 2): a press while a Naturalize stroke lands paints: its stroke goes on the history after the landing one", async () => {
    const h = new Harness(P1);
    const landing = await stroke(h, "naturalize", 20, 30, { n: 10 });
    const pressed = await stroke(h, "raise", 30, 20);
    expect(h.queue.composable(pressed)).toBe(false);
    await h.settle();
    const steps = ed.sessionInfo().history.map((r) => r.seq);
    expect(steps.slice(-2)).toEqual([h.queue.ticket(landing)!.step, h.queue.ticket(pressed)!.step]);
    checkConverged(h, "U6");
    checkOracle(h, h.queue.epoch, "U6");
  });

  it("U7 (step 3): three strokes, the first answer held: no draft of a ticket reaches the worker before the ticket ahead of it", async () => {
    const h = new Harness(P1);
    await stroke(h, "raise", 10, 10);
    h.deliverMap();
    await stroke(h, "raise", 20, 20);
    await stroke(h, "raise", 30, 30);
    await h.settle();
    expect(h.received.filter((r) => r.kind === "draft").length).toBeGreaterThan(0);
    expect(checkOrder(h.received)).toEqual([]);
    checkConverged(h, "U7");
  });

  it("U9 (step 3): an edit made while a Naturalize stroke lands goes on the history after it", async () => {
    const h = new Harness(P1);
    const landing = await stroke(h, "naturalize", 20, 30, { n: 10 });
    const stream = new Stream(6, W);
    const c = stream.command("place", ed.collabSession()!) as Extract<Command, { kind: "edit" }>;
    const placed = h.edit("applyAll", [c.ops, c.label], c.label);
    await h.settle();
    const steps = ed.sessionInfo().history.map((r) => r.seq);
    expect(steps.slice(-2)).toEqual([h.queue.ticket(landing)!.step, h.queue.ticket(placed)!.step]);
    checkOracle(h, h.queue.epoch, "U9");
  });

  it("U10 (step 2): a paint-only session keeps a bounded number of strokes' land for undo", async () => {
    const h = new Harness(P1);
    for (let k = 0; k < 12; k++) await stroke(h, "raise", 4 + 3 * k, 10 + (k % 3) * 8);
    await h.settle();
    expect((h.queue as unknown as { kept: unknown[] }).kept.length).toBeLessThanOrEqual(8);
    // (the latest strokes' undo still shows at once)
    const before = Buffer.from(h.queue.shown);
    h.undo();
    expect(Buffer.from(h.queue.shown).equals(before)).toBe(false);
    await h.settle();
    checkConverged(h, "U10");
  });

  it("a shared session's land (resync): base is it, the overlays still on their way are laid on it again", async () => {
    const h = new Harness(P1);
    const pending = await stroke(h, "raise", 10, 10);
    const land = ed.terrainNow();
    land.heights[40 * W + 40] += 2;
    h.queue.resync(land);
    expect(h.queue.shown[40 * W + 40]).toBe(land.heights[40 * W + 40]);
    // (the stroke still on its way stays shown)
    const t = h.queue.ticket(pending)!;
    expect(t.state === "ready" || t.state === "sent").toBe(true);
    expect(Buffer.from(h.queue.shown.subarray(10 * W, 11 * W)).equals(Buffer.from(land.heights.subarray(10 * W, 11 * W)))).toBe(false);
  });
});

describe("the edit queue against the worker: random interleavings (I1–I10)", () => {
  // (seeded: a failure reports its seed and the actions that led to it, D341)
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}: ~250 actions, every invariant after each, the oracle at every map's end`, async () => {
      const next = seeded(seed);
      const h = new Harness(P1);
      const stream = new Stream(seed, W);
      const did: string[] = [];
      const letGo = new Set<number>();
      const fail = (e: unknown): never => {
        throw new Error(`seed ${seed}, after: ${did.slice(-40).join(" ")}\n${e instanceof Error ? e.message : String(e)}`);
      };
      const end = async (where: string) => {
        await h.settle(next);
        checkConverged(h, where);
        checkOracle(h, h.queue.epoch, where);
      };
      let pos: [number, number] = [20, 20];
      try {
        for (let step = 0; step < 250; step++) {
          const r = next();
          if (h.held) {
            if (r < 0.55) {
              const pts: [number, number][] = [];
              for (let k = 0; k < 1 + Math.floor(next() * 4); k++) {
                pos = [Math.max(2, Math.min(W - 3, pos[0] + Math.round(next() * 4 - 2))), Math.max(2, Math.min(W - 3, pos[1] + Math.round(next() * 4 - 2)))];
                pts.push(pos);
              }
              did.push(`drag${pts.length}`);
              await h.drag(pts);
            } else if (r < 0.85) {
              did.push("letGo");
              letGo.add(h.held.id);
              await h.letGo();
            } else if (r < 0.9) {
              did.push("esc");
              h.esc();
            } else {
              did.push("undo(esc)");
              h.undo();
            }
          } else if (r < 0.22) {
            const tool = (["raise", "lower", "raise", "lower", "naturalize"] as const)[Math.floor(next() * 5)];
            const refused = tool !== "naturalize" && next() < 0.12;
            pos = [4 + Math.floor(next() * (W - 8)), 4 + Math.floor(next() * (W - 8))];
            did.push(`press:${tool}${refused ? "!" : ""}`);
            h.press(tool, 2 + Math.floor(next() * 4), { refused, seed: Math.floor(next() * 1000) });
            await h.drag([pos]);
          } else if (r < 0.32) {
            did.push(`undo#${h.undo()}`);
          } else if (r < 0.39) {
            did.push(`redo#${h.redo()}`);
          } else if (r < 0.43) {
            const { rows } = h.queue.history();
            const k = Math.floor(next() * (rows.length + 1)) - 1;
            const to: StepRef | null = k < 0 ? null : rows[k].ref;
            did.push(`jump#${h.jump(to)}`);
          } else if (r < 0.53) {
            const c = stream.command(stream.pick(["place", "place", "move", "props", "remove"] as const), ed.collabSession()!);
            if (c && c.kind === "edit") {
              did.push(`edit#${h.edit("applyAll", [c.ops, c.label], c.label)}`);
            }
          } else if (r < 0.545) {
            did.push("loseMap");
            h.loseNextMap = true;
          } else if (r < 0.56) {
            did.push("loseNat");
            h.loseNextNat = true;
          } else if (r < 0.565) {
            did.push("remount");
            h.remount();
          } else if (r < 0.57) {
            did.push("switch");
            await end(`seed ${seed}, before a switch`);
            await h.switchMap(h.queue.epoch % 2 ? P2 : P1, next);
          } else if (r < 0.6) {
            did.push("tick");
            h.clock.advance(Math.floor(next() * 3000));
            await flush();
          }
          for (let k = Math.floor(next() * 4); k > 0; k--) await h.deliverOne(next);
          // (I1 at every answer, I3 at every step; I6 and the rest at every map's end)
          expect(h.i1, "I1").toEqual([]);
          expect(checkOrder(h.received), "I3").toEqual([]);
        }
        did.push("end");
        h.esc();
        await end(`seed ${seed}, at the end`);
        // (I4: the epoch's door never had to turn anything away in normal use)
        expect(h.queue.staleDrops, "I4").toBe(0);
        // (I8: every stroke let go is on the history or refused with a line)
        for (const id of letGo) {
          const t = h.queue.ticket(id)!;
          const ok = t.state === "done" || (t.state === "refused" && !!t.line) || t.state === "cancelled";
          expect(ok, `I8: stroke ${id} ${t.state}`).toBe(true);
          if (t.state === "cancelled") expect(t.line, `I8: a stroke let go is cancelled only for changing nothing`).toBeNull();
        }
      } catch (e) {
        fail(e);
      }
    });
  }
});

describe("the worker's side of the protocol", () => {
  it("SessionOpen names its epoch, bumped by every map; answers carry rev and step; moveTo names its step", async () => {
    const a = ed.openProject(P1);
    const b = ed.openProject(P1);
    expect(b.epoch).toBeGreaterThan(a.epoch);
    const u = ed.apply({ op: "deleteEntities", params: { entities: [] } } as EditOp);
    expect(u.rev).toBe(u.info.version);
    expect(u.step).toBe(u.ok ? u.info.history.filter((r) => r.applied).at(-1)?.seq ?? null : null);
    const h = new Harness(P1);
    await stroke(h, "raise", 10, 10);
    await stroke(h, "raise", 20, 20);
    await h.settle();
    const [first] = ed.sessionInfo().history.map((r) => r.seq!);
    const m = ed.moveTo(first);
    expect(m.ok).toBe(true);
    expect(m.step).toBe(first);
    // (already there: no refusal, nothing moved)
    const again = ed.moveTo(first);
    expect(again.ok).toBe(true);
    expect(again.rev).toBe(m.rev);
    expect(ed.moveTo(null).step).toBeNull();
  });

  it("the Naturalize worker: a call naming another stroke changes nothing", () => {
    const host = new WeatherHost();
    const s = ed.openProject(P1);
    host.begin({ tool: "naturalize", size: 4, strength: 6, seed: 1, weathers: true }, [], s.terrain, s.view.heights.slice(), W, W, 7);
    expect(host.add([40, 80, 44, 80], undefined, 6)).toBeNull();
    host.cancel(6);
    expect(host.end(6)).toBeNull();
    // (stroke 7 is still held: its end comes, once)
    expect(host.end(7)).not.toBeNull();
    expect(host.end(7)).toBeNull();
  });

  it("the queue's clock is the test's: the watchdog fires only when told", () => {
    const c = new Clock();
    let fired = 0;
    c.after(100, () => fired++);
    c.advance(99);
    expect(fired).toBe(0);
    c.advance(1);
    expect(fired).toBe(1);
  });

  it("a queue with no port answer never waits forever: idle() resolves once the watchdog refuses", async () => {
    const open = ed.openProject(P1);
    const c = new Clock();
    const q = new EditQueue(open as QueueOpen, { send: () => new Promise<MapAnswer>(() => {}) }, c, {}, { mapBound: 1000 });
    q.edit("apply", [{ op: "deleteEntities", params: { entities: [] } }]);
    let idle = false;
    void q.idle().then(() => (idle = true));
    c.advance(1000);
    await flush();
    expect(idle).toBe(true);
  });
});
