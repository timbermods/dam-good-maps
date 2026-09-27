// What M9a's maps hold instead of stamped set pieces (D111, docs/m9-design.md): falls emerge on the
// rivers' beds, and dam opportunities are the land's own. "The falls" and "the dam site" read as
// those when the map has no waterfall or dam-site feature (a map from M9a on, or an import).

import { damSites } from "../../../src/core/analysis/damsites";
import { pointAtArc } from "../../../src/core/features/geometry";
import type { RiverFeature } from "../../../src/core/features/schema";
import { distanceFrom } from "../../../src/core/math/grid";
import { locate, type Course, type Network } from "./flow";
import type { MapView } from "./view";

export interface NaturalTarget {
  name: string;
  anchor: [number, number];
  course?: Course;
}

/** The falls on the rivers (bed steps of 2+ levels): "the cascade" is the highest on the main
 *  river, "the falls" its lowest, any other word the one nearest the start. */
export function naturalFall(v: MapView, net: Network, word: string): NaturalTarget | null {
  const falls: { course: Course; anchor: [number, number]; s: number; drop: number }[] = [];
  for (const f of v.features) {
    if (f.kind !== "river") continue;
    const course = net.byId.get(f.id);
    if (!course) continue;
    for (const st of (f as RiverFeature).params.bedProfile.steps) {
      if (st.drop < 2) continue;
      const { p } = pointAtArc(f.params.path, st.at);
      const anchor: [number, number] = [Math.max(0, Math.min(v.W - 1, Math.round(p[0]))), Math.max(0, Math.min(v.H - 1, Math.round(p[1])))];
      const l = locate(net, v.W, anchor[0], anchor[1], course);
      falls.push({ course, anchor, s: l ? l.s : st.at, drop: st.drop });
    }
  }
  if (!falls.length) return null;
  const main = falls.filter((x) => x.course.main);
  let pick = falls[0];
  if (/cascade/.test(word) && main.length) pick = main.reduce((a, b) => (b.s < a.s ? b : a));
  else if (/falls$/.test(word) && main.length) pick = main.reduce((a, b) => (b.s > a.s ? b : a));
  else if (v.start) {
    const d = (x: (typeof falls)[number]) => Math.hypot(x.anchor[0] - v.start!.x, x.anchor[1] - v.start!.y);
    pick = falls.reduce((a, b) => (d(b) < d(a) ? b : a));
  }
  return { name: `the ${pick.drop}-level fall on ${pick.course.name}`, anchor: pick.anchor, course: pick.course };
}

/** The land's best dam opportunity: the dam site (a short dam across clean water) that holds the
 *  most within 40 tiles of the start, as the validators sample them. */
export function naturalDam(v: MapView, net: Network): NaturalTarget | null {
  if (!v.start) return null;
  const { W, H } = v;
  const N = W * H;
  const clean = new Uint8Array(N);
  const surf = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    clean[i] = v.water[i] > 0.05 && v.contamination[i] < 0.05 ? 1 : 0;
    surf[i] = v.heights[i] + v.water[i];
  }
  const startMask = new Uint8Array(N);
  startMask[v.start.y * W + v.start.x] = 1;
  const sd = distanceFrom(startMask, W, H);
  const sites = damSites(v.heights, clean, surf, W, H, sd, 60, [1, 2, 3], 2, 30, 0);
  let best: (typeof sites)[number] | null = null;
  for (const s of sites) if (sd[s.y * W + s.x] <= 40 && (!best || s.volume > best.volume)) best = s;
  if (!best) return null;
  let course: Course | undefined;
  let nearest = Infinity;
  for (const c of net.courses) {
    const d = c.field.d[best.y * W + best.x];
    if (d < nearest) {
      nearest = d;
      course = c;
    }
  }
  return { name: `the natural dam site (${Math.round(best.volume)} water behind a ${best.length}-tile dam)`, anchor: [best.x, best.y], ...(course && nearest < 8 ? { course } : {}) };
}
