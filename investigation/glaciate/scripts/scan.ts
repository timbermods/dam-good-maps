import { writeFileSync } from 'node:fs';
import { fixture } from '../tests/fixtures';
import { makePlan,Valley,DEFAULTS } from '../model';
const all:any={};
for(const id of ['highlands-128','highlands-256','canyon-128','tall-128']){
 const m=fixture(id),v=new Valley(m),rows:any[]=[];
 for(let y=16;y<m.H-16;y+=Math.round(m.W/8))for(let x=16;x<m.W-16;x+=Math.round(m.W/8)){
  try{const p=makePlan(m,DEFAULTS,{origin:y*m.W+x},v);rows.push({x,y,height:m.heights[y*m.W+x],basins:p.basins.map(b=>[b.depth,b.tiles.length,b.fed]),hanging:p.hanging.length,...p.metrics});}catch{}
 }
 rows.sort((a,b)=>b.wallMedian*4+b.hanging*3-a.wallMedian*4-a.hanging*3);
 all[id]=rows;console.log(id,JSON.stringify(rows.slice(0,3)));}
writeFileSync('local/scan.json',JSON.stringify(all,null,2));
