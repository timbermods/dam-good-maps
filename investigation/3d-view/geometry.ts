import {Terrain} from './local/dev/investigation/erode/core/terrain';
import {CHUNK,meshChunk,lightVolume,LIGHT_LEVELS} from './local/dev/investigation/erode/core/mesher';
export {Terrain,CHUNK,LIGHT_LEVELS};
export function clipped(t:Terrain,level:number){return new Terrain(t.W,t.H,Uint32Array.from(t.cols,v=>v&(2**Math.min(23,level)-1)));}
export function meshes(t:Terrain,level=23,keys?:number[]){
 const cut=level<23?clipped(t,level):t,cols=Math.ceil(t.W/CHUNK),rows=Math.ceil(t.H/CHUNK);
 return (keys??Array.from({length:cols*rows},(_,i)=>i)).map(key=>{
  const cx=key%cols,cy=Math.floor(key/cols),m=meshChunk(cut,cx,cy),cap=new Uint8Array(m.positions.length/3);
  // Greedy top quads can span both natural tops and cut rock: the shader consults original occupancy.
  for(let i=0;i<cap.length;i++)cap[i]=+(m.normals[i*3+1]>0&&m.positions[i*3+1]===level&&level<23);
  return {key,...m,cap};
 });
}
export function dirtyChunks(t:Terrain,old:Uint32Array){const set=new Set<number>(),cols=Math.ceil(t.W/CHUNK);for(let i=0;i<t.N;i++)if(t.cols[i]!==old[i]){const x=i%t.W,y=Math.floor(i/t.W);for(const [dx,dy]of [[0,0],[-1,0],[1,0],[0,-1],[0,1]]){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<t.W&&yy<t.H)set.add(Math.floor(yy/CHUNK)*cols+Math.floor(xx/CHUNK));}}return [...set];}
export function fields(t:Terrain,moist:number[],previous?:Uint8Array,box?:{x0:number;y0:number;x1:number;y1:number}){
 const light=lightVolume(t,previous,box),soil=new Uint8Array(t.N*LIGHT_LEVELS*4);
 for(let i=0;i<t.N;i++)for(let z=0;z<LIGHT_LEVELS;z++){
  let top=z;while(top<23&&t.at(i,top))top++;if(!t.at(i,z)){top=z;while(top>0&&!t.at(i,top-1))top--;}
  const o=(z*t.N+i)*4;soil[o]=top;soil[o+1]=(moist.length>t.N?moist[z*t.N+i]:moist[i])?240:0;soil[o+2]=255;soil[o+3]=t.at(i,z)?255:0;
 }
 return {light,soil};
}
