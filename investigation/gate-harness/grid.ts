import { BROOK_MEANDER, courseReach, meander } from "../src/core/premise/gateBrooks";
import { pathDist, pathLength, pointAt } from "../src/core/premise/geom";
const M = BROOK_MEANDER as any;
const angles = [0, 23, 45, 67];
for (const wd of [3, 4]) for (const f of [8, 9, 10]) for (const om of [1.1, 1.3, 1.6]) {
  M.wave = [f, f]; M.swing = om; let seed = 7; const draw = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const worst: number[] = []; let touch = 0, belt = 0;
  for (const a of angles) { const r = (a * Math.PI) / 180; const course: [number, number][] = [[30, 30], [30 + 100 * Math.cos(r), 30 + 100 * Math.sin(r)]]; let w = 0;
    for (let t = 0; t < 6; t++) { const ch = meander(course, wd, draw, [], () => true); w = Math.max(w, courseReach(ch, wd / 2).tiles);
      // belt: lateral offset from the course line over 5
      if (ch.some((p) => pathDist(p[0], p[1], course).d > 5)) belt++;
      // self-touch: points over 3 widths apart along it, nearer than a width
      const L = pathLength(ch); const pts = Array.from({ length: Math.ceil(L) }, (_, k) => pointAt(ch, k).p);
      let tch = false; for (let i = 0; i < pts.length && !tch; i++) for (let j = i + 3 * wd; j < pts.length; j++) if (Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) < wd) { tch = true; break; }
      if (tch) touch++; }
    worst.push(w); }
  console.log(`w${wd} λ${f}w ω${om}: worst ${worst.join("/")} (0°/23°/45°/67°) touch ${touch}/24 belt>5 ${belt}/24`);
}
