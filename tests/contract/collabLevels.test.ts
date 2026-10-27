// A level through a shared session (D491, D342, D455): the pick's level under a roof ("z") reaches the planners a guest's edit
// goes through (session.ts `planned.paint`, `planned.start`), so the ops the host orders are the ones the direct edit plans
// (`paintAt`, `moveStartTo`), and both maps end identical, with the bushes and the start at that level, not on the roof's top.

import { describe, expect, test } from "vitest";
import type { EditOp } from "../../src/core/doc/ops";
import type { PaintParams } from "../../src/core/doc/paintParams";
import { MapSession } from "../../src/core/doc/session";
import { writeTimber } from "../../src/core/format/timber";
import { tilesToRuns } from "../../src/core/math/grid";
import * as ed from "../../src/worker/session";
import { CAVE, CAVE_W, caveFile, caveSession, caveVoxels } from "./caveMap";
import { makeRig } from "./collabSessionRig";

const W = CAVE_W;
const tiles: number[] = [];
for (let y = CAVE.y0 + 1; y <= CAVE.y1 - 1; y++) for (let x = CAVE.x0 + 1; x <= CAVE.x1 - 1; x++) tiles.push(y * W + x);
const bushes: PaintParams = { kind: "bushes", template: "BlueberryBush", area: tilesToRuns(tiles, W), density: 1, seed: 7 };

/** The cave map with its cave's air from level 1 up to the roof (a start needs five levels of air; the usual cave has three). */
function tallCave(): MapSession {
  const v = caveVoxels();
  const N = W * W;
  for (let y = CAVE.y0; y <= CAVE.y1; y++) for (let x = CAVE.x0; x <= CAVE.x1; x++) for (let z = 1; z < 8; z++) v[z * N + y * W + x] = z < 7 ? 0 : 1;
  return MapSession.importMap(writeTimber(caveFile(v)), "cave.timber");
}

/** The ops with the fresh entity ids masked (a start's id is a new uuid each plan). */
const masked = (ops: readonly EditOp[]) => JSON.parse(JSON.stringify(ops, (k, v) => (k === "id" ? "<id>" : v)));
const opsOf = (plan: { ok: boolean; ops?: EditOp[] }) => {
  expect(plan.ok).toBe(true);
  return plan.ops ?? [];
};

/** Plan on the host's map, plan on the guest's, and the guest orders its ops through the host. */
function rigOn(map: MapSession) {
  const rig = makeRig(map.project());
  rig.connect();
  const plan = <T>(who: "host" | "guest", f: () => T): T => {
    ed.collabOpen((who === "host" ? rig.hostMap : rig.guestMap).session!);
    return f();
  };
  return { rig, plan };
}

describe("a level under a roof through the shared session", () => {
  test("a stroke of bushes at the cave's floor: the guest's plan is the host's own, and both maps end identical with the bushes at that level", async () => {
    const { rig, plan } = rigOn(caveSession());
    const host = opsOf(plan("host", () => ed.planned.paint(bushes, 3)));
    const guest = opsOf(plan("guest", () => ed.planned.paint(bushes, 3)));
    expect(guest).toEqual(host);
    expect(host.length).toBeGreaterThan(0);
    // (without the level the stroke plans other ops: the roof's top)
    expect(opsOf(plan("guest", () => ed.planned.paint(bushes)))).not.toEqual(guest);
    const answer = rig.guest.submit({ kind: "edit", label: "Bushes", ops: guest });
    rig.drain();
    expect(await answer).toMatchObject({ ok: true });
    rig.identical("after a stroke at a level");
    for (const map of [rig.hostMap.session!, rig.guestMap.session!]) {
      const bush = map.built.entities.filter((e) => e.template === "BlueberryBush");
      expect(bush.length).toBeGreaterThan(0);
      expect(new Set(bush.map((e) => e.z))).toEqual(new Set([3]));
    }
  });

  test("the start at the cave's floor: the guest's plan is the host's own (but for its fresh id), and both maps end identical with it at that level", async () => {
    const { rig, plan } = rigOn(tallCave());
    const host = opsOf(plan("host", () => ed.planned.start(17, 17, "Cw0", 1)));
    const guest = opsOf(plan("guest", () => ed.planned.start(17, 17, "Cw0", 1)));
    expect(masked(guest)).toEqual(masked(host));
    // (without the level the start is refused: nothing stands on the roof's top there)
    expect(plan("guest", () => ed.planned.start(17, 17, "Cw0")).ok).toBe(false);
    const answer = rig.guest.submit({ kind: "edit", label: "Start", ops: guest });
    rig.drain();
    expect(await answer).toMatchObject({ ok: true });
    rig.identical("after a start at a level");
    for (const map of [rig.hostMap.session!, rig.guestMap.session!]) expect(map.built.entities.find((e) => e.template === "StartingLocation")).toMatchObject({ x: 16, y: 16, z: 1 });
  });
});
