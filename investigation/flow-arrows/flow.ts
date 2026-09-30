import type { MapView } from '../../src/render3d/model';

/** These arrays travel with exactly the water snapshot that produced them. */
export interface SettledFlow {
  source: 'canonical-settle.out';
  out: ArrayLike<number>;
  depth: ArrayLike<number>;
}

/** Net face current at tile centres, using the settle's retained four-direction rates.
 * Order in WaterSim: -y, -x, +y, +x. Average the two opposing face currents, then
 * divide by water depth. out already has rate units (WaterSim multiplies by DT);
 * dividing by DT again would inflate speed. This is the solver's balanced momentum
 * field, not an exact reconstruction of the unretained pre-balancing flux f.
 * There is deliberately no surface-gradient fallback, smoothing or inferred downhill flow.
 */
export function settledVelocity(W: number, H: number, flow?: SettledFlow): Float32Array | null {
  if (!flow || flow.source !== 'canonical-settle.out' || flow.out.length !== W * H * 4 || flow.depth.length !== W * H) return null;
  const { out, depth } = flow;
  const velocity = new Float32Array(W * H * 2);
  const net = (i: number, k: number, j: number, reverse: number) => out[i * 4 + k] - (j < 0 ? 0 : out[j * 4 + reverse]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!(depth[i] > .001)) continue;
    const scale = .5 / depth[i];
    velocity[i*2] = (net(i, 3, x+1<W ? i+1 : -1, 1) - net(i, 1, x>0 ? i-1 : -1, 3)) * scale;
    velocity[i*2+1] = (net(i, 2, y+1<H ? i+W : -1, 0) - net(i, 0, y>0 ? i-W : -1, 2)) * scale;
    if (!Number.isFinite(velocity[i*2]) || !Number.isFinite(velocity[i*2+1])) return null;
  }
  return velocity;
}
export type FlowMap = MapView & { flow?: SettledFlow };
