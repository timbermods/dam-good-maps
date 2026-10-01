// Adoption prototype: only the explicit Delta theme's unshown land is shaped here.
import { featureId } from '../features/ids';
import type { Point, Edge, RiverFeature } from '../features/schema';
import type { Genome } from '../land/genome';
import type { Hydro } from '../land/hydro';
import { orientXY, orientField } from '../land/orient';
import { fbm } from '../math/noise';
import { stream } from '../math/rng';
import { sinDet } from '../math/detmath';
import { distanceFrom } from '../math/grid';
import { straightness, STRAIGHT_LIMITS } from '../analysis/straight';

const TWO_PI = 6.283185307179586;
const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
function parameters(g: Genome, seed: number) {
    const r = stream(seed, 'delta-alluvium', g.base, g.relief);
    return { centre: .42 + r.float() * .16, bend: .065 + r.float() * .04, phase: r.float() * TWO_PI,
        fork: .24 + r.float() * .10, join: .55 + r.float() * .12, fan: .72 + r.float() * .08,
        spread: .15 + r.float() * .035, side: r.float() < .5 ? -1 : 1 };
}
const bedFor = (u: number) => u < .055 ? 7 : u < .166 ? 5 : 3;
const bankFor = (u: number) => bedFor(u) + 1;
/** Keep poisonous hollows on the higher catchment's outside shoulders. Their short outlets go
 * to a side edge, rather than through the fertile plain or back into a river's head. */
export function deltaBadwaterKeep(h: Uint8Array, water: Uint8Array, W: number, H: number, old?: Uint8Array | null) {
    const d = distanceFrom(water, W, H), out = old ? old.slice() : new Uint8Array(W * H);
    for (let i = 0; i < out.length; i++)
        if (h[i] < 8 || d[i] < 14)
            out[i] = 1;
    return out;
}
/** Soft sediment has a broad low surface; noise belongs mainly to the higher catchment.
 * Channel beds are carved afterwards, never at the floodplain's level (thin-sheet refill issue). */
export function deltaField(g: Genome, seed: number, W: number, H: number) {
    const p = parameters(g, seed), E = new Float64Array(W * H);
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
            const u = x / (W - 1), v = y / (H - 1);
            const shoulder = Math.max(0, Math.abs(v - p.centre) - .12);
            const upland = smooth((.30 - u + .06 * fbm(seed + 37, x, y, Math.min(W, H) * .22, 2)) / .23);
            // Small, broad contour displacements make sediment benches irregular, not full-width stripes.
            const grade = u + .025 * fbm(seed + 71, x, y, Math.min(W, H) * .24, 2);
            E[y * W + x] = Math.max(bankFor(grade), bankFor(u)) + upland * (1 + shoulder * 8 + Math.max(0, fbm(seed + 53, x, y, 24, 3)) * 3);
        }
    return { E, hard: new Float64Array(W * H) };
}
/** A source-driven network: two unequal island loops, then three distinct mouths.
 * Equal downstream beds and narrow arms share the feeder's head; no arm gets a new emitter.
 * Both endpoints of every split are exact points on the main course. */
