import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, DoubleSide } from 'three';
import { surfaceWater, type MapView } from '../../src/render3d/model';
import { surfaceFlow } from '../../src/render3d/high/flow';

/** Original, stationary open arrows. The product supplies every velocity; no simulation here. */
export function arrowGeometry(view: MapView, zoom = 1) {
  const { W, H } = view;
  const sw = surfaceWater(W, H, view.water);
  const velocity = surfaceFlow(W, H, sw);
  const positions: number[] = [];
  const selected: { x: number; y: number; gap: number }[] = [];
  let moving = 0;
  const candidates: { i: number; speed: number; rank: number }[] = [];
  for (let i = 0; i < W * H; i++) {
    const speed = Math.hypot(velocity[i * 2], velocity[i * 2 + 1]);
    if (speed <= .15 || sw.depth[i] < .04) continue;
    moving++;
    // Fixed spatial hash: stable selection across frames, both looks, and unchanged water.
    const rank = ((Math.imul(i + 1, 1597334677) ^ Math.imul(i + 19, 3812015801)) >>> 0);
    candidates.push({ i, speed, rank });
  }
  candidates.sort((a, b) => a.rank - b.rank);
  for (const { i, speed } of candidates) {
    const x = i % W + .5, y = Math.floor(i / W) + .5;
    const t = Math.min(1, speed / 7.5), gap = 6 - 3.2 * t;
    if (selected.some(a => Math.hypot(x - a.x, y - a.y) < Math.max(gap, a.gap))) continue;
    const dx = velocity[i * 2] / speed, dy = velocity[i * 2 + 1] / speed;
    const length = (.95 + 1.7 * t) * zoom, head = length * .32, half = length * .5;
    const tip = [x + dx * half, y + dy * half];
    const tail = [x - dx * half, y - dy * half];
    const left = [tip[0] - dx * head - dy * head * .58, tip[1] - dy * head + dx * head * .58];
    const right = [tip[0] - dx * head + dy * head * .58, tip[1] - dy * head - dx * head * .58];
    const pending: number[] = [];
    let valid = true;
    for (const [a, b] of [[tail, tip], [left, tip], [right, tip]]) {
      const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nx = -(b[1] - a[1]) / distance * .15 * zoom;
      const ny = (b[0] - a[0]) / distance * .15 * zoom;
      const steps = Math.ceil(distance / .2);
      const point = (t: number, side: number) => {
        const xx = a[0] + (b[0] - a[0]) * t + nx * side;
        const yy = a[1] + (b[1] - a[1]) * t + ny * side;
        const j = Math.floor(yy) * W + Math.floor(xx);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || sw.depth[j] < .04 || Math.abs(sw.surface[j] - sw.surface[i]) > .08) valid = false;
        return [xx, sw.surface[j] + .025, -yy];
      };
      for (let k = 0; k < steps; k++) {
        const a0 = point(k / steps, -1), a1 = point(k / steps, 1);
        const b0 = point((k + 1) / steps, -1), b1 = point((k + 1) / steps, 1);
        pending.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
      }
    }
    if (!valid) continue; // Whole footprint stays on one wet surface; no banks or falls.
    positions.push(...pending);
    selected.push({ x, y, gap });
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return { geometry, count: selected.length, moving, velocity };
}

export function makeArrows() {
  const material = new MeshBasicMaterial({ color: 0xc9d2ba, transparent: true, opacity: .66,
    depthWrite: false, depthTest: true, side: DoubleSide, toneMapped: false });
  const mesh = new Mesh(new BufferGeometry(), material);
  mesh.renderOrder = 20;
  mesh.visible = false;
  return mesh;
}
