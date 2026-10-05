import type { State, WaterObject } from './kernel.ts';
/** A graph spill label identifies columns, never creates water or estimates capacity. */
export function spillLabels(W:number,H:number,state:State,objects:readonly WaterObject[]):Float64Array {
 const N=W*H,M=state.depth.length,reverse:Array<Array<[number,number]>>=Array.from({length:M},()=>[]);
 const limits=new Map<number,number>(), sourceTiles=new Set<number>();
 const tile=(o:WaterObject,x=0,y=0)=>{if(o[5]&&[9,10].includes(o[0]))x=1-x;const [dx,dy]=o[4]===0?[x,y]:o[4]===1?[y,-x]:o[4]===2?[-x,-y]:[-y,x];const xx=o[1]+dx,yy=o[2]+dy;return xx>=0&&yy>=0&&xx<W&&yy<H?yy*W+xx:-1;};
 for(const o of objects){
  const i=tile(o);if(i>=0){if(o[0]===2||o[0]===12)limits.set(o[3]*N+i,.65);if(o[0]===13&&o[7]%1)limits.set((o[3]+Math.floor(o[7]))*N+i,o[7]%1);}
  const shape=o[0]===7?[[0,0]]:o[0]===8?Array.from({length:9},(_,i)=>[Math.floor(i/3),i%3]):[9,10].includes(o[0])?[[0,0],[0,1],[1,0],[1,1]]:o[0]===11?[[1,1]]:o[0]===6?[[0,1]]:[];
  for(const [x,y] of shape){const t=tile(o,x,y);if(t>=0)sourceTiles.add(t);}
 }
 const labels=new Float64Array(M).fill(Infinity),heap:Array<[number,number]>=[];
 const push=(c:number,v:number)=>{if(v>=labels[c])return;labels[c]=v;heap.push([c,v]);let k=heap.length-1;while(k>0){const p=(k-1)>>1;if(heap[p][1]<=v)break;heap[k]=heap[p];k=p;}heap[k]=[c,v];};
 const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let k=0;while(k*2+1<heap.length){let c=k*2+1;if(c+1<heap.length&&heap[c+1][1]<heap[c][1])c++;if(heap[c][1]>=last[1])break;heap[k]=heap[c];k=c;}heap[k]=last;}return first;};
 const edge=(c:number,t:number)=>{
  if(t<0){push(c,state.floor[c]);return;}
  let crest=Math.max(state.floor[c],state.floor[t]);
  for(let z=crest;z<Math.min(state.ceiling[c],state.ceiling[t]);z++){const l=limits.get(z*N+t%N);if(l!==undefined)crest=Math.max(crest,z+l);}
  reverse[t].push([c,crest]);
 };
 if(state.start.length){
  for(let c=0;c<M;c++)for(let e=state.start[c];e<state.start[c+1];e++){
   const t=state.target[e],dir=state.direction[e];
   const limiter=(id:number)=>{for(const o of objects)if(o[0]===6&&tile(o,0,1)===id%N&&o[3]===state.floor[id])return [2,3,0,1][o[4]];return undefined;};
   const own=limiter(c),other=t<0?undefined:limiter(t);
   if((other===undefined||other===dir)&&(own===undefined||own===dir||own===(dir+2)%4))edge(c,t);
  }
 } else {
  for(let i=0;i<N;i++){
   const x=i%W,y=Math.floor(i/W),targets=[y>0?i-W:-1,x>0?i-1:-1,y<H-1?i+W:-1,x<W-1?i+1:-1];
   for(const t of targets)if(t>=0||!sourceTiles.has(i))edge(i,t);
  }
 }
 while(heap.length){const [c,v]=pop();if(labels[c]!==v)continue;for(const [from,crest] of reverse[c])push(from,Math.max(v,crest));}
 return labels;
}
