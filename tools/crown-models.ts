// Our grown plants' triangles for tools/game-crowns.py (D135, D178): each look's model of the pine, birch, oak and
// blueberry bush as it ships (Standard's `modelOf`, High's three variants near and far, `high:` and `highfar:`; the
// forest draws the far ones under 18 to 23 pixels a tile, as at the start shots' zoom), its positions, its face normals as the
// renderer lights them and its albedo (High's: its palette slot × its shade), as JSON.
//
//   npx tsx tools/crown-models.ts .scratch/crowns/ours.json
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { modelOf } from "../src/render3d/entities3d";
import { model, paletteDefaults, slots, species } from "../src/render3d/high/models";

const out: Record<string, { pos: number[]; nrm: number[]; col: number[] }> = {};
for (const sp of species) {
  const m = modelOf(sp);
  // (Standard's parts are flat: each triangle's own normal)
  const nrm: number[] = [];
  const p = m.pos;
  for (let k = 0; k < p.length; k += 9) {
    const a = [p[k + 3] - p[k], p[k + 4] - p[k + 1], p[k + 5] - p[k + 2]];
    const b = [p[k + 6] - p[k], p[k + 7] - p[k + 1], p[k + 8] - p[k + 2]];
    const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    for (let j = 0; j < 3; j++) nrm.push(n[0] / l, n[1] / l, n[2] / l);
  }
  out[`standard:${sp}`] = { pos: [...p], nrm, col: [...m.col] };
  for (const detail of ["near", "far"] as const) for (let v = 0; v < 3; v++) {
    const g = model(sp, v, detail);
    const P = g.getAttribute("position");
    const N = g.getAttribute("normal");
    const R = g.getAttribute("region");
    const C = g.getAttribute("pcolor");
    const e = { pos: [] as number[], nrm: [] as number[], col: [] as number[] };
    for (let i = 0; i < P.count; i++) {
      e.pos.push(P.getX(i), P.getY(i), P.getZ(i));
      e.nrm.push(N.getX(i), N.getY(i), N.getZ(i));
      const hex = paletteDefaults[slots[Math.round(R.getX(i))]];
      const c = [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16) / 255);
      e.col.push(c[0] * C.getX(i), c[1] * C.getY(i), c[2] * C.getZ(i));
    }
    out[`${detail === "near" ? "high" : "highfar"}:${sp}:${v}`] = e;
  }
}
mkdirSync(dirname(process.argv[2]), { recursive: true });
writeFileSync(process.argv[2], JSON.stringify(out));
console.log(Object.entries(out).map(([k, v]) => `${k}: ${v.pos.length / 9} triangles`).join("\n"));
