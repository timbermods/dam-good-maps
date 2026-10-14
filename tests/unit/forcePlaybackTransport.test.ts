import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSpec } from "../../src/core/spec/mapspec";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { RIFT_DEFAULTS } from "../../src/core/forces/rift";
import { DEPOSIT_DEFAULTS } from "../../src/core/forces/deposit";
import { applyForceTerrain } from "../../src/editor/session/mirror";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

afterEach(() => {
  ed.forceCancel();
  vi.restoreAllMocks();
});

it("patches accumulate before a draw, and whole replies replace them on undo", () => {
  const m = { heights: new Uint8Array(24).fill(2) };
  const original = m.heights;
  const drawn = original.slice();
  applyForceTerrain(
    m,
    {
      rect: { x0: 1, y0: 1, x1: 2, y1: 2 },
      heightPatch: new Uint8Array([3, 4, 5, 6]),
    },
    6,
  );
  applyForceTerrain(
    m,
    {
      rect: { x0: 2, y0: 2, x1: 3, y1: 2 },
      heightPatch: new Uint8Array([7, 8]),
    },
    6,
  );
  expect(m.heights).toBe(original);
  expect(Array.from(m.heights)).toEqual([2, 2, 2, 2, 2, 2, 2, 3, 4, 2, 2, 2, 2, 5, 7, 8, 2, 2, 2, 2, 2, 2, 2, 2]);
  expect(Array.from(drawn)).toEqual(new Array(24).fill(2));
  expect(applyForceTerrain(m, {}, 6)).toBe(false);
  applyForceTerrain(m, { rect: { x0: 0, y0: 0, x1: 5, y1: 3 }, heights: drawn }, 6);
  expect(m.heights).toBe(drawn);
});

describe("a force's packed rows (#312) show every frame the whole snapshots do, for every force", () => {
  const origin: [number, number] = [30, 24];
  const requests: ed.ForceRequest[] = [
    {
      verb: "carve",
      settings: { ...CARVE_DEFAULTS, power: 50, seed: 7 },
      origin: [30, 10],
      end: [20, 37],
      cut: null,
    },
    {
      verb: "craterize",
      settings: { ...CRATER_DEFAULTS, power: 50, seed: 7 },
      origin,
      cut: null,
    },
    {
      verb: "erupt",
      settings: { ...ERUPT_DEFAULTS, power: 50, seed: 7 },
      origin,
      cut: null,
    },
    {
      verb: "quake",
      settings: { ...QUAKE_DEFAULTS, power: 50, seed: 7, mode: "slide" },
      path: [
        { x: 10, y: 25 },
        { x: 37, y: 28 },
      ],
      side: 1,
      cut: null,
    },
    {
      verb: "glaciate",
      settings: { ...GLACIATE_DEFAULTS, power: 50, seed: 7 },
      origin: [30, 10],
      end: [20, 37],
      cut: null,
    },
    {
      verb: "rift",
      settings: { ...RIFT_DEFAULTS, power: 50, seed: 7 },
      path: [
        { x: 10, y: 25 },
        { x: 37, y: 28 },
      ],
      cut: null,
    },
    {
      verb: "deposit",
      settings: { ...DEPOSIT_DEFAULTS, power: 50, seed: 7 },
      path: [
        { x: 18, y: 24 },
        { x: 32, y: 26 },
      ],
      cut: null,
    },
  ];
  for (const request of requests)
    it(request.verb, async () => {
      await runGenerate(makeSpec({ seed: 4242, theme: "highlands", size: { x: 48, y: 48 } }));
      ed.refine();
      const bytes = ed.project().bytes;
      let tick = 0,
        uuid = 0;
      vi.spyOn(performance, "now").mockImplementation(() => (tick += 0.25));
      vi.spyOn(crypto, "randomUUID").mockImplementation(() => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`);
      const play = (patches: boolean) => {
        ed.openProject(bytes);
        tick = 0;
        uuid = 0;
        const m = { heights: ed.terrainNow().heights };
        const start = ed.forceStart(request);
        expect(start.errors).toEqual([]);
        expect(start.frame).not.toBeNull();
        applyForceTerrain(m, start.frame!, 48);
        const frames: {
          heights: number[];
          cue: ed.ForceFrame["cue"];
          shown: number;
          trail: ed.ForceFrame["trail"];
        }[] = [];
        let patchCount = 0;
        for (let k = 0; k < 500; k++) {
          const frame = ed.forceAdvance(1, patches)!;
          expect(frame).not.toBeNull();
          const transfer = [frame.heightPatch?.buffer, frame.heights?.buffer].filter(Boolean) as ArrayBuffer[];
          const f = structuredClone(frame, { transfer });
          if (f.heightPatch) {
            patchCount++;
            expect(frame.heightPatch!.byteLength).toBe(0);
          }
          applyForceTerrain(m, f, 48);
          frames.push({
            heights: Array.from(m.heights),
            cue: f.cue,
            shown: f.shown,
            trail: f.trail,
          });
          if (f.done) break;
        }
        expect(frames.at(-1)?.cue.phase).toBe("done");
        const kept = ed.forceStop();
        expect(kept.ok).toBe(true);
        expect(Array.from(kept.view.heights!)).toEqual(Array.from(m.heights));
        return { frames, patchCount };
      };
      const full = play(false),
        sparse = play(true);
      expect(sparse.patchCount).toBeGreaterThan(0);
      expect(sparse.frames).toEqual(full.frames);
    });
});
