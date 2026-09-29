// Original deterministic render fixtures. Not simulation output and never written to product data.
export const fixtureViews={
 'broad-cascade':{mode:'orbit',yaw:0.12,pitch:0.33,distance:54,target:[24,6,-22],fov:40},
 'badwater-fall':{mode:'orbit',yaw:0.48,pitch:0.46,distance:43,target:[24,6,-22],fov:40},
 'ground-veins':{mode:'orbit',yaw:0,pitch:1.18,distance:35,target:[16,5,-12],fov:40},
 'water-comparison':{mode:'orbit',yaw:0,pitch:0.85,distance:49,target:[24,4,-16],fov:40}
};
export async function installFixture(page,id){
 await page.evaluate(id=>{
  const W=id==='ground-veins'?32:48,H=id==='ground-veins'?24:40,N=W*H;
  const heights=new Uint8Array(N),moisture=new Uint8Array(N),contamination=new Uint8Array(N);
  const tile=[],floor=[],depth=[],bad=[];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const i=y*W+x;let h=3,d=0,c=0;
   if(id==='ground-veins'){h=5;moisture[i]=x>=16?220:0;contamination[i]=y>=12?255:0;}
   else if(id==='water-comparison'){
    const channel=(x>=6&&x<20)||(x>=28&&x<42);h=channel?(y<18?1:4):6;d=channel?5.7-h:0;c=x>=24?1:0;moisture[i]=180;
   }else{
    const base=id==='broad-cascade'?3+Math.max(0,Math.min(7,Math.floor((y-12)/3))):(y>=23?10:3);
    const channel=id==='broad-cascade'?x>=10&&x<38:x>=21&&x<27;
    h=base+(channel?0:3);d=channel?0.72:0;c=id==='badwater-fall'?1:0;
    moisture[i]=(x+y)%19<12?190:0;contamination[i]=c&&Math.abs(x-24)<9?230:0;
   }
   heights[i]=h;if(d>0){tile.push(i);floor.push(h);depth.push(d);bad.push(c)}
  }
  const entities={count:0,templates:[],owners:[],template:new Uint16Array(),x:new Int16Array(),y:new Int16Array(),z:new Int16Array(),orientation:new Uint8Array(),flags:new Uint8Array(),owner:new Uint16Array(),variant:new Uint8Array(),strength:new Float32Array()};
  const map={W,H,heights,columns:{tiles:new Int32Array(),voxels:new Uint8Array()},water:{count:tile.length,tile:Int32Array.from(tile),floor:Float32Array.from(floor),depth:Float32Array.from(depth),contamination:Float32Array.from(bad)},soil:{moisture,contamination},entities};
  const r=window.dgm3d.renderer;r.setMap(map);r.setLookChoice('high',false);r.setClock(12.5);
 },id);
 await page.waitForFunction('window.dgm3d.renderer.highSettled',null,{timeout:120000});
}
