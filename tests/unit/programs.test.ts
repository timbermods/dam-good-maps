// Programs compiled before a frame needs them (programs.ts, D453): a material's defines are its program's name, order
// included, so the branches a map gains in any order must come out in one order, or a program compiled ahead is not
// the one the switch asks for and the frame compiles it again. And the browser compiles what it is sent in turn, so the
// programs compiled ahead go a few at a time and none while a switch waits for its own: a dig's program never waits
// behind a queue of ones nobody needs yet.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShaderMaterial } from "three";
import { Programs, WARM_IN_FLIGHT, withDefine, type ProgramsHost } from "../../src/render3d/programs";

describe("withDefine", () => {
  it("writes the same branches in the same order whichever came first, the material's own first", () => {
    const own = { LITE: 0, CUTAWAY: 0 };
    const a = withDefine(withDefine(withDefine(own, "RUN_SOIL", 1), "CAVES", 1), "CUTAWAY", 1);
    const b = withDefine(withDefine(withDefine(own, "CUTAWAY", 1), "CAVES", 1), "RUN_SOIL", 1);
    expect(JSON.stringify(a)).toBe('{"LITE":0,"CUTAWAY":1,"CAVES":1,"RUN_SOIL":1}');
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    // a branch taken out and put back: the same again
    expect(JSON.stringify(withDefine(withDefine(a, "CAVES", null), "CAVES", 1))).toBe(JSON.stringify(a));
    expect(withDefine(a, "CAVES", null)).toEqual({ LITE: 0, CUTAWAY: 1, RUN_SOIL: 1 });
  });
});

/** A program the browser compiles in the background: ready when the test says. */
interface FakeProgram {
  key: string;
  done: boolean;
  isReady(): boolean;
}

/** A renderer as far as programs.ts uses it: a compile sends a program per material and defines (three.js's cache:
 *  the same name is the same program), kept in the material's own map. */
function fakeHost() {
  const props = new Map<object, { programs?: Map<string, FakeProgram> }>();
  const cache = new Map<string, FakeProgram>();
  const sent: string[] = [];
  const get = (m: object) => {
    if (!props.has(m)) props.set(m, {});
    return props.get(m)!;
  };
  const gl = {
    extensions: { has: () => true },
    properties: { get },
    compile(obj: { material: ShaderMaterial }) {
      const m = obj.material;
      const key = `${m.name}:${JSON.stringify(m.defines)}`;
      let p = cache.get(key);
      if (!p) {
        p = {
          key,
          done: false,
          isReady() {
            return this.done;
          },
        };
        cache.set(key, p);
        sent.push(key);
      }
      (get(m).programs ??= new Map()).set(key, p);
    },
  };
  const host = { gl, scene: {}, camera: () => ({}), drawnWith: () => [], standIn: () => ({ material: null }), changed: () => {} } as unknown as ProgramsHost;
  const finish = (key: string) => (cache.get(key)!.done = true);
  return { host, sent, finish, props };
}

const material = (name: string, defines: Record<string, number>) => ({ name, defines, needsUpdate: false, addEventListener: () => {} }) as unknown as ShaderMaterial;

describe("Programs' queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as { window?: unknown }).window ??= globalThis;
  });
  afterEach(() => vi.useRealTimers());

  it("sends the programs compiled ahead a few at a time, a switch's own at once, and the rest only once it is made", async () => {
    const { host, sent, finish, props } = fakeHost();
    const programs = new Programs(host);
    const terrain = material("terrain", { LITE: 0, CUTAWAY: 0 });
    // the terrain drawn already: its program compiled
    props.set(terrain, { programs: new Map([["drawn", { key: "drawn", done: true, isReady: () => true }]]) });
    const warmed = Array.from({ length: 6 }, (_, k) => material(`m${k}`, { LITE: 0 }));
    let resolved = false;
    void programs.warm(warmed.map((m) => [m, { LITE: 0, CAVES: 1 }])).then(() => (resolved = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(sent.length, "a few sent at once").toBe(WARM_IN_FLIGHT);
    expect(programs.queued).toBe(6 - WARM_IN_FLIGHT);
    // a dig: the terrain's cutaway, its compile sent at once, ahead of the queue
    programs.set(terrain, "CUTAWAY", 1);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent.at(-1)).toBe('terrain:{"LITE":0,"CUTAWAY":1}');
    // the ones sent before it finish: nothing more is sent while the switch waits
    finish(sent[0]);
    finish(sent[1]);
    await vi.advanceTimersByTimeAsync(100);
    expect(sent.length, "nothing more sent while a switch waits").toBe(WARM_IN_FLIGHT + 1);
    expect(terrain.defines.CUTAWAY, "the switch waits for its program").toBe(0);
    expect(programs.settled).toBe(false);
    // its program ready: the switch made, and the queue goes on
    finish('terrain:{"LITE":0,"CUTAWAY":1}');
    await vi.advanceTimersByTimeAsync(20);
    expect(terrain.defines.CUTAWAY).toBe(1);
    expect(programs.settled).toBe(true);
    expect(sent.length).toBe(WARM_IN_FLIGHT * 2 + 1);
    // the rest, sent as those before them finish, and the warm-up resolved when all are ready
    for (let k = 0; k < 10 && !resolved; k++) {
      for (const key of sent) finish(key);
      await vi.advanceTimersByTimeAsync(20);
    }
    expect(sent.length).toBe(6 + 1);
    expect(resolved).toBe(true);
  });
});
