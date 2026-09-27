import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType, Vector2, type ShaderMaterial } from 'three';
import { DT } from '../../src/core/sim/water';
import { surfaceWater, type MapView } from '../../src/render3d/model';

/** Smooth only through adjacent wet tiles on the same surface, not across a fall
 * or dry ground. Two small passes spread a front over several tiles. */
export function surfaceContamination(map: MapView): Float32Array {
  const { W, H } = map, sw=surfaceWater(W,H,map.water);
  let field=sw.contamination.slice();
  for(let pass=0;pass<2;pass++){
    const next=field.slice();
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=y*W+x;if(sw.depth[i]<=0.001)continue;
      let sum=0,weight=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H)continue;
        const j=yy*W+xx;if(sw.depth[j]<=0.001||Math.abs(sw.surface[j]-sw.surface[i])>0.35)continue;
        if(dx&&dy&&(sw.depth[y*W+xx]<=0.001||sw.depth[yy*W+x]<=0.001))continue;
        const w=(dx===0?2:1)*(dy===0?2:1);sum+=field[j]*w;weight+=w;
      }
      next[i]=sum/weight;
    }
    field=next;
  }
  // Extend colour into the dry texel border so bilinear sampling cannot introduce
  // a false clean-water rim along a badwater bank. No dry terrain is rendered with it.
  const extended=field.slice();
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=y*W+x;if(sw.depth[i]>0.001)continue;let sum=0,count=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H)continue;
      const j=yy*W+xx;if(sw.depth[j]>0.001){sum+=field[j];count++;}
    }
    if(count)extended[i]=sum/count;
  }
  return extended;
}

/** Centre velocity from the simulator's four outgoing face volumes per substep.
 * Coordinates match map tiles: +x east, +y north. Only visual motion consumes this. */
export function surfaceVelocity(W: number, H: number, depth: ArrayLike<number>, out: ArrayLike<number>): Float32Array {
  const velocity = new Float32Array(W * H * 2);
  const net = (i: number, k: number, j: number, opposite: number) => out[i * 4 + k] - (j >= 0 ? out[j * 4 + opposite] : 0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (depth[i] <= 0.001) continue;
    const scale = 0.5 / (DT * Math.max(0.15, depth[i]));
    velocity[i * 2] = (net(i, 3, x + 1 < W ? i + 1 : -1, 1) - net(i, 1, x > 0 ? i - 1 : -1, 3)) * scale;
    velocity[i * 2 + 1] = (net(i, 2, y + 1 < H ? i + W : -1, 0) - net(i, 0, y > 0 ? i - W : -1, 2)) * scale;
  }
  return velocity;
}

/** One small linearly filtered flow texture; no changes to the shared water mesh or shadows. */
export class WaterFlow {
  private texture?: DataTexture;
  constructor(private material: ShaderMaterial) { this.set(1, 1, new Float32Array(2)); }
  set(W: number, H: number, velocity: Float32Array, contamination?: Float32Array) {
    const data = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      // Compress magnitude for a readable visual speed while preserving direction.
      // The limit is 2 tiles/s; 128 is exact still water.
      const x=velocity[i*2], y=velocity[i*2+1], speed=Math.hypot(x,y);
      const scale=speed>0 ? 2*(1-Math.exp(-speed*0.3))/speed : 0;
      data[i * 4] = Math.round(128+x*scale*63.5);
      data[i * 4 + 1] = Math.round(128+y*scale*63.5);
      data[i * 4 + 2] = Math.round(Math.max(0,Math.min(1,contamination?.[i]??0))*255);
      data[i * 4 + 3] = 255;
    }
    const next = new DataTexture(data, W, H, RGBAFormat, UnsignedByteType);
    next.minFilter = next.magFilter = LinearFilter;
    next.needsUpdate = true;
    this.material.uniforms.mlFlow.value = next;
    this.material.uniforms.mlFlowSize.value = new Vector2(W, H);
    this.texture?.dispose(); this.texture = next;
  }
  dispose() { this.texture?.dispose(); }
}
