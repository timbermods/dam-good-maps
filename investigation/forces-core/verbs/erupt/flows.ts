/** Seeded downhill paths, rasterized as overlapping rounded deposits, not angular spokes. */
export interface LobePoint {x:number;y:number;width:number}
export interface LavaLobe {points:LobePoint[];length:number;strength:number}
const unit=(s:number,k:number)=>{let x=Math.imul(s^Math.imul(k+1,0x9e3779b9),0x85ebca6b);x^=x>>>13;return(Math.imul(x,0xc2b2ae35)>>>0)/4294967296;};
export function lavaLobes(W:number,H:number,heights:Uint8Array,a:{x:number;y:number;radius:number;height:number;datum:number;summit:string},seed:number,heavy:boolean):LavaLobe[]{
  const out:LavaLobe[]=[],count=(heavy?4:3)+Math.floor(unit(seed,720)*(heavy?7:4)),angles:number[]=[];
  const ground=(x:number,y:number)=>heights[Math.max(0,Math.min(H-1,Math.round(y)))*W+Math.max(0,Math.min(W-1,Math.round(x)))];
  for(let k=0;k<count;k++){
    let angle=unit(seed,730+k)*Math.PI*2;
    // Random gaps and occasional neighboring lobes; never a regular angular fan.
    for(let attempt=0;attempt<20&&angles.some(t=>Math.abs(Math.atan2(Math.sin(t-angle),Math.cos(t-angle)))<.29);attempt++)angle=unit(seed,900+k*23+attempt)*Math.PI*2;
    angles.push(angle);
    const start=a.summit==='caldera'?.64:a.summit==='crater'?.19:.12;
    const reach=(heavy?.86:.72)+unit(seed,800+k)**1.4*(heavy?1.5:.7),length=a.radius*(reach-start),steps=Math.max(12,Math.ceil(length/.65));
    const width=(.85+unit(seed,820+k)*1.35)*Math.max(.7,a.radius/22),phase=unit(seed,840+k)*Math.PI*2;
    const points:LobePoint[]=[];let x=a.x+Math.cos(angle)*a.radius*start,y=a.y+Math.sin(angle)*a.radius*start;
    for(let j=0;j<=steps;j++){
      const u=j/steps,r=a.radius*(start+(reach-start)*u),theta=angle+.32*Math.sin(u*5.8+phase)+.19*Math.sin(u*10.2-phase);
      if(j){
        const desired=Math.atan2(a.y+Math.sin(theta)*r-y,a.x+Math.cos(theta)*r-x),step=length/steps;
        let best=Infinity,bx=x,by=y;
        for(const turn of [0,-.25,.25,-.5,.5]){
          const nx=x+Math.cos(desired+turn)*step,ny=y+Math.sin(desired+turn)*step,nr=Math.hypot(nx-a.x,ny-a.y);
          if(nr<Math.hypot(x-a.x,y-a.y))continue;
          const score=ground(nx,ny)*.7+Math.abs(turn)*.65;
          if(score<best){best=score;bx=nx;by=ny;}
        }
        // Once beyond the cone, a lobe pools at uphill obstacles instead of climbing them.
        if(Math.hypot(x-a.x,y-a.y)>a.radius&&ground(bx,by)>ground(x,y))break;
        x=bx;y=by;
      }
      const tongue=1+1.2*Math.exp(-(((u-.89)/.18)**2));
      points.push({x,y,width:width*(.38+.62*u)*tongue});
    }
    if(points.length>1)out.push({points,length,strength:1.1+unit(seed,860+k)*1.4});
  }
  return out;
}
/** Compactness and round caps also make useful heat masks for the actual terrain shader. */
export function lobeField(W:number,H:number,lobes:LavaLobe[]):Float32Array{
  const field=new Float32Array(W*H);
  for(const lobe of lobes)for(let k=1;k<lobe.points.length;k++){
    const a=lobe.points[k-1],b=lobe.points[k],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy,w=Math.max(a.width,b.width);
    for(let y=Math.max(0,Math.floor(Math.min(a.y,b.y)-w));y<=Math.min(H-1,Math.ceil(Math.max(a.y,b.y)+w));y++)for(let x=Math.max(0,Math.floor(Math.min(a.x,b.x)-w));x<=Math.min(W-1,Math.ceil(Math.max(a.x,b.x)+w));x++){
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(l2||1))),width=a.width+(b.width-a.width)*t,d=Math.hypot(x-a.x-dx*t,y-a.y-dy*t)/width;
      if(d<1){const v=(1-d*d)**.65*lobe.strength,i=y*W+x;field[i]=Math.max(field[i],v);}
    }
  }
  return field;
}
