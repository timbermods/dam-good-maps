import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { F, formatFloat, JsonFloat, parse, stringify } from "../../src/core/format/json";
import { decodeWorld, encodeWorld } from "../../src/core/format/world";
import { readTimber, writeTimber } from "../../src/core/format/timber";
import { FOOTPRINTS, ORIENTATIONS, worldBlocks, type Orientation } from "../../src/core/format/footprints";
import { jpegSize } from "../../src/core/validate/checks";
import { thumbnailJpeg } from "../../src/core/render/shade";

describe("C#-style floats (FORMAT.md §4.1, prototype tbmap.format_float)", () => {
  it.each([
    [1, "1.0"],
    [0.5, "0.5"],
    [10, "10.0"],
    [0.3823739, "0.3823739"],
    [6.80089e-5, "6.80089E-05"],
    [1e-5, "1E-05"],
    [0.0001, "0.0001"],
    [1e16, "1E+16"],
    [123456.789, "123456.789"],
    [-2.5, "-2.5"],
    [0, "0.0"],
  ])("%s -> %s", (v, s) => expect(formatFloat(v)).toBe(s));

  it("keeps ints and floats apart and preserves float text", () => {
    const text = '{"a":1,"b":1.0,"c":6.80089E-05,"d":[0.25,2],"e":"x\\"y","f":true,"g":null}';
    const v = parse(text);
    expect(stringify(v)).toBe(text);
    expect((v as { b: JsonFloat }).b).toBeInstanceOf(JsonFloat);
    expect(stringify({ x: F(2), y: 2 })).toBe('{"x":2.0,"y":2}');
    expect(() => stringify({ x: 0.5 })).toThrow();
  });

  it('a "__proto__" member round-trips as its own data property (audit A3)', () => {
    const text = '{"__proto__":{"Forged":1},"b":2}';
    const v = parse(text);
    expect(Object.getPrototypeOf(v)).toBeNull();
    expect(Object.keys(v as object)).toEqual(["__proto__", "b"]);
    expect((v as Record<string, unknown>).__proto__).toEqual({ Forged: 1 });
    expect((v as { Forged?: number }).Forged).toBeUndefined();
    expect(stringify(v)).toBe(text);
  });

  it("rejects a raw control character inside a string (audit A4)", () => {
    expect(() => parse('{"a":"first line\nsecond line"}')).toThrow(/control character/);
    expect(() => parse('{"a":"esc\\u0041ped then bad:\t"}')).toThrow(/control character/);
    expect(parse('{"a":"escaped\\n newline"}')).toEqual({ a: "escaped\n newline" });
  });
});

describe("footprints (notes/blocks_and_placement.md §1)", () => {
  const notes = JSON.parse(readFileSync("investigation/notes/footprints.json", "utf8"));
  it("match footprint2d_by_orientation for every template and orientation", () => {
    let compared = 0;
    for (const [name, fp] of Object.entries(FOOTPRINTS)) {
      const expected = notes[name]?.footprint2d_by_orientation;
      if (!expected) continue;
      const table = typeof expected === "string" ? JSON.parse(expected.replace(/'/g, '"')) : expected;
      for (const o of ORIENTATIONS) {
        const cells = new Set(worldBlocks(fp, { template: name, x: 0, y: 0, z: 0, orientation: o as Orientation, flipped: false }).map((b) => `${b.x},${b.y}`));
        const want = new Set((table[o] as [number, number][]).map(([x, y]) => `${x},${y}`));
        // the notes list every block's column, occupied or not; ours skips blocks with no flags
        for (const c of cells) expect(want.has(c)).toBe(true);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(100);
  });
});

describe("world.json and .timber", () => {
  it("thumbnail is a 960x540 JPEG", () => {
    const h = new Uint8Array(32 * 32).map((_, i) => 2 + ((i >> 5) % 5));
    expect(jpegSize(thumbnailJpeg(h, 32, 32))).toEqual([960, 540]);
  });

  const raw = "investigation/raw";
  const maps: string[] = [];
  for (const dir of ["builtin", "workshop", "user", "saves"]) {
    const p = join(raw, dir);
    if (existsSync(p)) for (const f of readdirSync(p)) if (f.endsWith(".timber")) maps.push(join(p, f));
  }
  // Official and workshop maps are not redistributable, so this runs only where they were copied
  // locally (investigation/raw); CI runs the same round trip on generated maps (contract tests).
  it.skipIf(maps.length === 0)(`round-trips every local voxel map byte for byte (${maps.length} files)`, () => {
    let checked = 0;
    for (const path of maps) {
      const bytes = new Uint8Array(readFileSync(path));
      const text = strFromU8(unzipSync(bytes)["world.json"]).replace(/^﻿/, "");
      const w = decodeWorld(text);
      if (w.legacy) continue;
      expect(encodeWorld(w), path).toBe(text);
      const again = readTimber(writeTimber(readTimber(bytes)));
      expect(encodeWorld(again.world), path).toBe(text);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(30);
  });
});
