import type { State, WaterObject } from './kernel.ts';

export type Piece={kind:'dam'}|{kind:'levee'}|{kind:'floodgate';maxHeight:1|2|3;height:number};
export interface Stroke {path:readonly (readonly [number,number])[];stack:readonly Piece[];baseZ?:number}
export interface Occupant {id:string;tiles:readonly number[];z:number;height:number;stackable:boolean}
export interface Snapshot {
 W:number;H:number;masks:Uint32Array;objects:readonly WaterObject[];
 water?:Pick<State,'depth'|'overflow'|'contamination'|'oldDepth'|'momentum'>;
 occupants?:readonly Occupant[];start?:readonly {tile:number;z:number}[];
 farmland?:readonly {tile:number;z:number}[];
}
export function waterFootprint(o:WaterObject,W:number,H:number):number[] {
 const kind=o[0],shape=kind>=3&&kind<=5?Array.from({length:kind-1},(_,y)=>[0,y]):kind===6?[[0,0],[0,1]]:kind===8?Array.from({length:9},(_,i)=>[Math.floor(i/3),i%3]):[9,10].includes(kind)?[[0,0],[0,1],[1,0],[1,1]]:kind===11?[[0,0],[0,1],[1,0],[1,1]]:[[0,0]];
 return shape.flatMap(([x,y])=>{if(o[5]&&[9,10].includes(kind))x=1-x;const [dx,dy]=o[4]===0?[x,y]:o[4]===1?[y,-x]:o[4]===2?[-x,-y]:[-y,x],xx=o[1]+dx,yy=o[2]+dy;return xx>=0&&yy>=0&&xx<W&&yy<H?[yy*W+xx]:[];});
}
export function compileWall(map:Snapshot,strokes:readonly Stroke[]) {
 const objects:WaterObject[]=map.objects.map(o=>[...o]),pieces:Array<{tile:number;x:number;y:number;z:number;piece:Piece}>=[];
 const stacks=new Map<number,string>(),counts={dam:0,levee:0,floodgate1:0,floodgate2:0,floodgate3:0};
 const height=(p:Piece)=>p.kind==='floodgate'?p.maxHeight+2:1;
 for(const s of strokes){
  if(!s.stack.length)throw Error('Explicit pieces are required');
  for(const [k,p] of s.stack.entries()){
   if(!['dam','levee','floodgate'].includes(p.kind))throw Error('Unknown wall piece');
   if(p.kind==='floodgate'&&(![1,2,3].includes(p.maxHeight)||!Number.isFinite(p.height)||p.height<0||p.height>p.maxHeight||k<s.stack.length-1))throw Error('Invalid or unsupported floodgate stack');
  }
  for(const tile of raster(s.path,map.W,map.H)){
   const x=tile%map.W,y=Math.floor(tile/map.W),ground=map.masks[tile]?32-Math.clz32(map.masks[tile]):0;
   let z=s.baseZ??ground;
   if(!Number.isInteger(z)||z<0||z>=34)throw Error('Invalid wall foundation');
   const supported=z===0||z<=23&&(map.masks[tile]&(1<<(z-1)))!==0||(map.occupants??[]).some(o=>o.stackable&&o.tiles.includes(tile)&&o.z+o.height===z);
   if(!supported)throw Error('Wall foundation is unsupported; no support is inferred');
   const key=JSON.stringify([z,s.stack]);if(stacks.has(tile)){if(stacks.get(tile)!==key)throw Error('Conflicting stacks');continue;}stacks.set(tile,key);
   for(const p of s.stack){
    const h=height(p);if(z+h>34)throw Error('Piece exceeds game height 34');
    for(let k=z;k<Math.min(23,z+h);k++)if(map.masks[tile]&(1<<k))throw Error('Wall intersects terrain');
    if((map.occupants??[]).some(o=>o.tiles.includes(tile)&&z<o.z+o.height&&o.z<z+h))throw Error('Wall intersects an existing object');
    // Require footprint records for existing water objects, including emitters.
    if(map.objects.some(o=>o[0]!==0&&waterFootprint(o,map.W,map.H).includes(tile)&&z<o[3]+(o[0]===13?5:1)&&o[3]<z+h))throw Error('Wall intersects a water object');
    pieces.push({tile,x,y,z,piece:{...p}});
    const kind=p.kind==='dam'?12:p.kind==='levee'?1:13;
    objects.push([kind,x,y,z,0,0,0,p.kind==='floodgate'?p.height:0]);
    if(p.kind==='floodgate')counts[`floodgate${p.maxHeight}` as 'floodgate1']++;else counts[p.kind]++;
    z+=h;
   }
  }
 }
 return {objects,pieces,tiles:[...stacks.keys()],counts};
}
export function remapWater(from:State,to:State,W:number,H:number):State {
 const N=W*H;
 for(let i=0;i<N;i++)for(let k=0;k<to.count[i];k++){
  const c=k*N+i;let mass=0,identical=-1;
  for(let s=0;s<from.count[i];s++){const old=s*N+i;if(to.floor[c]===from.floor[old]&&to.ceiling[c]===from.ceiling[old]){identical=old;break;}}
  if(identical>=0){to.depth[c]=from.depth[identical];to.overflow[c]=from.overflow[identical];to.contamination[c]=from.contamination[identical];to.oldDepth[c]=from.oldDepth[identical];continue;}
  for(let s=0;s<from.count[i];s++){
   const old=s*N+i,amount=Math.max(0,Math.min(to.ceiling[c],from.floor[old]+from.depth[old])-Math.max(to.floor[c],from.floor[old]));
   to.depth[c]+=amount;mass+=amount*from.contamination[old];
   if(to.floor[c]===from.floor[old]&&to.ceiling[c]===from.ceiling[old]){to.overflow[c]=from.overflow[old];to.oldDepth[c]=from.oldDepth[old];}
  }
  to.contamination[c]=to.depth[c]?mass/to.depth[c]:0;to.oldDepth[c]=to.depth[c];
 }
 // Preserve momentum only where both complete endpoint columns and the edge still exist.
 const identity=(c:number)=>{const i=c%N;for(let k=0;k<from.count[i];k++){const old=k*N+i;if(from.floor[old]===to.floor[c]&&from.ceiling[old]===to.ceiling[c])return old;}return -1;};
 const edges=(s:State)=>{
  const m=new Map<string,number>();
  if(s.start.length){for(let c=0;c<s.depth.length;c++)for(let e=s.start[c];e<s.start[c+1];e++)m.set(c+'/'+s.target[e]+'/'+s.direction[e],e);}
  else for(let c=0;c<N;c++){const x=c%W,y=Math.floor(c/W),t=[y>0?c-W:-1,x>0?c-1:-1,y<H-1?c+W:-1,x<W-1?c+1:-1];for(let d=0;d<4;d++)m.set(c+'/'+t[d]+'/'+d,c*4+d);}
  return m;
 };
 const oldEdges=edges(from),nextEdges=edges(to);
 for(const [key,e] of nextEdges){const [c,t,d]=key.split('/').map(Number),old=identity(c),target=t<0?t:identity(t);if(old<0||t>=0&&target<0)continue;const oe=oldEdges.get(old+'/'+target+'/'+d);if(oe!==undefined)to.momentum[e]=from.momentum[oe];}

 return to;
}

export function raster(path: Stroke['path'], W: number, H: number): number[] {
  if (!path.length) throw Error('A stroke needs at least one point');
  for (const [x, y] of path) if (!Number.isInteger(x) || !Number.isInteger(y) ||
    x < 0 || y < 0 || x >= W || y >= H) throw Error('Stroke point outside the tile grid');
  const tiles = new Set<number>();
  let [x, y] = path[0]; tiles.add(y * W + x);
  for (const [tx, ty] of path.slice(1)) {
    const dx = Math.abs(tx - x), dy = Math.abs(ty - y), sx = Math.sign(tx - x), sy = Math.sign(ty - y);
    let ix = 0, iy = 0;
    while (ix < dx || iy < dy) {
      if (ix < dx && (iy === dy || (2 * ix + 1) * dy <= (2 * iy + 1) * dx)) { x += sx; ix++; }
      else { y += sy; iy++; }
      tiles.add(y * W + x);
    }
  }
  return [...tiles];
}
