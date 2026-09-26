import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {erupt,DEFAULTS,field} from './engine';
import {fixture} from './maps';
const base=fixture('plain',128),intent={origin:64*128+64},s={...DEFAULTS,seed:891,summit:'peak' as const,flows:'light' as const,ridges:false};
const steep=erupt(base,s,intent),broad=erupt(base,{...s,shape:'broad'},intent);
const height=(p:typeof steep)=>Math.max(...p.map.heights)-3;
const width=(p:typeof steep)=>Array.from(p.map.heights.slice(64*128,65*128)).filter(h=>h>=3+height(p)/2).length;
assert(height(steep)>height(broad)*2);assert(width(steep)<width(broad)*.6);
const at=(d:number)=>steep.map.heights[intent.origin+d];assert(at(1)-at(6)>at(12)-at(17),'Steep flanks steepen towards the summit');
const signatures=['2a9d09f39ea64379f68464250edce96bb47490d309323f71e33f8650af3bc27e','6575ade03debf7d338c462c2b51e3d1dc13562d493f61d58d193bafd410dc383','49f0428b1920c4e60b898cf97bc084a72590a0b6c297fd31d7a9aec8fa41d5d1','738cdd2cec599fd4413044468f8d205c2a7e365cf2930af83ba55daa08f4172e'];
let k=0;
for(const shape of ['steep','broad'] as const)for(const flows of ['light','heavy'] as const){
 const p=erupt(base,{...DEFAULTS,mode:'fissure',shape,flows,seed:891},{origin:50*128+35,path:[{x:35,y:50},{x:60,y:65},{x:90,y:55}]});
 assert.equal(createHash('sha256').update(p.map.heights).update(new Uint8Array(p.map.lava.buffer)).update(JSON.stringify(p.map.entities)).digest('hex'),signatures[k++],'Fissure terrain, lava and objects must remain byte-identical');
}
const caldera=erupt(base,{...DEFAULTS,power:96,seed:78,summit:'caldera'},intent);
assert.equal(createHash('sha256').update(caldera.map.heights.filter((_,i)=>field(caldera.anatomy,caldera.settings,i%128,Math.floor(i/128)).r<.6)).digest('hex'),'bf0870862c0e3389e1bee1658c921f3ff907504805691e83f67e409a4dbf5795');
const counts=new Set<number>();let minimumBend=Infinity;
for(let seed=1;seed<=24;seed++){
 const p=erupt(base,{...DEFAULTS,seed},intent),lobes=p.anatomy.lobes;counts.add(lobes.length);
 const lengths=lobes.map(l=>l.length);assert(Math.max(...lengths)>Math.min(...lengths)*1.35);
 for(const lobe of lobes){
  const start=lobe.points[0],end=lobe.points.at(-1)!,dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);
  const bend=Math.max(...lobe.points.map(p=>Math.abs(dx*(p.y-start.y)-dy*(p.x-start.x))/length));minimumBend=Math.min(minimumBend,bend);assert(bend>.35,'No straight lava spokes');
  assert(end.width>start.width*2,'Flow widens into a tongue');
  for(let j=1;j<lobe.points.length;j++){const a=lobe.points[j-1],b=lobe.points[j];assert(Math.hypot(b.x-64,b.y-64)>=Math.hypot(a.x-64,a.y-64),'Flows descend outwards on a cone');}
 }
}
assert(counts.size>=5,'Lobe count varies across personalities');
const report={equalPower:62,steep:{height:height(steep),widthAtHalfHeight:width(steep)},broad:{height:height(broad),widthAtHalfHeight:width(broad)},fissureExactCases:4,calderaBasinExact:true,lobeCountRange:[Math.min(...counts),Math.max(...counts)],minimumBend};
writeFileSync('captures/morphology-checks.json',JSON.stringify(report,null,2)+'\n');console.log(report);
