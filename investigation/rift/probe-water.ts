import { readFileSync } from "node:fs";
import { CASES, decode } from "./maps";
import { DEFAULTS, plan, settle } from "./rift";
const m = decode(new Uint8Array(readFileSync("maps/highlands.json.gz")));
console.log("sources", m.entities.filter(e => /Source|Seep/.test(e.template)).map(e => [e.template, e.x, e.y, e.z]));
for (const y of [24, 32, 40, 48, 52, 56, 60, 64, 72, 80])
 console.log(y, Array.from({length:24},(_,j)=>{const x=j*4,i=y*128+x;return `${x}:${m.heights[i]}${m.water.depth[i]>.05?"~":""}`;}).join(" "));
for (const path of [[{x:40,y:38},{x:61,y:46},{x:81,y:52},{x:101,y:60}],
 [{x:20,y:62},{x:45,y:62},{x:70,y:70},{x:96,y:76}],
 [{x:44,y:92},{x:65,y:94},{x:82,y:99},{x:106,y:101}]]) {
 for (const seed of [1,2,3]) {
  const p=plan(m,{...DEFAULTS,power:100,size:26,seed},{path});
  console.log("before settle",path[0],seed,p.stats,"wet affected",p.operation.tiles.filter(i=>m.water.depth[i]>.05).length);
  settle(p.map);
  const wet=p.operation.tiles.filter(i=>m.water.depth[i]<=.05&&p.map.water.depth[i]>.1);
  console.log("new wet",wet.length,"max depth",Math.max(...p.map.water.depth), "sum",p.map.water.depth.reduce((a,b)=>a+b,0));
 }
}
