import type { Genome } from "./genome";
import type { Settings } from "../spec/mapspec";
import type { Hydro } from "./hydro";
import { stream } from "../math/rng";
import { hash32 } from "../math/hash";
import { fbm } from "../math/noise";
import { BED_FLOOR } from "./genome";

export function lakeAmount(s: Settings): number {
  return s.water.lakeAmount ?? ({ none: 0, few: 25, some: 50, many: 100 }[s.water.lakes]);
}

/** Keep signature water separate from the player's additional standing-water budget. */
export function lakeRange(g: Genome, s: Settings): void {
  g.lakeAmount = lakeAmount(s);
  const signature = g.theme === "lakeBasin";
  // Zero removes optional standing water; signature lakes and seas remain the theme's own.
  if (g.lakeAmount === 0 && (signature || g.sea)) return;
  if (g.lakeAmount === 0) {
    g.parts = g.parts.filter(p => p.kind !== "basin" || p.shape === "sea");
    g.troughs = 0;
    g.lakeSprings = 0;
    g.hydro.oxbow = false;
    g.hydro.chainLakes = 0;
    g.hydro.lakeBudget = 0.0005;
  }
}

/** Connected side basins on existing reaches: no extra sources, dams or independent systems.
 * Only excavate; keep the bed floor, existing lakes, sources, edge mouths and protected tiles.
 * A lower river bed within reach refuses a basin rather than draining it via that reach.
 */
export function connectedLakes(h: Uint8Array, W: number, H: number, g: Genome, seed: number, attempt: number, hy: Hydro, protect: Uint8Array | null): void {
  const amount = (g.lakeAmount ?? 0) / 100;
  if (amount <= 0) return;
  const rng = stream(seed, "setting-connected-lakes", attempt, g.variation);
  const noise = hash32(seed, "setting-lake-shores", attempt, g.variation);
  const count = Math.round(10 * amount * Math.sqrt(W * H / 16384));
  const sites: number[] = [];
  for (let i=0;i<h.length;i++) if (hy.water[i] === 1 && h[i] >= BED_FLOOR+1) sites.push(i);
  // Stable site order across amounts; more water adds later basins to the same first choices.
  for (let k=sites.length-1;k>0;k--) { const j=rng.int(0,k+1); [sites[k],sites[j]]=[sites[j],sites[k]]; }
  const occupied = new Uint8Array(h.length);
  let placed=0;
  for (const site of sites) {
    if (placed >= count) break;
    const sx=site%W, sy=Math.floor(site/W), bed=h[site];
    const radius=4 + 5*rng.float();
    const dx=rng.float()*2-1, dy=rng.float()*2-1;
    const norm=Math.max(0.01,Math.sqrt(dx*dx+dy*dy));
    const cx=sx+dx/norm*radius*0.55, cy=sy+dy/norm*radius*0.55;
    const R=Math.ceil(radius*1.6);
    if (cx-R<9 || cy-R<9 || cx+R>W-10 || cy+R>H-10) continue;
    const tiles:number[]=[];
    let refused=false, touches=false;
    for (let y=Math.floor(cy)-R;y<=Math.ceil(cy)+R;y++) for(let x=Math.floor(cx)-R;x<=Math.ceil(cx)+R;x++) {
      const i=y*W+x;
      const shore=radius*(1+0.3*fbm(noise+placed,x,y,6,2));
      const d=Math.sqrt((x-cx)*(x-cx)*0.8+(y-cy)*(y-cy)*1.25);
      if(d>shore) continue;
      if (protect?.[i] || occupied[i] || hy.water[i]===2 || h[i]<bed) { refused=true; break; }
      if (hy.water[i]===1) { if(h[i]===bed) touches=true; continue; }
      tiles.push(i);
    }
    if (refused || !touches || tiles.length<30) continue;
    // Every new tile has a closed shore at least at the outlet bed, or the feeding river.
    const inIt=new Set(tiles);
    for(const i of tiles) for(const j of [i-1,i+1,i-W,i+W]) if(!inIt.has(j) && h[j]<bed) refused=true;
    if(refused) continue;
    // Keep only the connected part touching the channel, so noise never leaves isolated pits.
    const roots=tiles.filter(i => [i-1,i+1,i-W,i+W].some(j=>hy.water[j]===1 && h[j]===bed));
    if(!roots.length) continue;
    const reached=new Set(roots), q=roots.slice();
    for(let k=0;k<q.length;k++) for(const j of [q[k]-1,q[k]+1,q[k]-W,q[k]+W]) if(inIt.has(j)&&!reached.has(j)){reached.add(j);q.push(j);}
    if(q.length<40) continue;
    const river=hy.rivers.find(r => {
      const pts=r.params.path;
      return pts.some(p => Math.abs(p[0]-sx)+Math.abs(p[1]-sy)<10);
    }) ?? hy.rivers[0];
    if(!river) continue;
    // Reserve the whole potential basin at every value, then grow its connected excavated part.
    // Increasing Amount still grows water after the finite supply of legal sites is exhausted.
    const grown=q.slice(0,Math.max(20,Math.round(q.length*(0.15+0.85*amount))));
    for(const i of grown){h[i]=Math.max(BED_FLOOR,bed-1-Math.floor(1.5*amount));hy.water[i]=2;}
    for(const i of q) for(let yy=-3;yy<=3;yy++) for(let xx=-3;xx<=3;xx++) occupied[i+yy*W+xx]=1;
    hy.lakes.push({tiles:grown.sort((a,b)=>a-b),outletBed:bed,river:river.id});
    placed++;
  }
}
