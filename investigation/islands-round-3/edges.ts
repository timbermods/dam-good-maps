// Why a sea's coast runs with the map's edges: the drawn sea (its ellipse, widened by its noise up to
// 1.45, out to the 1.05 where its shelf ends) against the rim's inner line, and the settled shore's
// share lying in the rim's band (within 16% of the side of an edge).
//   npx tsx investigation/islands-round-3/edges.ts <size> <a> <b>
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
const [size, a, b] = process.argv.slice(2, 5).map(Number);
for (let seed = a; seed <= b; seed++) {
  const r = generate(makeSpec({ seed, theme: "islands", size: { x: size, y: size } }));
  const { W, H } = r.built; const w = r.built.water; const side = Math.min(W, H);
  const g: any = (r.info as any).genome;
  const sea = g.parts.find((q: any) => q.shape === "sea");
  // the ellipse's half-extent along x and y, at d = 1.05, and at the noise's widest (×1.45)
  const asp = sea.extra; const major = sea.size * Math.sqrt(asp); const minor = sea.size / Math.sqrt(asp);
  const ux = Math.cos(2 * Math.PI * sea.turn), uy = Math.sin(2 * Math.PI * sea.turn);
  const hx = Math.hypot(major * ux, minor * uy) * 1.05, hy = Math.hypot(major * uy, minor * ux) * 1.05;
  const cx = sea.at[0] * W, cy = sea.at[1] * H;
  const room = [cx, W - 1 - cx, cy, H - 1 - cy];
  const over = [hx - room[0], hx - room[1], hy - room[2], hy - room[3]].map((v) => v / side);
  const cut = over.filter((v) => v > -0.11).length; // edges the plain ellipse reaches past the rim's widest inner line
  const cutNoisy = over.map((v, k) => v + ((k < 2 ? hx : hy) * 0.45) / side).filter((v) => v > -0.11).length;
  // the settled shore: wet tiles beside dry; its share within 16% of the side of an edge
  let shore = 0, nearEdge = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (!(w[i] > 0.05)) continue;
    if (!(w[i - 1] > 0.05) || !(w[i + 1] > 0.05) || !(w[i - W] > 0.05) || !(w[i + W] > 0.05)) {
      shore++; if (Math.min(x, y, W - 1 - x, H - 1 - y) < 0.16 * side) nearEdge++;
    }
  }
  console.log(JSON.stringify({ seed, layout: g.seaLayout, ring: !!g.seaRing, R: +(sea.size / side).toFixed(3), asp: +asp.toFixed(2), at: sea.at.map((v: number) => +v.toFixed(2)), cut, cutNoisy, over: over.map((v) => +v.toFixed(2)), shoreNearEdge: +(nearEdge / Math.max(1, shore)).toFixed(2) }));
}