export function deltaHydro(h: Uint8Array, g: Genome, seed: number, W: number, H: number): Hydro {
    // Width and bend phases are fitted while shaping, before the ordinary land screen. Bounded,
    // seed-only work; no settle, no machine-time cutoff and no replacement of a shown map.
    let best: Hydro | null = null, bestH: Uint8Array | null = null, score = Infinity;
    for (let pose = 0; pose < 12; pose++) {
        const hy = shapeDeltaHydro(h, g, seed, W, H, pose), st = straightness(W, H, Float64Array.from(hy.water));
        const s = Math.max((st.longest?.length ?? 0) / STRAIGHT_LIMITS.run, (st.canal?.length ?? 0) / STRAIGHT_LIMITS.canal);
        if (s < score) {
            score = s;
            best = hy;
            bestH = h.slice();
        }
        if (s <= .77)
            return hy;
    }
    h.set(bestH!);
    return best!;
}
function shapeDeltaHydro(h: Uint8Array, g: Genome, seed: number, W: number, H: number, pose: number): Hydro {
    const p = parameters(g, seed), o = g.orientation ?? 0;
    p.phase += pose * .83;
    const ground = orientField(deltaField(g, seed, W, H).E, W, H, o);
    for (let i = 0; i < h.length; i++)
        h[i] = Math.round(ground[i]);
    const canonical = (u: number): Point => [u * (W - 1), (p.centre + .06 * sinDet(u * TWO_PI * 4.5) * (1 - smooth((u - .23) / .12)) + (p.bend * sinDet(u * TWO_PI * 2.5 + p.phase) + .012 * sinDet(u * TWO_PI * 5.1 + p.phase * .7)) * smooth((u - .19) / .15)) * (H - 1) + 1.5 * sinDet(u * (W - 1) / 25 * TWO_PI + p.phase * 1.7)];
    const turn = (pt: Point): Point => orientXY(pt[0], pt[1], W, H, o);
    const edge = (u: number): Edge => { const [x, y] = turn([u * (W - 1), p.centre * (H - 1)]); return x < 0 ? 'west' : x > W - 1 ? 'east' : y < 0 ? 'south' : 'north'; };
    const water = new Uint8Array(W * H), arms: Hydro['arms'] = [];
    const side = Math.min(W, H), width = Math.min(8.8, 5.5 * Math.sqrt(side / 96));
    // Sufficient head for all arms, with room below one-level floodplain banks.
    const flow = Math.min(9, 7.5 * Math.sqrt(side / 96)) * Math.max(.8, Math.min(1.15, g.hydro.flowMul / 2));
    const path: Point[] = [];
    for (let k = -1; k <= W; k++)
        path.push(turn(canonical(k / (W - 1))));
    const mainId = featureId(seed, 'river', 'river/main');
    const steps: RiverFeature['params']['bedProfile']['steps'] = [];
    let length = 0, lastBed = 7;
    for (let k = 1; k < path.length; k++) {
        length += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
        const u = (k - 1) / (W - 1), bed = bedFor(u);
        if (bed < lastBed) {
            steps.push({ at: length, drop: lastBed - bed });
            lastBed = bed;
        }
    }
    const main: RiverFeature = { id: mainId, kind: 'river', origin: 'generated', role: 'river/main', locked: false,
        params: { path, width, bedDepth: 1, bedProfile: { start: 7, steps }, flow, style: 'braided',
            entry: { edge: edge(-.01) }, exit: { edge: edge(1.01) }, badwater: false } };
    const carve = (pts: Point[], w: number, from = -1 / (W - 1), to = W / (W - 1)) => {
        for (let k = 0; k + 1 < pts.length; k++) {
            const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
            const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
            for (let q = 0; q <= n; q++) {
                const t = q / n, cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t;
                const u = from + (to - from) * (k + t) / (pts.length - 1), bed = bedFor(u);
                const half = w * .5 * (1 + .36 * sinDet(u * (W - 1) / (10 + pose % 5) * TWO_PI + p.phase) + .09 * sinDet(u * (W - 1) / 7 * TWO_PI + p.phase * .3));
                for (let y = Math.max(0, Math.floor(cy - half)); y <= Math.min(H - 1, Math.ceil(cy + half)); y++)
                    for (let x = Math.max(0, Math.floor(cx - half)); x <= Math.min(W - 1, Math.ceil(cx + half)); x++) {
                        if ((x - cx) ** 2 + (y - cy) ** 2 > half * half)
                            continue;
                        const i = y * W + x;
                        h[i] = water[i] ? Math.min(h[i], bed) : bed;
                        water[i] = 1;
                    }
            }
        }
    };
    carve(path, width);
    // Start downstream of the catchment steps. Unequal loops prevent copied lens islands.
    for (const [a, b, sgn, off] of [[p.fork, p.join, p.side, p.spread], [p.fork + .08, p.join + .11, -p.side, p.spread * .72]]) {
        const pts: Point[] = [];
        for (let k = 0; k <= 90; k++) {
            const t = k / 90, u = a + (b - a) * t, [x, y] = canonical(u);
            const swell = 4 * t * (1 - t) * (1 + .18 * sinDet(t * TWO_PI + p.phase));
            pts.push(turn([x, y + sgn * off * (H - 1) * swell + 1.1 * sinDet(t * (b - a) * (W - 1) / 27 * TWO_PI + p.phase) * 4 * t * (1 - t)]));
        }
        carve(pts, width * .53, a, b);
        arms.push({ kind: 'split', river: mainId, path: pts });
    }
    for (const sgn of [-1, 1]) {
        const pts: Point[] = [];
        for (let k = 0; k <= 90; k++) {
            const t = k / 90, u = p.fan + (1.01 - p.fan) * t, [x, y] = canonical(u);
            const off = sgn * (H - 1) * (p.spread + .055) * smooth(t);
            pts.push(turn([x, y + off + 1.1 * sinDet(t * (1.01 - p.fan) * (W - 1) / 27 * TWO_PI + p.phase) * 4 * t * (1 - t)]));
        }
        carve(pts, width * .53, p.fan, 1.01);
        arms.push({ kind: 'mouth', river: mainId, path: pts });
    }
    return { rivers: [main], water, lakes: [], falls: [], arms, flowTotal: flow };
}
