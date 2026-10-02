// Pointer input is fixed, including event time and the host-minted naturalize seed.
// @ts-ignore generated revision-specific module
import {BrushPainter,DEFAULT_BRUSH,Selection,selectTool,anchorOf,rectOutline,rectRuns,clampMove,movePatch,FreehandPath,bandTiles,editorMath} from 'gesture-api';
let now=1000;
Object.defineProperty(performance,'now',{value:()=>now});
(globalThis as any).requestAnimationFrame=()=>1;(globalThis as any).cancelAnimationFrame=()=>{};
Math.random=()=>.25;
const event=(x:number,y:number,extra:any={})=>({button:0,buttons:1,clientX:x,clientY:y,pointerType:'mouse',pressure:.5,shiftKey:false,ctrlKey:false,metaKey:false,altKey:false,...extra});
const hit=(x:number,y:number)=>({x:Math.floor(x),y:Math.floor(y),point:[x,5,-y],kind:'terrain'});
function run(c:any){
 const W=c.size,H=W,N=W*H,heights=Uint8Array.from({length:N},(_,i)=>4+((i%W+Math.floor(i/W))%4));
 if(c.kind==='brush'){
  const shown=heights.slice(),state={pre:heights.slice(),protect:new Uint8Array(N),channel:new Uint8Array(N),base:null,locked:null,columns:new Int32Array(N),field:null,top:16};
  const settings={...DEFAULT_BRUSH,tool:c.tool,size:c.radius,strength:5,straight:c.straight,square:c.square,precise:false},records:any[]=[];
  const renderer={slice:null,heightAt:(x:number,y:number)=>shown[y*W+x],pickAtLevel:(x:number,y:number)=>({point:[x,5,-y]}),setBrushCursor:()=>{},updateTerrainRect:()=>{},refreshShadows:()=>{}};
  const painter=new BrushPainter({renderer,W,H,heights:()=>shown,terrain:()=>state,settings:()=>settings,commit:(stroke:any,pre:any,protect:any)=>records.push({stroke,pre,protect}),picked:()=>{},strength:()=>{},painting:()=>{},wet:()=>false,keep:()=>[],footprints:()=>[]} as any);
  now=1000;painter.tool.down(hit(8.25,9.75) as any,event(8.25,9.75) as any);
  for(const [x,y]of [[10.5,11.25],[13.75,12.5],[20.125,17.875],[22,19]]){now+=40;painter.tool.move(hit(x,y) as any,event(x,y) as any);}
  now+=40;painter.tool.up?.(hit(22,19) as any,event(22,19) as any);
  return {records,shown};
 }
 if(c.kind==='select'){
  const selection=new Selection(W,H),draw:any[]=[];
  const tool=selectTool(selection,{W,H,heights:()=>heights,mode:()=>c.mode,changed:()=>{},drawing:(tiles:any)=>{if(tiles)draw.push(tiles);}});
  tool.down(hit(8,8) as any,event(8,8,{shiftKey:c.modifier==='add',altKey:c.modifier==='subtract'}) as any);
  for(const [x,y]of [[20,8],[20,20],[8,20],[8,8]])tool.move(hit(x,y) as any,event(x,y) as any);tool.up?.(null,event(8,8) as any);
  return {tiles:selection.tiles(),size:selection.size(),draw};
 }
 if(c.kind==='freehand'){
  if(!FreehandPath)return {absentAtRevision:true};
  const path=new FreehandPath(W,H);path.down({x:8,y:8},0,0);const snapshots=[];
  snapshots.push(path.move({x:8.5,y:8.5},c.dx,c.dy,1010));
  for(let k=1;k<=10;k++)snapshots.push(path.move({x:8+k*1.125,y:8+k*.375},c.dx+k*.01,c.dy+k*.01,1010+k*50));
  const operation=path.up({x:20,y:12});return {snapshots,operation,band:operation&&'path'in operation?bandTiles(operation.path,3.25,W,H):[]};
 }
 if(c.kind==='features'){
  const feature={id:'fixed',kind:'forest',params:{area:[[8,8,12],[9,8,12],[10,10,14]],density:.5,speciesMix:{Pine:1}}};
  const tiles=[8*W+8,8*W+12,9*W+8,9*W+12,10*W+10,10*W+14];
  return {anchor:anchorOf({W,tilesOf:()=>tiles} as any,feature as any),outline:rectOutline({x0:8,y0:8,x1:12,y1:10}),runs:rectRuns({x0:8,y0:8,x1:12,y1:10},W),clamped:clampMove(feature as any,c.dx,c.dy,W,H),patch:movePatch(feature as any,c.dx,c.dy,W,H,heights)};
 }
 const path=[{x:1.25,y:2.5},{x:4.75,y:6.25},{x:9.125,y:8.875}],p={x:c.dx,y:c.dy,point:[c.dx,5,-c.dy]};
 const env={px:c.dx,py:c.dy,ground:{x:1.125,y:2.25},marker:{x:4,y:8},vx:2.875,vy:5.75,t:.375,e:{clientX:c.dx,clientY:c.dy,button:2},d:{x:0,y:0},low:Array.from({length:37},(_,i)=>i),hit:p,from:Object.assign([0,0],{x:0,y:0}),p,f:{x:0,y:0},b:path[1],a:path[0],intent:{path},down:{x:0,y:0},k:1,n:37};
 return editorMath.map((fn:any)=>{const length=fn(env);if(!Number.isFinite(length))throw Error('Incomplete Editor geometry fixture');return {length,ge1:length>=1,ge2:length>=2,ge4:length>=4,ge6:length>=6};});
}
const exact=(x:any):any=>{if(typeof x==='number'){const b=new DataView(new ArrayBuffer(8));b.setFloat64(0,x,true);return {f64:b.getBigUint64(0,true).toString(16).padStart(16,'0')};}if(ArrayBuffer.isView(x))return {type:x.constructor.name,bytes:Array.from(new Uint8Array(x.buffer,x.byteOffset,x.byteLength),v=>v.toString(16).padStart(2,'0')).join('')};if(Array.isArray(x))return x.map(exact);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,exact(v)]));return x;};
(globalThis as any).gesture=(c:any)=>JSON.stringify(exact(run(c)));
