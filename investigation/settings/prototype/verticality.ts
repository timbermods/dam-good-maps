import { BED_FLOOR, type Genome } from "./genome";
import { EDITOR_LEVEL, VT_TALL, VT_DEFAULT, THEME_PRESETS, type Settings, type MapSpec } from "../spec/mapspec";

/** Draw the same geological recipe while the control spreads its levels. */
export function verticalityDraw(spec: MapSpec): number { return spec.theme==='any'?60:VT_DEFAULT[spec.theme]; }
const geometry = new WeakMap<Genome, {base:number;relief:number}>();
const caps = new WeakMap<Genome, number>();
/** Shape salts use the original geological budget; the land's height budget is applied separately. */
export function verticalityShape(g: Genome): Genome { return {...g,...geometry.get(g)}; }
export function verticalityIslandBudget<T>(g: Genome, shape:()=>T): T {
  const target=g.top;
  // Preserve the adopted shaper's one small landmark while spreading the island's broad relief.
  g.top=Math.min(caps.get(g)??target,Math.max(14,target));
  try {return shape();} finally {g.top=target;}
}

/** Islands already has its coast: only spread its existing dry contours above that coast. */
export function verticalityIslands(h: Uint8Array, g: Genome, W: number, H: number): void {
  const sorted=h.slice().sort();
  const high=sorted[Math.floor(.95*(h.length-1))];
  const target=Math.floor(g.top);
  for(let y=5;y<H-5;y++) for(let x=5;x<W-5;x++) {const i=y*W+x;if(h[i]>5&&!(h[i]>=14&&target<14)) h[i]=Math.min(target,5+Math.round((h[i]-5)*Math.max(1,target-5)/Math.max(1,high-5)));}
}

/** Delta owns its plain and channel beds. Spread only its existing higher catchment. */
export function verticalityDelta(h: Uint8Array, g: Genome, water: Uint8Array): void {
  const sorted=h.slice().sort(), high=sorted[Math.floor(.95*(h.length-1))];
  // The adopted plain's upper feeder is at 7; its catchment must retain the 8+ ground that
  // reserves poisonous hollows away from the plain. Compressing that away costs redraws.
  const target=Math.min(Math.floor(g.top),Math.round(10+0.12*g.vt));
  for(let i=0;i<h.length;i++) if(!water[i]&&h[i]>8) h[i]=Math.min(target,Math.max(9,8+Math.round((h[i]-8)*Math.max(1,target-8)/Math.max(1,high-8))));
}

/** Anchor the lower contour while spreading existing ranked contours through the height budget. */
export function verticalityContourField(h:Uint8Array,g:Genome):Uint8Array {
  if(g.theme!=='highlands'&&g.theme!=='any')return h;
  const sorted=h.slice().sort(),lo=sorted[Math.floor(.05*(h.length-1))],hi=sorted[Math.floor(.95*(h.length-1))];
  const top=Math.floor(g.top);
  for(let i=0;i<h.length;i++)h[i]=Math.min(top,Math.max(BED_FLOOR+1,BED_FLOOR+1+Math.round((h[i]-lo)*(top-BED_FLOOR-1)/Math.max(1,hi-lo))));
  return h;
}

/** Apply after the base raise. The control owns the available span, not a pre-floor top. */
export function verticalityRange(g: Genome, s: Settings): void {
  geometry.set(g,{base:g.base,relief:g.relief});
  const v = s.terrain.verticality / 100;
  const ceiling = Math.min(s.terrain.highestTerrain, s.terrain.verticality >= VT_TALL ? 22 : EDITOR_LEVEL);
  caps.set(g,ceiling);
  g.vt = s.terrain.verticality;
  g.tall = ceiling > EDITOR_LEVEL;
  const low = BED_FLOOR + 1;
  const levels={tight:0,normal:1,generous:2};
  const bl=levels[s.terrain.buildableLand]-levels[THEME_PRESETS[g.theme].buildableLand];
  g.base = low;
  const reliefScale = (50 + s.terrain.relief) / (50 + THEME_PRESETS[g.theme].relief);
  // The control quiets a theme without removing the minimum relief its promise depends on.
  const gentleTop = g.theme==='canyon'?9:g.theme==='highlands'?12:g.theme==='lakeBasin'?10:7;
  g.top = Math.min(ceiling, low + (gentleTop-low+(22-gentleTop)*v)*reliefScale);
  if(g.theme==='delta')g.top=Math.min(ceiling,Math.max(g.top,10+12*v));
  // Retain the quieter setting's original lower ceiling; the Verticality budget must
  // not erase Buildable land's height contribution when replacing the old top.
  if(bl>0)g.top=Math.max(low+4,g.top-1.5*bl);
  g.relief = g.top - g.base;
  g.hyps.eq = Math.max(g.hyps.eq, 0.8 * v);
  if(g.theme==='canyon')g.hyps.eq=1;
  if(g.theme==='highlands')g.hyps.eq=Math.max(g.hyps.eq,.9);
  g.terrace.step = 1 + Math.round(2 * v);
  if(g.theme==='highlands')g.terrace.step=Math.max(3,g.terrace.step);
  g.terrace.share *= 0.1 + 0.9 * v;
  // Preserve Buildable land's contribution instead of shrinking it with Verticality's benches.
  if(bl)g.terrace.share=Math.min(1,Math.max(0,g.terrace.share+(bl>0?.2:.1)*bl*(.9-.9*v)));
  if(g.theme==='highlands')g.terrace.share=Math.max(.7,g.terrace.share);
  // A lower explicit height cap limits the valley's depth as well as the peaks.
  const cutV=Math.min(v,(ceiling-low)/(22-low));
  g.hydro.incise = g.hydro.incise * (0.25 + 0.75 * cutV) + 6 * cutV * cutV;
  if(g.theme==='canyon')g.hydro.incise=Math.max(4,g.hydro.incise);
  if(g.theme==='highlands')g.hydro.incise=6;
  if(g.theme==='lakeBasin'){g.hydro.incise=Math.min(1,g.hydro.incise);g.hydro.floor=0;}
  g.hanging *= cutV;
  g.knick *= cutV;
  g.ramps = Math.max(g.ramps, Math.min(1,Math.max(.1,1 - 0.25 * cutV+.2*bl)));
}
