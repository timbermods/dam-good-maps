// Deposit lobes are sediment bodies; short gestures remain visible (D342/D356).
import {describe,expect,test} from "vitest";
import {DepositRun,DEPOSIT_DEFAULTS} from "../../src/core/forces/deposit";
import {fixture} from "./forceFixtures";
// (D148: every fan here kept its material until the force audit's finding 4 (2026-11-11) made Deposit a fan fed from a
// gully, the water bringing the rest; the check that stands in its place: nothing stands above the apex, a level
// datum `apex` over the ground where the fan is placed, at most 6)
function fan(before:Uint8Array,h:Uint8Array,W:number,at?:{x:number;y:number}){
 const raised=new Set<number>();
 const neighbours=(i:number)=>[i%W>0?i-1:-1,i%W+1<W?i+1:-1,i-W,i+W].filter(j=>j>=0&&j<h.length);
 for(let i=0;i<h.length;i++)if(h[i]>before[i]){raised.add(i);expect(neighbours(i).some(j=>h[i]-h[j]<3)).toBe(true);}
 expect(raised.size).toBeGreaterThanOrEqual(4);
 for(const i of raised){const x=i%W,y=(i/W)|0;
  const squares=[[-1,-1],[-1,0],[0,-1],[0,0]].filter(([dx,dy])=>x+dx>=0&&y+dy>=0&&x+dx+1<W&&(y+dy+1)*W<h.length)
   .map(([dx,dy])=>(y+dy)*W+x+dx);
  expect(squares.some(j=>[j,j+1,j+W,j+W+1].every(k=>raised.has(k)))).toBe(true);
 }
 if(at){const apex=before[Math.round(at.y)*W+Math.round(at.x)]+6;for(const i of raised)expect(h[i]).toBeLessThanOrEqual(apex);}
}
describe("Deposit fan shaping",()=>{
 test("a split cone keeps separate bodies either side of the barrier, and its extent, without bridging it",()=>{
  const m=fixture("plain",64);m.entities=[];
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)m.heights[y*64+x]=x<28?12:y>=31&&y<=33?14:7;
  const r=new DepositRun(m,{...DEPOSIT_DEFAULTS,power:100,seed:2},{path:[{x:30,y:30},{x:53,y:30}]}).finishAll();
  // (a drag's fan is its Size wide, Auto at Power 100 is 48, Kyler #341; it was 0.95 times the line, 1685)
  // (D148: 2461 when it was conserved; the force audit's finding 4 made it a cone from its apex, fed from a gully)
  fan(m.heights,r.map.heights,64,{x:30,y:30});expect(r.plan0.stats.deposited).toBe(1028);expect(r.plan0.reach).toBe(23);expect(r.plan0.width).toBe(48);
  const raised=Array.from(r.map.heights).flatMap((h,i)=>h>m.heights[i]?[i]:[]),xs=raised.map(i=>i%64),ys=raised.map(i=>(i/64)|0);
  // (D148: 24 tiles along the drag, the reach and one, while it was conserved; since the force audit's finding 5 the
  // cone's toe falls 0.8 to 1 times its reach and set-back from its apex, set back from where it is placed (deposit.rs),
  // the thinning edge left as it was: it runs from the scarp's foot to at least that toe)
  const setBack=Math.min(5,Math.max(1.5,r.plan0.reach*0.15));
  expect(Math.min(...xs)).toBeLessThanOrEqual(30);
  expect(Math.max(...xs)).toBeGreaterThanOrEqual(30+Math.floor(0.8*(r.plan0.reach+setBack)-setBack));
  expect(Math.max(...ys)-Math.min(...ys)+1).toBeGreaterThanOrEqual(29);
  expect(ys.some(y=>y<31)).toBe(true);expect(ys.some(y=>y>33)).toBe(true);
  expect(raised.some(i=>i%64>=36&&(i/64|0)>=31&&(i/64|0)<=33)).toBe(false);
 });
 // (D148: a narrow bank once paid for a whole fan, conserved; since the force audit's finding 4 the water brings what
 // its gully does not give, and what it cuts is that bank, never the low ground the fan lies on)
 test("a narrow bank behind a fan is all it cuts, and the fan still covers connected ground",()=>{
  for(const seed of [0,1,2,7,41])for(const power of [0,35,70,100]){
   const m=fixture("plain",64);m.entities=[];m.heights.fill(1);
   // Only a narrow upstream bank pays for a broad fan.
   for(let y=27;y<=33;y++)for(let x=20;x<=26;x++)m.heights[y*64+x]=5;
   const r=new DepositRun(m,{...DEPOSIT_DEFAULTS,power,seed,size:40},{path:[{x:30,y:30},{x:53,y:30}]}).finishAll();
   fan(m.heights,r.map.heights,64,{x:30,y:30});
   expect(r.map.heights.every((h,i)=>h>=m.heights[i]||(i%64>=20&&i%64<=26&&(i/64|0)>=27&&(i/64|0)<=33))).toBe(true);
  }
 });
 test("a gully's cut cannot leave a raised tile standing over all neighbours",()=>{
  for(const seed of [0,1,2,7]){
   const m=fixture("slide",64);m.entities=[];
   const r=new DepositRun(m,{...DEPOSIT_DEFAULTS,power:100,seed},{path:[{x:22,y:30},{x:46,y:30}]}).finishAll();
   fan(m.heights,r.map.heights,64,{x:22,y:30});
  }
 });
 test("short draws and clicks make visible connected fans at every sampled Power and seed",()=>{
  for(const seed of [0,1,2,7,41,0xffffffff])for(const power of [0,35,70,100])for(const path of [[{x:30,y:30}],[{x:30,y:30},{x:35,y:30}]]){
   const m=fixture("plain",64),before=m.heights.slice();
   const r=new DepositRun(m,{...DEPOSIT_DEFAULTS,power,seed},{path}).finishAll();
   fan(before,r.map.heights,64,path[0]);expect(r.plan0.stats.changed).toBeGreaterThanOrEqual(9);expect(m.heights).toEqual(before);
   // (level ground gives nothing: the water brought the fan)
   expect(r.map.heights.every((h,i)=>h>=before[i])).toBe(true);
  }
 });
 // The force audit's findings 4, 5 and 28 (2026-11-11): the default click is an alluvial fan below its gully. On a
 // mountain front (the ground rising a level a tile behind x 28, level ahead) a cone segment from its apex: 3 to 5
 // levels thick there, nothing above it, thinning outward to a toe a level thick, its contours arcs in benches of
 // uneven width rather than even stairs; a gully notched back into the front behind it, narrow, never ahead of it. On
 // level ground it takes nothing; a stream it reaches keeps its bed; Try another turns it.
 test("the default click is an alluvial fan below its gully",()=>{
  const front=()=>{const m=fixture("plain",64);m.entities=[];for(let y=0;y<64;y++)for(let x=0;x<64;x++)m.heights[y*64+x]=x<28?Math.min(20,7+28-x):7;return m;};
  for(const seed of [1,2,3,7]){
   const m=front(),at={x:31,y:32},r=new DepositRun(m,{...DEPOSIT_DEFAULTS,seed},{path:[at]}).finishAll(),h=r.map.heights,b=m.heights;
   fan(b,h,64,at);
   const dz=(i:number)=>h[i]-b[i],{x:dx,y:dy}=r.plan0.direction;
   const rel=(i:number)=>{const x=i%64-at.x,y=(i/64|0)-at.y;return {along:x*dx+y*dy,cross:-x*dy+y*dx,d:Math.hypot(x,y)};};
   const raised=Array.from(h.keys()).filter(i=>dz(i)>0),cut=Array.from(h.keys()).filter(i=>dz(i)<0);
   // (it runs away from the front, and is 3 to 5 levels thick at its thickest, near its apex)
   expect(dx,`seed ${seed}`).toBeGreaterThan(0.5);
   const top=Math.max(...raised.map(dz));expect(top).toBeGreaterThanOrEqual(3);expect(top).toBeLessThanOrEqual(5);
   expect(Math.min(...raised.filter(i=>dz(i)===top).map(i=>rel(i).d))).toBeLessThan(8);
   // (thinning outward beside the trench its gully's water runs down: its mean thickness falls ring by ring, its outer
   // ring a level or less; its edge feathered)
   const ring=(a:number,z:number)=>{const t=raised.filter(i=>rel(i).d>=a&&rel(i).d<z&&Math.abs(rel(i).cross)>=3).map(dz);return t.reduce((s,v)=>s+v,0)/Math.max(1,t.length);};
   expect(ring(0,6)).toBeGreaterThan(ring(6,12));expect(ring(6,12)).toBeGreaterThan(ring(12,19));expect(ring(14,19)).toBeLessThanOrEqual(1.5);
   const edge=raised.filter(i=>[i-1,i+1,i-64,i+64].some(j=>j>=0&&j<4096&&dz(j)<=0));
   expect(edge.filter(i=>dz(i)<=2).length/edge.length).toBeGreaterThan(0.85);
   // (benches of uneven width down its flanks, never a stair of even steps)
   const runs:number[]=[];
   for(const a of [-0.5,-0.3,0.3,0.5]){const [ux,uy]=[dx*Math.cos(a)-dy*Math.sin(a),dx*Math.sin(a)+dy*Math.cos(a)];let last=-1,len=0;
    for(let k=2;k<19;k++){const i=Math.round(at.y+uy*k)*64+Math.round(at.x+ux*k);if(dz(i)<=0)break;if(h[i]===last)len++;else{if(len)runs.push(len);last=h[i];len=1;}}}
   expect(new Set(runs).size,`runs ${runs}`).toBeGreaterThan(2);
   // (the gully: cut only behind the apex, a notch at most 4 deep and 7 across, into the front)
   expect(cut.length).toBeGreaterThan(5);for(const i of cut){expect(rel(i).along).toBeLessThan(0);expect(dz(i)).toBeGreaterThanOrEqual(-4);}
   for(let x=0;x<28;x++)expect(cut.filter(i=>i%64===x).length).toBeLessThanOrEqual(7);
  }
  // (level ground: nothing taken; Try another turns it)
  const bearing=(seed:number)=>{const m=fixture("plain",64),r=new DepositRun(m,{...DEPOSIT_DEFAULTS,seed},{path:[{x:32,y:32}]}).finishAll();
   expect(r.map.heights.every((v,i)=>v>=m.heights[i])).toBe(true);return Math.atan2(r.plan0.direction.y,r.plan0.direction.x);};
  const turns=[1,2,3,4,5,6].map(bearing);expect(new Set(turns.map(a=>a.toFixed(2))).size).toBeGreaterThan(2);
  // (a dry click beside a river: the river keeps its bed)
  const river=fixture("river",64),dry=Array.from(river.heights.keys()).find(i=>river.water.depth[i]<=0.08&&river.water.depth[i+3]>0.08&&i%64>5&&i%64<58&&(i/64|0)>20&&(i/64|0)<44)!;
  const rr=new DepositRun(river,{...DEPOSIT_DEFAULTS,size:30},{path:[{x:dry%64,y:dry/64|0}]}).finishAll();
  expect(rr.map.heights.every((v,i)=>river.water.depth[i]<=0.08||v===river.heights[i])).toBe(true);
 });
 test("a real working-area restriction refuses atomically",()=>{
  const m=fixture("plain",64),before=m.heights.slice(),area=new Uint8Array(4096);
  expect(()=>new DepositRun(m,DEPOSIT_DEFAULTS,{path:[{x:30,y:30},{x:35,y:30}]},null,area)).toThrow("the working area leaves nothing to take sediment from");
  expect(m.heights).toEqual(before);
 });

});
