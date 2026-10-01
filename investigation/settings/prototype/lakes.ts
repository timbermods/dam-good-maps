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

/** A floor-running Delta needs excavation room; reserve one level without moving its layout. */
export function lakeSubstrate(h:Uint8Array,g:Genome):void {
  if(g.theme!=='delta')return;
  const top=Math.floor(g.top);
  for(let i=0;i<h.length;i++)h[i]=Math.min(top,h[i]+1);
}

export function protectedLand(protect: Uint8Array|null, locked?: Uint8Array): Uint8Array|null {
  return locked ? Uint8Array.from(locked,(v,i)=>v||protect?.[i]?1:0) : protect;
}

/** Reserve the places already prepared for play while the standing-water control expands. */
export function lakeKeep(W:number,H:number,masks:readonly (ArrayLike<number>|null|undefined)[],starts:readonly {x:number;y:number}[]):Uint8Array {
  const out=new Uint8Array(W*H);
  for(let i=0;i<out.length;i++)if(masks.some(m=>m?.[i]))out[i]=1;
  for(const p of starts)for(let y=Math.max(0,p.y-9);y<=Math.min(H-1,p.y+9);y++)for(let x=Math.max(0,p.x-9);x<=Math.min(W-1,p.x+9);x++)out[y*W+x]=1;
  return out;
}

