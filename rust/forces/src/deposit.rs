// Built directly in Rust (D438/D444). Behaviour/look reference: Deposit round 2, approved #114/D364.
//
// The landform (the force audit's findings 4, 5, 14 and 28): an alluvial fan, a low cone segment from its apex (a
// few tiles behind where it is clicked or drawn from), 60 to 120 degrees wide, a level per 4 to 8 tiles, 3 to 5
// levels thick at the default, arc-shaped contours and a feathered toe. It lays only where that cone stands above the
// ground, never above its apex; its surface is drawn to a seeded ladder of 1 to 2-level rungs, the edges warped, then
// made whole levels by `levels::whole`, so it reads as benches of uneven width, never even stairs or contour rings.
// Its distributaries are a level deep, each with one avulsion. What feeds it is a gully: a V-notch 2 to 4 wide at its
// floor up the steepest ascent behind it, inside the outline, graded down to it and on through the fan's head as a
// trench; where the ground behind is level it takes nothing (the water brought it). The sediment is not conserved.
// Placed on dry ground it leaves water's beds as they are, and its gully keeps a sill of two tiles from any water,
// so it never dams a stream, spills a pond or lets badwater into clean water (the audit's S3). Nothing changes
// outside the outline (#341).
use super::*;
use super::rift::{keep_footprints, noise, result, ride, rides_whole};

