import type { Snapshot, Stroke } from './wall.ts';
/** Original scene: four-tile channel, terrain banks, a source, and the player's wall. */
export function channel(feed=true,head=0):Snapshot {
 const W=16,N=W*W,masks=new Uint32Array(N).fill(127);
 for(let y=2;y<W;y++)for(let x=6;x<=9;x++)masks[y*W+x]=1;
 const depth=new Float64Array(N);for(let y=2;y<9;y++)for(let x=6;x<=9;x++)depth[y*W+x]=head;
 return {W,H:W,masks,objects:feed?[[7,7,3,1,0,0,0,.1]]:[],
  water:{depth,overflow:new Float64Array(N),contamination:new Float64Array(N),oldDepth:depth.slice(),momentum:new Float64Array(4*N)},
  start:[{tile:7*W+7,z:1}],farmland:[{tile:7*W+8,z:1}]};
}
export const scenes:Array<{id:string;stroke:Stroke;crest:number}>=[
 {id:'dam',stroke:{path:[[6,9],[9,9]],stack:[{kind:'dam'}]},crest:1.65},
 {id:'levee',stroke:{path:[[6,9],[9,9]],stack:[{kind:'levee'}]},crest:2},
 {id:'gate-1.5',stroke:{path:[[6,9],[9,9]],stack:[{kind:'floodgate',maxHeight:2,height:1.5}]},crest:2.5},
 {id:'stacked-dams',stroke:{path:[[6,9],[9,9]],stack:[{kind:'dam'},{kind:'dam'}]},crest:1.65},
 {id:'levee-dam',stroke:{path:[[6,9],[9,9]],stack:[{kind:'levee'},{kind:'dam'}]},crest:2.65}
];
export const drought={ticks:90*768,provenance:'Explicit source-off hydrological observation; no consumption',strengths:[0],contamination:[0]};