/** Keep signature water separate from the player's additional standing-water budget. */
export function lakeRange(g: Genome, s: Settings, W=128, H=128): void {
  g.lakeAmount = lakeAmount(s);
  const signature = g.theme === "lakeBasin";
  // Zero removes optional standing water; signature lakes and seas remain the theme's own.
  // The small Canyon needs its native mid-reach water to prepare viable start banks.
  // Its optional side basins still grow later; do not replace that substrate at 96².
  if (signature || g.sea || (g.theme==='canyon'&&W*H<16384)) return;
  // The absolute bed floor leaves no excavation depth on a floor-running gorge.
  // Reserve a raised channel substrate, with the three-level cliff separation retained.
  if(g.theme==='canyon'){
    g.base=Math.max(g.base,BED_FLOOR+4);g.relief=g.top-g.base;g.hydro.incise=3;g.hanging=0;
    g.hydro.floor=Math.max(3*Math.min(1,W*H/16384),g.hydro.floor);g.ramps=Math.max(.9,g.ramps);
  }
  {
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
  const count = Math.round((g.sea ? 6 : 24) * amount * Math.sqrt(W * H / 16384));
  const lakeLevel = new Int16Array(h.length).fill(-1);
  const lakeRiver=new Array<string>(h.length);
  for(const lake of hy.lakes) for(const i of lake.tiles){lakeLevel[i]=lake.outletBed;lakeRiver[i]=lake.river;}
  const fed=(i:number)=>hy.water[i]===1||hy.water[i]===2;
  const sites: number[] = [];
  for (let y=10;y<H-10;y++) for(let x=10;x<W-10;x++) {
    const i=y*W+x, level=hy.water[i]===2?lakeLevel[i]:h[i];
    if(fed(i) && level>=BED_FLOOR+1 && [i-1,i+1,i-W,i+W].some(j=>!fed(j)&&h[j]>=level)) sites.push(i);
  }
  // Stable site order across amounts; more water adds later basins to the same first choices.
  for (let k=sites.length-1;k>0;k--) { const j=rng.int(0,k+1); [sites[k],sites[j]]=[sites[j],sites[k]]; }
  // Lower feeders keep added water from displacing the theme's high ground reading.
  if(g.theme==='highlands')sites.sort((a,b)=>(hy.water[a]===2?lakeLevel[a]:h[a])-(hy.water[b]===2?lakeLevel[b]:h[b]));
  const occupied = new Uint8Array(h.length);
  let placed=0;
  for (const site of sites) {
    if (placed >= count) break;
    if(occupied[site])continue;
    const sx=site%W, sy=Math.floor(site/W), bed=hy.water[site]===2?lakeLevel[site]:h[site];
    const radius=4 + (g.sea ? 3 : 5)*rng.float();
    const dx=rng.float()*2-1, dy=rng.float()*2-1;
    const norm=Math.max(0.01,Math.sqrt(dx*dx+dy*dy));
    const cx=sx+dx/norm*radius*0.55, cy=sy+dy/norm*radius*0.55;
    const R=Math.ceil(radius*1.6);
    if (cx-R<2 || cy-R<2 || cx+R>W-3 || cy+R>H-3) continue;
    const tiles:number[]=[];
    let refused=false, touches=false;
    for (let y=Math.floor(cy)-R;y<=Math.ceil(cy)+R;y++) for(let x=Math.floor(cx)-R;x<=Math.ceil(cx)+R;x++) {
      const i=y*W+x;
      if(x<5||y<5||x>=W-5||y>=H-5)continue;
      const shore=radius*(1+0.3*fbm(noise+placed,x,y,6,2));
      const d=Math.sqrt((x-cx)*(x-cx)*0.8+(y-cy)*(y-cy)*1.25);
      if(d>shore) continue;
      if (protect?.[i] || occupied[i]) continue;
      if (fed(i)) { if((hy.water[i]===2?lakeLevel[i]:h[i])===bed) touches=true; continue; }
      if(h[i]<bed||h[i]>bed+(g.sea?2:4)) continue;
      // Clip at a lower spill rather than discarding an entire bank because it crosses a bend.
      if([i-1,i+1,i-W,i+W].some(j=>fed(j)?(hy.water[j]===2?lakeLevel[j]:h[j])!==bed:h[j]<bed))continue;
      tiles.push(i);
    }
    if (refused || !touches || tiles.length<30) continue;
    // Every new tile has a closed shore at least at the outlet bed, or the feeding river.
    const inIt=new Set(tiles);
    for(const i of tiles) for(const j of [i-1,i+1,i-W,i+W]) if(!inIt.has(j) && (fed(j)?(hy.water[j]===2?lakeLevel[j]:h[j])!==bed:h[j]<bed)) refused=true;
    if(refused) continue;
    // Keep only the connected part touching the channel, so noise never leaves isolated pits.
    const roots=tiles.filter(i => [i-1,i+1,i-W,i+W].some(j=>fed(j) && (hy.water[j]===2?lakeLevel[j]:h[j])===bed));
    if(!roots.length) continue;
    roots.sort((a,b)=>Math.hypot(a%W-cx,Math.floor(a/W)-cy)-Math.hypot(b%W-cx,Math.floor(b/W)-cy)||a-b);
    // A broad connection fills without the one-tile neck's persistent sloshing.
    const join=roots.filter(i=>Math.abs(i%W-roots[0]%W)+Math.abs(Math.floor(i/W)-Math.floor(roots[0]/W))<=4);
    const reached=new Set(join), q=[...join];
    for(let k=0;k<q.length;k++) for(const j of [q[k]-1,q[k]+1,q[k]-W,q[k]+W]) if(inIt.has(j)&&!reached.has(j)){reached.add(j);q.push(j);}
    if(q.length<40) continue;
    const river=hy.water[site]===2?hy.rivers.find(r=>r.id===lakeRiver[site]):hy.rivers.find(r => {
      const pts=r.params.path;
      return pts.some(p => Math.abs(p[0]-sx)+Math.abs(p[1]-sy)<10);
    });
    if(!river) continue;
    // Reserve the whole potential basin at every value, then grow its connected excavated part.
    // Increasing Amount still grows water after the finite supply of legal sites is exhausted.
    const grown=q.slice(0,Math.max(20,Math.round(q.length*(0.1+0.9*amount))));
    for(const i of grown){h[i]=Math.max(BED_FLOOR,bed-1);hy.water[i]=2;lakeLevel[i]=bed;}
    for(const i of q) for(let yy=-3;yy<=3;yy++) for(let xx=-3;xx<=3;xx++) occupied[i+yy*W+xx]=1;
    hy.lakes.push({tiles:grown.sort((a,b)=>a-b),outletBed:bed,river:river.id});
    placed++;
  }
}