pub(super) struct DepositRecords {
    pub arrival: Vec<f32>, pub channel: Vec<u8>, pub stages: Vec<u8>,
    pub branches: Vec<Vec<Point>>, pub mouth: Point, pub direction: Point, pub reach: f64,
    pub placement: u32, pub width: f64,
    // changed, eroded, deposited, balance, maximumCut, maximumDeposit, channels, wet, buried, carried, donorRadius
    pub stats: [f64; 11],
}
impl DepositRecords {
    pub fn value(&self) -> V {
        json!({"arrival":self.arrival.iter().map(|&v|v as f64).collect::<Vec<_>>(),"channel":self.channel,
            "channelStages":self.stages.chunks(self.channel.len()).map(|c|c.to_vec()).collect::<Vec<_>>(),
            "mouth":self.mouth.value(),"direction":self.direction.value(),"reach":self.reach,"width":self.width,
            "placement":["fan","slope","sheet","delta","hollow"][self.placement as usize],
            "branches":self.branches.iter().map(|b|b.iter().map(Point::value).collect::<Vec<_>>()).collect::<Vec<_>>(),
            "stats":{"changed":self.stats[0],"eroded":self.stats[1],"deposited":self.stats[2],"balance":self.stats[3],"maximumCut":self.stats[4],"maximumDeposit":self.stats[5],"channels":self.stats[6],"wet":self.stats[7],"buried":self.stats[8],"carried":self.stats[9],"donorRadius":self.stats[10]},"total":40})
    }
    pub fn geometry(&self,out:&mut Vec<f64>) {
        out.extend([self.mouth.x,self.mouth.y,self.direction.x,self.direction.y,self.reach,self.width,self.placement as f64,self.branches.len() as f64]);
        for branch in &self.branches {out.push(branch.len() as f64);for p in branch {out.extend([p.x,p.y]);}}
    }
}
fn neighbours(m:&Map,i:usize)->[Option<usize>;4] {
    let x=i%m.w;let y=i/m.w;
    [if x>0{Some(i-1)}else{None},if x+1<m.w{Some(i+1)}else{None},if y>0{Some(i-m.w)}else{None},if y+1<m.h{Some(i+m.w)}else{None}]
}
// The fan stays where it is clicked or drawn (Kyler, #341): what is under it only sets its placement.
fn receiving(m:&Map,origin:Point)->(Point,u32) {
    let h=m.heights[m.at(origin.x,origin.y)];let mut lo=h;let mut hi=h;
    for y in (-5..=5).step_by(2) {for x in (-5..=5).step_by(2) {let v=m.heights[m.at(origin.x+x as f64,origin.y+y as f64)];lo=lo.min(v);hi=hi.max(v);}}
    (origin,if m.depth[m.at(origin.x,origin.y)]>0.08{3}else if hi-lo<2{2}else{0})
}
// Which way the fan runs: down the land, the high ground behind it; on level ground the seed picks (Try another
// turns it, the audit's finding 28).
fn heading(m:&Map,mouth:Point,last:Point,drawn:bool,reach:f64,seed:f64)->Point {
    let base=if drawn{atan2(last.y-mouth.y,last.x-mouth.x)}else{0.0};let mut best=f64::INFINITY;let mut angle=base;
    for k in 0..if drawn{9}else{32} {
        let a=if drawn{base+(k as f64-4.0)*0.075}else{k as f64*PI/16.0};let mut score=0.0;
        for d in [6.0,12.0,20.0] {for side in [-0.22,0.0,0.22] {
            let x=mouth.x+cos(a+side)*min(d,reach);let y=mouth.y+sin(a+side)*min(d,reach);
            let i=m.at(x,y);let b=m.at(mouth.x-cos(a)*d,mouth.y-sin(a)*d);
            score+=m.heights[i] as f64*1.4-m.heights[b] as f64*0.35;
            if x<0.0||y<0.0||x>=m.w as f64||y>=m.h as f64{score+=8.0;}
        }}
        if drawn{score+=(a-base).abs()*80.0;}else{score+=hash(seed,3100.0+k as f64)*2.0;}
        if score<best{best=score;angle=a;}
    }
    Point{x:cos(angle),y:sin(angle)}
}
// Reserve the connected native wet outlet, preferring low bed and never a source edge.
fn outlet(m:&Map,mouth:Point,dir:Point)->Vec<u8> {
    let n=m.heights.len();let mut mask=vec![0;n];let mut blocked=vec![false;n];
    for e in &m.entities {if matches!(e.template.as_ref(),"WaterSource"|"BadwaterSource"|"WaterSeep") {for i in m.footprint(e,0){blocked[i]=true;for j in neighbours(m,i).into_iter().flatten(){blocked[j]=true;}}}}
    let mut first=None;let mut nearest=f64::INFINITY;
    for i in 0..n {
        let d=hypot((i%m.w) as f64-mouth.x,(i/m.w) as f64-mouth.y);
        if d<=4.25&&m.depth[i]>0.08&&d<nearest {first=Some(i);nearest=d;}
    }
    let first=match first{Some(i)=>i,None=>return mask};let mut parent=vec![usize::MAX;n];let mut distance=vec![f64::INFINITY;n];let mut heap=ForceHeap::default();
    distance[first]=0.0;parent[first]=first;heap.push(0.0,first);
    while let Some((key,i))=heap.pop() {
        if key!=distance[i]{continue;}let x=i%m.w;let y=i/m.w;
        if ((x as f64-mouth.x)*dir.x+(y as f64-mouth.y)*dir.y)>6.0&&(x==0||y==0||x==m.w-1||y==m.h-1){
            let mut j=i;loop{mask[j]=1;if j==first{break;}j=parent[j];}return mask;
        }
        for j in neighbours(m,i).into_iter().flatten(){if m.depth[j]<=0.05{continue;}let cost=key+1.0+m.heights[j] as f64*32.0+if blocked[j]{1024.0}else{0.0};if cost<distance[j]{distance[j]=cost;parent[j]=i;heap.push(cost,j);}}
    }
    mask
}
fn paint(m:&Map,mask:&mut[u8],p:Point,r:f64) {
    for y in (p.y-r).floor() as i32..=(p.y+r).ceil() as i32 {for x in (p.x-r).floor() as i32..=(p.x+r).ceil() as i32 {
        if x>=0&&y>=0&&x<m.w as i32&&y<m.h as i32&&hypot(x as f64-p.x,y as f64-p.y)<=r {mask[y as usize*m.w+x as usize]=1;}
    }}
}
/// How far a tile lies from the outline's line (Kyler, #341): a click's point, a drag's drawn line; the outline is
/// every tile within the fan's half-width of it, as the page draws it.
fn away(path:&[Point],drawn:bool,x:f64,y:f64)->f64 {
    if drawn&&path.len()>1{path.windows(2).map(|s|{let (a,b)=(s[0],s[1]);let (ux,uy)=(b.x-a.x,b.y-a.y);let l=ux*ux+uy*uy;
        let t=if l>0.0{clamp(((x-a.x)*ux+(y-a.y)*uy)/l,0.0,1.0)}else{0.0};hypot(x-a.x-t*ux,y-a.y-t*uy)}).fold(f64::INFINITY,min)}
    else{hypot(x-path[0].x,y-path[0].y)}
}
/// The fan's apex thickness, levels: 3 to 5 at the default and above (1.5 at Power 0), a level per 4 to 8 tiles of
/// its reach, never under 1.2 nor over 6.
fn apex_thickness(power:f64,reach:f64)->f64 {
    min(6.0,clamp(1.5+3.5*power,max(1.2,reach/9.0),max(1.2,reach/4.0)))
}
pub(super) fn plan(before:&Map,mut map:Map,s:&Settings,intent:&Intent,keep:&[u8],area:&[u8],channels:u32)->Plan {
    let (w,h)=(map.w,map.h);let n=w*h;let power=clamp(s.power/100.0,0.0,1.0);let floor=s.floor.unwrap_or(1.0) as u8;let seed=s.seed;
    let origin=intent.path[0];let last=*intent.path.last().unwrap();let drawn=intent.path.len()>1&&hypot(last.x-origin.x,last.y-origin.y)>1.0;
    let (mouth,placement)=receiving(before,origin);
    let drawn=drawn&&hypot(last.x-mouth.x,last.y-mouth.y)>1.0;
    // Size is the fan's width, a click's and a drag's (the page's ring and band, its Auto size rounded as the page
    // shows it); Power changes the material/relief within it (D361). Nothing changes outside its outline (Kyler,
    // #341): a click's circle, a drag's band (Size wide along the drawn line). The fan runs from where it is placed,
    // and its gully lies behind it, inside the same outline.
    let width=s.size.unwrap_or(round((14.0+s.power*0.34)/2.0)*2.0);
    let radius=max(4.0,width/2.0);
    let reach=if drawn{clamp(hypot(last.x-mouth.x,last.y-mouth.y),4.0,112.0)}else{max(2.0,radius-0.5)};
    let dir=heading(before,mouth,last,drawn,reach,seed);
    let ceiling=min(255.0,map.ceiling);
    // (how far inside the outline each tile lies, and how many levels it may move: Keep and the working area's depth)
    let inside:Vec<f64>=(0..n).map(|i|radius-away(&intent.path,drawn,(i%w) as f64,(i/w) as f64)).collect();
    let g0=before.heights[map.at(mouth.x,mouth.y)] as f64;
    // (placed in water: on its tile or most of the ground round it)
    let wet=before.depth[map.at(mouth.x,mouth.y)]>0.08||(-3..=3).flat_map(|y|(-3..=3).map(move|x|(x,y))).filter(|&(x,y)|before.depth[map.at(mouth.x+x as f64,mouth.y+y as f64)]>0.08).count()>=25;
    // (a fan placed on dry ground leaves the water's beds as they are: a stream it reaches runs on through it, never
    // dammed into a lake behind it, the force audit's S3)
    let room:Vec<u8>=(0..n).map(|i|if keep.get(i).copied().unwrap_or(0)!=0||inside[i]<0.0||!wet&&before.depth[i]>0.02{0}else{area.get(i).copied().unwrap_or(255)}).collect();
    let outlet=if wet{outlet(before,mouth,dir)}else{vec![0;n]};
    // The cone (finding 5): its apex `thick` over the ground where it is placed, falling to its toe at `reach` (lobed)
    // within its sector, more steeply off it, steepest behind the apex; its thickness the cone over the ground, at most
    // a feathered envelope that thins to nothing at the toe and toward the outline's edge. Under water a level at most,
    // and a wet outlet keeps its bed.
    let thick=apex_thickness(power,reach);let apex=g0+thick;
    // (its apex a few tiles back from where it is placed, in the gully's mouth, so the fan is broad where it is
    // placed rather than a point)
    let set_back=clamp(reach*0.15,1.5,5.0);let (px,py)=(mouth.x-dir.x*set_back,mouth.y-dir.y*set_back);
    let half=0.55+0.5*hash(seed,3200.0);let back=max(2.0,thick/0.6);
    let mut fan=vec![0.0f64;n];let mut along_of=vec![0.0f64;n];
    for i in 0..n {
        if room[i]==0||outlet[i]!=0{continue;}
        let dx=(i%w) as f64-px;let dy=(i/w) as f64-py;let r=hypot(dx,dy);
        if r>(reach+set_back)*1.2+2.0{continue;}
        let along=dx*dir.x+dy*dir.y;let cross=-dx*dir.y+dy*dir.x;
        let theta=if r>0.0{atan2(cross,along)}else{0.0};
        let lobe=0.6*noise(seed,(theta+PI)*1.9,3300.0)+0.4*noise(seed,(theta+PI)*4.3,3350.0);
        let toe=(reach+set_back)*(0.8+0.2*lobe);
        let off=smooth((theta.abs()-half)/(PI-half));
        let big=toe*(1.0-off)+back*off;let u=r/big;
        if u>=1.0{continue;}
        let hb=before.heights[i] as f64;
        let cone=apex-thick*if u>0.0{pow(u,1.1)}else{0.0};
        let envelope=thick*pow(1.0-u,0.75);
        let mut t=min(cone-hb,min(envelope,0.4*(inside[i]+0.5)));
        if before.depth[i]>0.08{t=min(t,1.0);}
        if t<0.4{continue;}
        fan[i]=t;along_of[i]=u;
    }
    // Its surface drawn to the nearest of a ladder of rungs a level or two apart (the seed choosing each) under the
    // apex, the edges warped so they are neither concentric nor even; a thin edge as it is.
    let top=round(thick);let face=|k:f64|1.0+(hash(seed,3400.0+k)*1.3).floor();
    let mut ladder=vec![];let mut rung=top;let mut k=0.0;
    while rung>-24.0{ladder.push(rung);rung-=face(k);k+=1.0;}
    let mut surface=vec![f64::NAN;n];
    for i in 0..n {
        if fan[i]<=0.0{continue;}
        let hb=before.heights[i] as f64;let (x,y)=((i%w) as f64,(i/w) as f64);
        surface[i]=if fan[i]>1.5{
            let z=hb+fan[i]-g0;
            let warp=((lumps(seed,4510,x,y,max(6.0,reach*0.4))-0.5)*1.3+(lumps(seed,4520,x,y,3.0)-0.5)*0.5)*min(1.0,(fan[i]-1.5)/1.5);
            let at=z+warp;let bench=ladder.iter().copied().fold(-24.0,|b,r|if (r-at).abs()<(b-at).abs(){r}else{b});
            min(g0+top,max(hb+1.0,g0+bench))
        }else{hb+fan[i]};
    }
    // Its distributaries (finding 14): Few 2, Many 5, Auto 3 (4 on a broad fan), spread across the sector from the
    // apex, wandering, each with one avulsion where it swings aside; a level deep where the fan is 2 or more thick.
    let count=if channels==1{2}else if channels==2{5}else if width>38.0{4}else{3};
    let mut branches=vec![];let mut channel=vec![0u8;n];
    for b in 0..count {
        let a0=(b as f64/(count-1) as f64-0.5)*2.0*half*0.7+(hash(seed,3500.0+b as f64)-0.5)*0.2;
        let swing=(if hash(seed,3600.0+b as f64)<0.5{-1.0}else{1.0})*(0.12+0.14*hash(seed,3650.0+b as f64));
        let at=0.35+0.3*hash(seed,3700.0+b as f64);
        let steps=(reach*2.0).ceil() as usize;let mut branch=vec![];
        for k in 0..=steps {
            let u=k as f64/steps as f64;let d=u*reach*0.9;
            let a=a0+swing*smooth((u-at)/0.12);let wander=(noise(seed,d/9.0,400.0+b as f64*51.0)-0.5)*2.4*smooth(u*4.0);
            let (ca,sa)=(cos(a),sin(a));let ax=dir.x*ca-dir.y*sa;let ay=dir.x*sa+dir.y*ca;
            let p=Point{x:mouth.x+ax*d-ay*wander,y:mouth.y+ay*d+ax*wander};
            if u>0.08&&u<0.92{paint(&map,&mut channel,p,if wet{0.85}else{1.15});}
            branch.push(p);
        }
        branches.push(branch);
    }
    for i in 0..n{if channel[i]!=0&&!surface[i].is_nan()&&surface[i]-before.heights[i] as f64>=2.0{surface[i]-=1.0;}}
    // The feeder gully (finding 4): from where the fan is placed up the steepest ascent behind it, a tile a step,
    // inside the outline; its bed graded down to a level over the ground where the fan is placed, a V-notch 2 to 4
    // wide at its floor, cut where the ground stands over that bed, shallowing to its head. On through the fan's head
    // it runs as a trench, as deep as the fan less a level where it is placed and shallowing down the fan's axis to
    // nothing by nearly half its reach: the gully's water runs out over the fan, never into a hollow behind its apex.
    // Level ground behind gives nothing (the water brought the fan), and then no trench either.
    let mean=|x:f64,y:f64|->f64{let mut t=0.0;for oy in -1..=1{for ox in -1..=1{t+=before.heights[map.at(x+ox as f64,y+oy as f64)] as f64;}}t/9.0};
    let mut gully=vec![mouth];let (mut hx,mut hy)=(-dir.x,-dir.y);let mut p=mouth;
    for _ in 0..(radius*2.0).ceil() as usize {
        let mut best=(f64::NEG_INFINITY,hx,hy);
        for k in -2i32..=2 {
            let a=k as f64*0.24;let (ca,sa)=(cos(a),sin(a));let (qx,qy)=(hx*ca-hy*sa,hx*sa+hy*ca);
            let (x,y)=(p.x+qx*2.5,p.y+qy*2.5);
            if x<0.0||y<0.0||x>(w-1) as f64||y>(h-1) as f64{continue;}
            let score=mean(x,y)-k.abs() as f64*0.05;
            if score>best.0{best=(score,qx,qy);}
        }
        if best.0==f64::NEG_INFINITY{break;}
        let l=hypot(best.1,best.2);hx=best.1/l;hy=best.2/l;
        let q=Point{x:p.x+hx,y:p.y+hy};
        if q.x<0.0||q.y<0.0||q.x>(w-1) as f64||q.y>(h-1) as f64||radius-away(&intent.path,drawn,q.x,q.y)<1.5{break;}
        // (never back toward the fan)
        if (q.x-mouth.x)*dir.x+(q.y-mouth.y)*dir.y>0.0{break;}
        p=q;gully.push(p);
    }
    let length=(gully.len()-1) as f64;
    let deepest=round(1.5+2.5*power);let grade=0.18;let bottom=0.75+0.5*power;let wall=2.5;
    let bed=|d:f64|g0+1.0+grade*d;
    let most=|d:f64|deepest*smooth((length-d+1.0)/4.0);
    let ahead=(reach*0.45).ceil() as usize;
    let line:Vec<(Point,f64)>=(1..=ahead).rev().map(|k|(Point{x:mouth.x+dir.x*k as f64,y:mouth.y+dir.y*k as f64},-(k as f64)))
        .chain(gully.iter().enumerate().map(|(k,&q)|(q,k as f64))).collect();
    let mut cut_d=vec![f64::NAN;n];let mut trench=vec![false;n];
    // (never within two tiles of standing or running water: a sill stays between the gully and any pond or stream, so it
    // never spills a pond, nor lets badwater into clean water, the force audit's S3)
    let near_water:Vec<bool>=(0..n).map(|i|{let (x,y)=((i%w) as i64,(i/w) as i64);
        (-2i64..=2).any(|oy|(-2i64..=2).any(|ox|{let (u,v)=(x+ox,y+oy);u>=0&&v>=0&&u<w as i64&&v<h as i64&&before.depth[v as usize*w+u as usize]>0.05}))}).collect();
    let mut planned:Vec<(usize,f64,f64)>=vec![];let mut feeds=false;
    if length>=2.0 {
        let (x0,x1,y0,y1)=line.iter().fold((f64::INFINITY,f64::NEG_INFINITY,f64::INFINITY,f64::NEG_INFINITY),|b,(q,_)|(min(b.0,q.x),max(b.1,q.x),min(b.2,q.y),max(b.3,q.y)));
        let pad=bottom+deepest/wall+1.0;
        for y in max(0.0,(y0-pad).floor()) as usize..=min((h-1) as f64,(y1+pad).ceil()) as usize {
            for x in max(0.0,(x0-pad).floor()) as usize..=min((w-1) as f64,(x1+pad).ceil()) as usize {
                let i=y*w+x;
                if room[i]==0||outlet[i]!=0||inside[i]<0.5||near_water[i]{continue;}
                let (mut c,mut d)=(f64::INFINITY,0.0);
                for &(q,k) in &line{let e=hypot(x as f64-q.x,y as f64-q.y);if e<c{c=e;d=k;}}
                let hb=before.heights[i] as f64;let base=if fan[i]>0.0{surface[i]}else{hb};let side=max(0.0,c-bottom)*wall;
                let next=if d>=0.0{
                    // (its V: at most `most` into the ground and never under its bed or the Floor at its middle, less toward its sides)
                    let ground=hb-max(0.0,min(min(most(d),hb-bed(d))-side,min(room[i] as f64,max(0.0,hb-floor as f64))));
                    // (and through the fan's own back, down to its bed)
                    if base>hb{min(base,max(bed(d)+side,ground))}else{ground}
                }else{max(hb+min(1.0,max(0.0,base-hb-0.5)),base-max(0.0,(thick-1.0)*(1.0+d/(0.45*reach))-side))};
                if base-next>=0.6{planned.push((i,next,d));if d>=1.0&&next<hb-0.5{feeds=true;}}
            }
        }
    }
    // (no gully behind it, no trench through it: what it cuts it cuts only where something feeds the fan)
    if feeds{for &(i,next,d) in &planned{surface[i]=next;trench[i]=true;if next<before.heights[i] as f64{cut_d[i]=max(0.0,d);}}}
    // (the ground right round what it shapes, inside its outline: its own level, so the last step may tidy it too)
    let rim:Vec<usize>=(0..n).filter(|&i|{let (x,y)=(i%w,i/w);
        surface[i].is_nan()&&room[i]>0&&outlet[i]==0&&[(x>0,i.wrapping_sub(1)),(x+1<w,i+1),(y>0,i.wrapping_sub(w)),(y+1<h,i+w)].iter().any(|&(on,j)|on&&!surface[j].is_nan())}).collect();
    for &i in &rim{surface[i]=before.heights[i] as f64;}
    let ground:Vec<f64>=before.heights.iter().map(|&v|v as f64).collect();
    let mut land=levels::whole(&surface,&ground,&before.heights,w,h,ceiling,seed,max(6.0,reach*0.33));
    let peak=min(g0+top,ceiling) as u8;
    for i in 0..n {
        let b=before.heights[i];
        land[i]=if surface[i].is_nan()||room[i]==0||outlet[i]!=0{b}
        else if !cut_d[i].is_nan(){let lo=b.saturating_sub(room[i]).max(b.min(floor)).max(b.saturating_sub(deepest as u8+1));land[i].max(lo).min(b)}
        else if fan[i]>0.0{let hi=b.saturating_add(room[i]).min(clamp(surface[i].ceil()+if trench[i]{0.0}else{1.0},0.0,ceiling) as u8).min(peak.max(b));land[i].min(hi).max(b)}
        else{land[i].max(b).min(b.saturating_add(1).min(ceiling as u8).min(peak).max(b))};
    }
    // Every raised tile belongs to a raised 2 × 2 body and never stands 3 over all round it; an object of several
    // tiles rides whole (D368 (10)); both settled together (each pass only takes back).
    map.heights=land;
    // (an object of several tiles the fan buries or cuts unevenly rides it whole by the least its tiles moved, so no
    // footprint is left a pit in the fan that the water then fills)
    for e in &before.entities{if !rides_whole(e){continue;}let tiles=before.footprint(e,0);
        let dz:Vec<i32>=tiles.iter().map(|&i|map.heights[i] as i32-before.heights[i] as i32).collect();
        let by=if dz.iter().all(|&v|v>=0){dz.iter().copied().min().unwrap_or(0)}else if dz.iter().all(|&v|v<=0){dz.iter().copied().max().unwrap_or(0)}else{continue};
        for &i in &tiles{map.heights[i]=(before.heights[i] as i32+by) as u8;}
    }
    for _ in 0..64 {
        let mut changed=false;
        for i in 0..n {
            let b=before.heights[i];let v=map.heights[i];if v<=b{continue;}
            let (x,y)=(i%w,i/w);
            let body=(0..=1).any(|oy|(0..=1).any(|ox|{if x<ox||y<oy||x-ox+1>=w||y-oy+1>=h{return false;}let j=(y-oy)*w+x-ox;
                [j,j+1,j+w,j+w+1].iter().all(|&k|map.heights[k]>before.heights[k])}));
            let near=[(x>0,i.wrapping_sub(1)),(x+1<w,i+1),(y>0,i.wrapping_sub(w)),(y+1<h,i+w)].iter().filter(|&&(on,_)|on).map(|&(_,j)|map.heights[j]).max().unwrap_or(v);
            let next=if !body{b}else if v>=near.saturating_add(3){near.saturating_add(2).max(b)}else{v};
            if next!=v{map.heights[i]=next;changed=true;}
        }
        if keep_footprints(before,&mut map){changed=true;}
        if !changed{break;}
    }
    // A force never refuses a click (D356): where the fan left fewer than nine tiles changed, the nearest free 2 × 2
    // squares ahead of the apex, inside the outline, take a level.
    let mut count_changed=(0..n).filter(|&i|map.heights[i]!=before.heights[i]).count();
    if count_changed<9 {
        let mut squares:Vec<(f64,usize)>=vec![];
        for y in 0..h.saturating_sub(1){for x in 0..w.saturating_sub(1){let j=y*w+x;let sq=[j,j+1,j+w,j+w+1];
            if sq.iter().any(|&k|room[k]==0||outlet[k]!=0||map.heights[k]!=before.heights[k]||before.heights[k] as f64+1.0>ceiling){continue;}
            let (dx,dy)=(x as f64+0.5-mouth.x,y as f64+0.5-mouth.y);
            squares.push((hypot(dx,dy)+if dx*dir.x+dy*dir.y<0.0{6.0}else{0.0},j));
        }}
        squares.sort_by(|a,b|a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
        for (_,j) in squares{if count_changed>=9{break;}let sq=[j,j+1,j+w,j+w+1];
            if sq.iter().any(|&k|map.heights[k]!=before.heights[k]){continue;}
            for k in sq{map.heights[k]+=1;}count_changed+=4;
        }
        if keep_footprints(before,&mut map){
            // (a footprint took a square back: what it left of it goes too)
            for i in 0..n{if map.heights[i]>before.heights[i]{let (x,y)=(i%w,i/w);
                let body=(0..=1).any(|oy|(0..=1).any(|ox|{if x<ox||y<oy||x-ox+1>=w||y-oy+1>=h{return false;}let j=(y-oy)*w+x-ox;
                    [j,j+1,j+w,j+w+1].iter().all(|&k|map.heights[k]>before.heights[k])}));
                if !body{map.heights[i]=before.heights[i];}}}
        }
    }
    let deposited:i64=(0..n).map(|i|(map.heights[i] as i64-before.heights[i] as i64).max(0)).sum();
    // (nothing laid: the player's Keep or working area holds the whole outline, or the map has no room there)
    if deposited==0{
        map.heights.copy_from_slice(&before.heights);
        map.error=if (0..n).any(|i|inside[i]>=0.0&&(keep.get(i).copied().unwrap_or(0)!=0||area.get(i).copied()==Some(0))){32}else{34};
    }
    // The playback's stages: the channels as they open, first one side's, then the other's, then all.
    let mut stages=vec![0u8;n*3];
    for stage in 0..2{for (b,branch) in branches.iter().enumerate(){for (k,p) in branch.iter().enumerate(){let u=k as f64/(branch.len()-1) as f64;
        if u>0.16&&if stage==0{b>=(count+1)/2}else{b<count/2}{continue;}
        let shift=if wet{0.0}else{(noise(seed,u*5.0,2500.0+stage as f64*100.0+b as f64*17.0)-0.5)*4.0*smooth(u*5.0)};
        for d in [-0.5,0.0,0.5]{stages[stage*n+map.at(p.x-dir.y*(shift+d),p.y+dir.x*(shift+d))]=1;}
    }}}
    stages[2*n..].copy_from_slice(&channel);
    // When each tile arrives: the gully from its head down first, then the fan from its apex out to its toe.
    let mut arrival=vec![2.0f32;n];let mut stats=[0.0;11];stats[6]=count as f64;stats[7]=wet as u8 as f64;
    for i in 0..n{
        if map.heights[i]==before.heights[i]{continue;}
        let x=(i%w) as f64-mouth.x;let y=(i/w) as f64-mouth.y;
        arrival[i]=if !cut_d[i].is_nan()&&map.heights[i]<before.heights[i]{clamp(0.02+0.24*(1.0-cut_d[i]/max(1.0,length)),0.02,0.3)}
        else{let u=if fan[i]>0.0{along_of[i]}else{clamp(hypot(x,y)/reach,0.0,1.0)};let side=(-x*dir.y+y*dir.x)/max(1.0,width);
            clamp(0.3+u*0.5+0.06*smooth(side*sin(u*PI*3.0)*4.0+0.5)+noise(seed,(i%w) as f64/9.0,1800.0)*0.035,0.04,0.88)} as f32;
    }
    // what it changed, counted on the ground as it is left
    for i in 0..n{let dz=map.heights[i] as i32-before.heights[i] as i32;if dz!=0{stats[0]+=1.0;}if dz>0{stats[2]+=dz as f64;stats[5]=max(stats[5],dz as f64);}
        if dz<0{stats[1]-=dz as f64;stats[4]=max(stats[4],-dz as f64);stats[10]=max(stats[10],hypot((i%w) as f64-mouth.x,(i/w) as f64-mouth.y));}map.lava[i]&=mask(map.heights[i]);}
    stats[3]=stats[2]-stats[1];
    map.entities.retain(|e|{let i=e.y as usize*map.w+e.x as usize;let dz=map.heights[i] as i32-before.heights[i] as i32;
        let held=matches!(e.template.as_ref(),"WaterSource"|"BadwaterSource"|"WaterSeep"|"StartingLocation");
        let threshold=if e.template.as_ref()=="BlueberryBush"{2}else if plant(&e.template){3}else{4};
        if !held&&dz>=threshold{stats[8]+=1.0;false}else{if dz!=0{stats[9]+=1.0;}true}
    });
    ride(before,&mut map);let mut ids=vec![false;before.entities.iter().chain(map.entities.iter()).map(|e|e.id_key).max().unwrap_or(0)+1];
    for e in &map.entities{ids[e.id_key]=true;}map.fallen.retain(|f|ids.get(f.id_key).copied().unwrap_or(false));
    result(map,Records::Deposit(Box::new(DepositRecords{arrival,channel,stages,branches,mouth,direction:dir,reach,placement,width,stats})))
}
