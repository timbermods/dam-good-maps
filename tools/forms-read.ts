// Whether the generator's 3D forms read as what they are (D503): for each kept form, an arch's
// sightlines through its opening at the game's camera angles (analysis/seeThrough.ts) and an
// overhang's roof depth (how far the rock reaches over open ground from the sky's edge), with the
// forms per theme and the time each map takes. One map a line as JSON, then a summary.
//
//   npx tsx tools/forms-read.ts [--themes riverValley,lakeBasin,canyon,highlands,islands,delta,any] [--seeds 1-4] [--size 128] [--vt 40]

import { generate } from "../src/core/gen/generate";
import { FORMS, type FormId } from "../src/core/land/forms3d";
import { makeSpec, type ThemeId } from "../src/core/spec/mapspec";
import { readsThrough, roofDepths, seeThrough, shelters, underRock } from "../src/core/analysis/seeThrough";
import { isPlainMask, plainMask } from "../src/core/terrain/runs";

const arg = (n: string, f: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : f;
};
const themes = arg("themes", "riverValley,lakeBasin,canyon,highlands,islands,delta,any").split(",") as ThemeId[];
const [a, b] = arg("seeds", "1-4").split("-").map(Number);
const size = Number(arg("size", "128"));
const vt = arg("vt", "");

const rows: { theme: string; seed: number; ms: number; forms: Record<string, number>; arches: number; seen: number; overhangs: number; deep: number; detail: string[]; dropped: string[] }[] = [];
for (const theme of themes)
  for (let seed = a; seed <= (b ?? a); seed++) {
    const spec = makeSpec({ seed, theme, size: { x: size, y: size } });
    if (vt) spec.settings.terrain.verticality = Number(vt);
    const t0 = performance.now();
    const r = generate(spec);
    const ms = Math.round(performance.now() - t0);
    const W = size;
    const H = size;
    const N = W * H;
    const mask = r.built.waterModel.stacked?.mask ?? Uint32Array.from(r.built.heights, (h) => plainMask(h));
    const st = r.built.settle.stack;
    const wet = (i: number, z: number): boolean => {
      if (st && st.stacked) {
        for (let q = 0; q < st.count[i]; q++) {
          const c = q * N + i;
          if (st.depth[c] > 0.01 && z >= st.floor[c] && z < st.floor[c] + st.depth[c]) return true;
        }
        return false;
      }
      const w = r.built.water[i];
      return w > 0.01 && z >= r.built.heights[i] && z < r.built.heights[i] + w;
    };
    const forms: Record<string, number> = {};
    let arches = 0;
    let seen = 0;
    let overhangs = 0;
    let deep = 0;
    const detail: string[] = [];
    for (const x of r.intentions) {
      if (!x.ok || !FORMS.includes(x.id as FormId) || !x.at) continue;
      forms[x.id] = (forms[x.id] ?? 0) + 1;
      const [ax, ay] = x.at;
      const near: number[] = [];
      for (let y = Math.max(0, ay - 9); y <= Math.min(H - 1, ay + 9); y++) for (let xx = Math.max(0, ax - 9); xx <= Math.min(W - 1, ax + 9); xx++) if (!isPlainMask(mask[y * W + xx])) near.push(y * W + xx);
      const kind = x.id as string;
      if (kind.includes("arch")) {
        arches++;
        const s = seeThrough({ W, H, mask, wet }, underRock(mask, N, near));
        const ok = readsThrough(s);
        if (ok) seen++;
        detail.push(`${kind} ${ax},${ay}: beyond ${s.beyond.join("/")} (30/45/60°) ways ${s.ways.map((w) => w.join("")).join("/")}${ok ? " open" : " closed"}`);
      } else if (kind.includes("overhang") || kind.includes("undercut")) {
        overhangs++;
        const d = roofDepths(mask, W, H, near);
        let most = 0;
        let two = 0;
        for (const v of d.values()) {
          most = Math.max(most, v);
          if (v >= 2) two++;
        }
        const ok = shelters(d);
        if (ok) deep++;
        detail.push(`${kind} ${ax},${ay}: roof ${most} deep, ${two} tiles 2+ deep${ok ? "" : " (shallow)"}`);
      } else detail.push(`${kind} ${ax},${ay}`);
    }
    // (and the forms looked for that did not stand, with why)
    const dropped = r.intentions.filter((x) => !x.ok && FORMS.includes(x.id as FormId)).map((x) => `${x.id}: ${x.note}`);
    const row = { theme, seed, ms, forms, arches, seen, overhangs, deep, detail, dropped };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
const by = new Map<string, typeof rows>();
for (const r of rows) by.set(r.theme, [...(by.get(r.theme) ?? []), r]);
console.log("\ntheme        maps  arch-maps seen-maps overhang-maps deep-maps  forms                       ms(median)");
for (const [t, rs] of by) {
  const f: Record<string, number> = {};
  for (const r of rs) for (const [k, v] of Object.entries(r.forms)) f[k] = (f[k] ?? 0) + v;
  const ms = rs.map((r) => r.ms).sort((p, q) => p - q);
  console.log(`${t.padEnd(12)} ${String(rs.length).padStart(4)}  ${String(rs.filter((r) => r.arches).length).padStart(9)} ${String(rs.filter((r) => r.seen).length).padStart(9)} ${String(rs.filter((r) => r.overhangs).length).padStart(13)} ${String(rs.filter((r) => r.deep).length).padStart(9)}  ${JSON.stringify(f).padEnd(28)} ${ms[Math.floor(ms.length / 2)]}`);
}
const tot = rows.reduce((s, r) => s + r.ms, 0);
console.log(`\nall: ${rows.length} maps; an arch seen through on ${rows.filter((r) => r.seen).length}; an overhang 2+ deep on ${rows.filter((r) => r.deep).length}; ${rows.filter((r) => Object.keys(r.forms).length).length} with any form; generate ${tot} ms in all, ${Math.round(tot / rows.length)} a map`);
