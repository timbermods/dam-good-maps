// Built directly in Rust (D438/D444). Behaviour reference: investigation/rift, approved #99.
use super::*;

pub(super) struct RiftRecords {
    pub fault: Fault,
    pub arrival: Vec<f32>,
    // changed, maximum drop, held at Floor, stepped, sheer, width
    pub stats: [f64; 6],
}
impl RiftRecords {
    pub fn value(&self) -> V {
        json!({"fault":self.fault.value(), "arrival":self.arrival.iter().map(|&v|v as f64).collect::<Vec<_>>(),
            "stats":{"changed":self.stats[0],"drop":self.stats[1],"held":self.stats[2],"stepped":self.stats[3],"sheer":self.stats[4],"width":self.stats[5]},"total":21})
    }
    pub fn geometry(&self, out: &mut Vec<f64>) {
        let f=&self.fault;
        out.extend([f.length,f.reach,f.lift,f.slide,f.heading.x,f.heading.y,21.0,f.points.len() as f64,f.segments.len() as f64,f.directions.len() as f64]);
        for p in &f.points {out.extend([p.x,p.y]);}
        for s in &f.segments {out.extend([s.a.x,s.a.y,s.b.x,s.b.y,s.dx,s.dy,s.length,s.along]);}
        for p in &f.directions {out.extend([p.x,p.y]);}
    }
}
pub(super) fn noise(seed:f64,t:f64,key:f64)->f64 {
    let k=t.floor();let a=hash(seed,k+key);let b=hash(seed,k+key+1.0);
    a+(b-a)*smooth(t-k)
}
// Shared empty tape construction. No value/JSON operations on the planning path.
pub(super) fn result(map:Map,records:Records)->Plan {
    Plan {raw:Some(map.clone()),map,records,literal:Literal::default(),geometry:vec![],objects:vec![],fallen:vec![],
        raw_objects:vec![],raw_fallen:vec![],step_objects:vec![],closure_objects:vec![],closure_fallen:vec![],literal_objects:vec![],
        before:None,before_objects:vec![],before_fallen:vec![]}
}
// Vertical transport, never topple trees or create objects. Opaque metadata stays attached by numeric slot.
pub(super) fn ride(before:&Map,map:&mut Map) {
    for e in &mut map.entities {
        let i=e.y as usize*map.w+e.x as usize;
        let dz=map.heights[i] as f64-before.heights[i] as f64;
        if dz!=0.0 {e.z+=dz;e.raw_removed=true;}
    }
    for f in &mut map.fallen {
        let i=(f.y.floor() as usize).min(map.h-1)*map.w+(f.x.floor() as usize).min(map.w-1);
        f.z+=map.heights[i] as f64-before.heights[i] as f64;
    }
}
pub(super) fn plan(before:&Map,mut map:Map,s:&Settings,intent:&Intent,keep:&[u8],area_depth:&[u8],walls:u32)->Plan {
    let width=s.size.unwrap_or(10.0+s.power*0.18);
    let mut path=intent.path.clone();
    if path.len()==1 || path.windows(2).map(|p|hypot(p[1].x-p[0].x,p[1].y-p[0].y)).sum::<f64>()<min(8.0,width*0.5) {
        let p=path[0];let angle=hash(s.seed,580.0)*std::f64::consts::PI;let r=max(8.0,width*0.85);
        let dx=portable_math::cos(angle);let dy=portable_math::sin(angle);
        path=[-1.0,1.0].iter().map(|&d|Point{x:clamp(p.x+dx*r*d,0.0,map.w as f64-1.0),y:clamp(p.y+dy*r*d,0.0,map.h as f64-1.0)}).collect();
    }
    let fault=Fault::new(s,&Intent{path,side:1.0,origin:0.0,end:0.0,via:vec![]});
    let mut arrival=vec![2.0f32;map.heights.len()];let mut stepped=vec![false;map.heights.len()];
    let mut stats=[0.0;6];stats[5]=width;
    // Same full throw as the approved demo; a shallow coherent block at Power zero (D356).
    let throw=1.25+s.power*0.1125;
    let floor=s.floor.unwrap_or(1.0) as u8;
    for i in 0..map.heights.len() {
        if keep.get(i).copied().unwrap_or(0)!=0 {continue;}
        let h=before.heights[i];let f=fault.at((i%map.w) as f64,(i/map.w) as f64);
        let half=width*0.5*(0.80+0.36*noise(s.seed,f.along/19.0,if f.d<0.0{700.0}else{800.0}));
        // A wide, short stroke still has a middle block; its two end fades must not consume it.
        let fade=max(0.25,min(max(3.0,width*0.65),fault.length*0.40));
        let taper=smooth(f.along/fade)*smooth((fault.length-f.along)/fade);
        let reach=half*(0.35+0.65*portable_math::sqrt(taper));let distance=f.d.abs();
        if f.end>0.6||distance>=reach||taper<=0.0 {continue;}
        let level=h.saturating_sub(1) as usize;
        let hard=before.lava[i]&(1u32<<level)!=0 || before.rock.get(level).copied().unwrap_or(0.0)>0.5;
        let step=walls==2 || (walls==0&&hard); stepped[i]=step;
        let edge=(reach-distance)/max(1.0,reach);
        let wall=if step {if edge<0.13{0.28}else if edge<0.28{0.58}else if edge<0.40{0.82}else{1.0}}else{smooth(edge/0.11)};
        let tilt=(hash(s.seed,920.0)*2.0-1.0)*f.d/half*0.85;
        let broken=if hash(s.seed,(f.along/17.0).floor()+1000.0)>0.58{0.9}else{-0.25};
        let length_tilt=(hash(s.seed,950.0)*2.0-1.0)*(f.along/max(1.0,fault.length)-0.5)*1.8;
        // At low Power preserve the coherent one-level block instead of random speckled holes.
        let strength=s.power/100.0;
        let drop=max(0.0,round((throw+(tilt+broken+length_tilt)*strength)*wall*taper)) as u8;
        let drop=drop.min(area_depth.get(i).copied().unwrap_or(255));
        let target=h.saturating_sub(drop);map.heights[i]=target.max(h.min(floor));
        if target<map.heights[i]{stats[2]+=1.0;}
        if map.heights[i]!=h {
            arrival[i]=clamp(0.04+f.along/max(1.0,fault.length)*0.74+distance/half*0.05,0.04,0.85) as f32;
            stats[0]+=1.0;stats[1]=max(stats[1],(h-map.heights[i]) as f64);
            stats[if stepped[i]{3}else{4}]+=1.0;
            // Rock beds drop with the block; relief is never replaced by a level trench.
            map.lava[i]=(before.lava[i]>>(h-map.heights[i]))&mask(map.heights[i]);
        }
    }
    if stats[0]==0.0 {map.error=29;}
    ride(before,&mut map);
    result(map,Records::Rift(Box::new(RiftRecords{fault,arrival,stats})))
}
