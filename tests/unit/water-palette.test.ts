// One shared water palette (PLAN §20 D177, Kyler's review of #41): clean water's and badwater's
// colours, their opacity, the contamination blend and its calibration live in
// src/render3d/waterPalette.ts, and the water shader reads them only through the GLSL generated
// from it, so the Standard look (and Map look 2's High look, when it adopts #38) can never drift
// apart. This fails if a water colour is defined anywhere else in the source.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { DataTexture } from "three";
import { sceneUniforms, waterMaterial } from "../../src/render3d/materials";
import { WATER, WATER_BLEND, WATER_CALIBRATION, WATER_GLSL, type Rgb } from "../../src/render3d/waterPalette";

const HOME = "src/render3d/waterPalette.ts";

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Every colour literal in a source: [r, g, b] and vec3(r, g, b) with numbers (0–1, or 0–255
 *  whole numbers), and #rrggbb. */
function colourLiterals(text: string): { literal: string; rgb: Rgb }[] {
  const out: { literal: string; rgb: Rgb }[] = [];
  const num = String.raw`(\d*\.?\d+)`;
  const triple = new RegExp(String.raw`(?:\[|vec3\()\s*${num}\s*,\s*${num}\s*,\s*${num}\s*[\])]`, "g");
  for (const m of text.matchAll(triple)) {
    const v = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (v.every((x) => x <= 1)) out.push({ literal: m[0], rgb: v as unknown as Rgb });
    else if (v.every((x) => Number.isInteger(x) && x <= 255)) out.push({ literal: m[0], rgb: v.map((x) => x / 255) as unknown as Rgb });
  }
  for (const m of text.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const h = m[1];
    out.push({ literal: m[0], rgb: [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16) / 255) as unknown as Rgb });
  }
  return out;
}

describe("the shared water palette", () => {
  const colours: [string, Rgb][] = [
    ...Object.entries(WATER).map(([k, c]) => [`WATER.${k}`, c] as [string, Rgb]),
    ...WATER_CALIBRATION.targets.flatMap((t) => Object.entries(t.bands).map(([band, c]) => [`the target "${t.name}" (${band})`, c.map((v) => v / 255) as unknown as Rgb] as [string, Rgb])),
  ];

  it("is the only place a water colour is defined", () => {
    const found: string[] = [];
    for (const file of sources("src")) {
      const name = relative(".", file).replace(/\\/g, "/");
      if (name === HOME) continue;
      for (const { literal, rgb } of colourLiterals(readFileSync(file, "utf8")))
        for (const [key, c] of colours) if (c.every((v, k) => Math.abs(v - rgb[k]) < 0.006)) found.push(`${name}: ${literal} is ${key}`);
    }
    expect(found).toEqual([]);
    // no other module of the 3D view declares a water palette of its own
    for (const file of sources("src/render3d")) {
      const name = relative(".", file).replace(/\\/g, "/");
      if (name === HOME) continue;
      expect(readFileSync(file, "utf8"), name).not.toMatch(/(?:export )?const (?:WATER|BADWATER|WATER_SURFACE|WATER_BLEND)\b\s*[:=]/);
    }
  });

  it("gives the water shader every colour and its opacity through the GLSL made from its values", () => {
    const src = readFileSync("src/render3d/materials.ts", "utf8");
    const start = src.indexOf("export function waterMaterial");
    const body = src.slice(start, src.indexOf("\nexport function", start + 1));
    // the water shader's own code has no colour of its own
    expect(body).not.toMatch(/vec3\(\s*-?\d/);
    expect(body).not.toContain("glColor(");
    expect(body).not.toMatch(/\bWATER\./);
    expect(body).toContain("${WATER_GLSL}");
    const t = () => new DataTexture(new Uint8Array(4), 1, 1);
    for (const lite of [false, true]) {
      const shader = waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), lite).fragmentShader;
      expect(shader).toContain(WATER_GLSL);
      for (const fn of ["cleanWaterBody(d, absorb)", "badwaterBody(depth)", "cleanWaterAlpha(d)", "badwaterAlpha(depth, shore)", "badwaterShade(BADWATER_STREAK, depth)", "badwaterShade(BADWATER_TROUGH, depth)", "waterBlend(body, murky, cont)", "waterTint(cont)"]) expect(shader).toContain(fn);
    }
    // the GLSL is made from the exported values
    const gl = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));
    for (const c of Object.values(WATER)) expect(WATER_GLSL).toContain(`vec3(${c.map(gl).join(", ")})`);
    for (const k of ["from", "to", "power", "lean", "room"] as const) expect(WATER_GLSL).toContain(gl(WATER_BLEND[k]));
  });

  it("keeps the calibration with the colours: the method, and the targets, #38's for badwater", () => {
    const m = WATER_CALIBRATION.method;
    expect(Object.keys(m.bands)).toEqual(["trough", "body", "typical", "streak"]);
    expect(m.bed).toBe(64);
    expect(m.time).toBe(8);
    expect(m.tolerance).toBe(2);
    // badwater's targets are #38's approved typical texture, troughs and streaks; clean water's
    // hold the Standard look as approved
    const bad = WATER_CALIBRATION.targets.filter((t) => t.share === 1);
    expect(bad.length).toBe(1);
    expect(Object.keys(bad[0].bands).sort()).toEqual(["streak", "trough", "typical"]);
    expect(WATER_CALIBRATION.targets.filter((t) => t.share === 0).length).toBeGreaterThanOrEqual(3);
    // the measuring tool reads them from here
    const tool = readFileSync("tools/capture-badwater.ts", "utf8");
    expect(tool).toContain("WATER_CALIBRATION");
  });
});
