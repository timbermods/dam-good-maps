// A force taken back while it works gives the land, the objects and the water back exactly as they were (D341, D455),
// as the page receives them. The worker hands the page each event's buffers and each answer's (transferred, never
// copied): an answer that shares a buffer with an event sent before it cannot be sent at all, and the page keeps what
// it last drew. #1222 sent a take-back's water both as its "water" event and in its answer, so Ctrl+Z or undo while a
// carve cut, and Esc on a painted Lift, left the force's land on screen (tests/e2e/carve.spec.ts,
// tests/e2e/forceKeys.spec.ts). Here each event and each answer goes through the same transfer the worker makes.

import { createHash } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import type { ForceRequest } from "../../src/core/forces/start";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { viewBuffers } from "../../src/render3d/model";
import * as ed from "../../src/worker/session";
import { fixtureInEditor, namedInEditor } from "../fixtureEditor";

const W = 96;

afterEach(() => {
  ed.forceCancel();
  ed.listen(null);
  ed.closeSession();
});

/** As the worker sends it to the page: its buffers transferred (src/worker/generator.worker.ts `eventBuffers`). */
function sent<T extends object>(v: T, buffers: ArrayBuffer[]): T {
  return structuredClone(v, { transfer: buffers });
}

/** Every event to the page, sent as the worker sends it. */
function listenAsThePage(): void {
  ed.listen((e) => {
    if (e.kind === "water") sent(e, viewBuffers({ water: e.water }));
    else if ("view" in e && e.view) sent(e, viewBuffers(e.view as never));
  });
}

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** The map as the page and the project have it: its heights, its objects and its water, and the saved project. */
function asFound() {
  const v = ed.sessionView().view;
  return { heights: Array.from(v.heights!), entities: v.entities!.count, depth: Array.from(v.water!.depth), tile: Array.from(v.water!.tile), project: sha(ed.project().bytes) };
}

/** Dry high ground far from the start, where a carve cuts at once, and a fault across the far half for a Lift. */
function places(): { origin: [number, number]; fault: { path: { x: number; y: number }[]; side: 1 | -1 } } {
  const s = ed.collabSession()!;
  const b = s.built;
  const st = b.start!;
  let origin: [number, number] = [W >> 1, W >> 1];
  let far = -1;
  for (let y = 16; y < W - 16; y += 4)
    for (let x = 16; x < W - 16; x += 4) {
      const i = y * W + x;
      if (b.water[i] > 0) continue;
      const d = Math.hypot(x - st.x, y - st.y) + b.heights[i];
      if (d > far) {
        far = d;
        origin = [x, y];
      }
    }
  const fy = st.y < W / 2 ? Math.round(W * 0.72) : Math.round(W * 0.28);
  return { origin, fault: { path: [{ x: 4, y: fy }, { x: W * 0.5, y: fy + 1.5 }, { x: W - 5, y: fy }], side: st.y < fy ? 1 : -1 } };
}

/** Takes force `req` back by its gesture while it works, its land changed and its water flowing; the answer as the page
 *  receives it. */
function takenBackWhileItWorks(req: ForceRequest, gesture: number, paint?: { path: { x: number; y: number }[]; side: 1 | -1 }) {
  const ground = Array.from(ed.sessionView().view.heights!);
  expect(ed.forceStart({ ...req, gesture }).errors).toEqual([]);
  // (until its land shows a change, its water flowing; a Lift lifts as it is painted)
  const shows = (h: Uint8Array | undefined) => !!h && Array.from(h).some((v, i) => v !== ground[i]);
  let changed = paint ? shows(ed.forcePaint(paint.path, paint.side)?.heights) : false;
  for (let k = 0; k < 400 && !changed; k++) {
    const f = ed.forceAdvance(paint ? 1 : 4);
    changed = shows(f?.heights);
    if (f?.done) break;
  }
  expect(changed, "the force changed the land before it was taken back").toBe(true);
  expect(ed.flowForceWater(40), "its water flows").not.toBeNull();
  const back = ed.forceCancel(gesture);
  return sent(back, viewBuffers(back as never));
}

const MAPS: [string, () => void][] = [
  ["a map without caves (Highlands 96² seed 25)", () => fixtureInEditor("highlands", W, 25)],
  ["a map with caves (Highlands 96² seed 22, #1181's land)", () => namedInEditor("preview-highlands-96-22-carve.damgoodmaps")],
];

for (const [name, open] of MAPS)
  it(`a carve and a painted Lift taken back while they work give back the land, the objects and the water exactly, as the page receives them: ${name}`, () => {
    open();
    ed.settleWater();
    listenAsThePage();
    const { origin, fault } = places();
    const before = asFound();
    // Ctrl+Z, Esc on its Revert, or undo while a carve cuts: each takes it back by its gesture
    const carve = takenBackWhileItWorks({ verb: "carve", settings: { ...CARVE_DEFAULTS, power: 60 }, origin, cut: null }, 9001);
    expect(carve.taken).toBe("work");
    expect(Array.from(carve.heights!), "the carve's land taken back").toEqual(before.heights);
    expect(asFound()).toEqual(before);
    // Esc on a painted Lift while it is drawn
    const lift = takenBackWhileItWorks({ verb: "quake", settings: QUAKE_DEFAULTS, path: fault.path.slice(0, 2), side: fault.side, cut: null, painting: true } as ForceRequest, 9002, fault);
    expect(lift.taken).toBe("work");
    expect(Array.from(lift.heights!), "the Lift's land taken back").toEqual(before.heights);
    expect(asFound()).toEqual(before);
  }, 300_000);
