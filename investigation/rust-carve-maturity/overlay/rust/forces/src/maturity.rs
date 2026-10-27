// Carve's Maturity (D355/D381/D444), built directly in typed Rust.
// Meander #106 is the behaviour reference: downstream-lagged curvature, balanced banks,
// a continuous native-bed thalweg, floodplain below the bluffs, and real neck cutoffs.
use super::*;

pub(super) fn auto(m: &Map, origin: usize, seed: u32) -> bool {
    let x=origin%m.w; let y=origin/m.w; let mut low=255u8; let mut high=0u8;
    for yy in y.saturating_sub(8)..=(y+8).min(m.h-1) {
        for xx in x.saturating_sub(8)..=(x+8).min(m.w-1) {
            let h=m.heights[yy*m.w+xx]; low=low.min(h); high=high.max(h);
        }
    }
    hash(seed as f64,6709.0)<0.8-0.65*min(1.0,(high-low) as f64/8.0)
}
fn adjacent(m:&Map,i:usize)->[Option<usize>;4] {
    let x=i%m.w;let y=i/m.w;
    [if x>0{Some(i-1)}else{None},if x+1<m.w{Some(i+1)}else{None},
     if y>0{Some(i-m.w)}else{None},if y+1<m.h{Some(i+m.w)}else{None}]
}
fn point(m:&Map,i:usize)->Point { Point{x:(i%m.w) as f64,y:(i/m.w) as f64} }
fn near(path:&[Point],p:Point)->(usize,f64) {
    let mut at=0;let mut best=f64::INFINITY;
    for (k,q) in path.iter().enumerate(){let dx=p.x-q.x;let dy=p.y-q.y;let d=dx*dx+dy*dy;
        if d<best {best=d;at=k;}}
    (at,portable_math::sqrt(best))
}
fn samples(path:&[Point],spacing:f64,limit:usize)->Vec<Point> {
    if path.len()<2{return path.to_vec();}
    let mut arc=vec![0.0];for pair in path.windows(2){arc.push(arc.last().unwrap()+hypot(pair[1].x-pair[0].x,pair[1].y-pair[0].y));}
    let length=*arc.last().unwrap();if length==0.0{return vec![path[0]];}
    let count=((length/spacing).ceil() as usize).min(limit-1).max(1);
    let mut out=Vec::with_capacity(count+1);let mut at=1;
    for k in 0..=count{let distance=length*k as f64/count as f64;
        while at+1<arc.len()&&arc[at]<distance{at+=1;}
        let t=(distance-arc[at-1])/max(1e-12,arc[at]-arc[at-1]);
        out.push(Point{x:path[at-1].x+(path[at].x-path[at-1].x)*t,y:path[at-1].y+(path[at].y-path[at-1].y)*t});}
    out
}
fn wet_near(m:&Map,p:Point)->bool {
    (-1..=1).any(|y|(-1..=1).any(|x|m.depth[m.at(p.x+x as f64,p.y+y as f64)]>0.015))
}
// A medial walk uses all flowing source types, including badwater; no source or wet tile is invented.
fn existing(m:&Map,intent:&Intent,aimed:bool)->Option<(Vec<Point>,f64)> {
    let start=point(m,intent.origin as usize);
    if !wet_near(m,start){return None;}
    let mut gesture=vec![start];gesture.extend(intent.via.iter().map(|&i|point(m,i)));
    if aimed&&intent.end!=intent.origin{gesture.push(point(m,intent.end as usize));}
    if samples(&gesture,2.0,512).iter().any(|&p|!wet_near(m,p)){return None;}
    let n=m.heights.len();let mut banks=vec![usize::MAX;n];let mut queue=vec![];
    for i in 0..n{if m.depth[i]<=0.015{banks[i]=0;queue.push(i);}}
    let mut q=0;while q<queue.len(){let i=queue[q];q+=1;
        for j in adjacent(m,i).into_iter().flatten(){if banks[j]>banks[i]+1{banks[j]=banks[i]+1;queue.push(j);}}}
    let model=force_water_model(m);let mut best:Option<Vec<Point>>=None;let mut closest=f64::INFINITY;
    for source in model.emitters.iter().filter(|e|e.strength>0.0){
        let mut cost=vec![f64::INFINITY;n];let mut parent=vec![usize::MAX;n];let mut heap=ForceHeap::default();
        for &i in &source.cells{for j in std::iter::once(i).chain(adjacent(m,i).into_iter().flatten()){
            if m.depth[j]>0.015{cost[j]=0.0;parent[j]=j;heap.push(0.0,j);}}}
        let anchor=point(m,*source.cells.first()?);let mut end=None;
        while let Some((key,i))=heap.pop(){if key!=cost[i]{continue;}let p=point(m,i);
            if (i%m.w==0||i%m.w==m.w-1||i/m.w==0||i/m.w==m.h-1)&&hypot(p.x-anchor.x,p.y-anchor.y)>min(40.0,m.w.min(m.h) as f64*0.4){end=Some(i);break;}
            for j in adjacent(m,i).into_iter().flatten(){if m.depth[j]<=0.015{continue;}
                let radius=banks[j].min(m.w.max(m.h)) as f64;let next=key+1.0+8.0/(radius*radius+0.5);
                if next<cost[j]{cost[j]=next;parent[j]=i;heap.push(next,j);}}}
        if let Some(mut i)=end{let mut path=vec![];loop{path.push(point(m,i));if parent[i]==i{break;}i=parent[i];}path.reverse();
            let distance=near(&path,start).1;
            if path.len()>=12&&distance<closest{closest=distance;best=Some(path);}}
    }
    let mut path=samples(&best?,2.0,180);if closest>6.0{return None;}
    for _ in 0..3{let old=path.clone();for k in 1..path.len()-1{path[k]=Point{x:(old[k-1].x+2.0*old[k].x+old[k+1].x)*0.25,y:(old[k-1].y+2.0*old[k].y+old[k+1].y)*0.25};}}
    let mut widths:Vec<_>=path.iter().skip(3).take(path.len().saturating_sub(6)).map(|p|banks[m.at(p.x,p.y)].min(m.w) as f64*2.0-1.0).collect();
    widths.sort_by(|a,b|a.total_cmp(b));let width=clamp(widths.get(widths.len()*2/5).copied().unwrap_or(3.0),2.5,7.0);
    Some((path,width))
}
fn empty(m:Map,s:&CarveSettings,options:&CarveOptions,intent:&Intent)->Plan {
    let at=intent.origin as usize;let head=CarveHead{x:(at%m.w) as f64,y:(at/m.w) as f64,z:m.heights[at] as f64,dx:1.0,dy:0.0,width:s.natural_width(),event:"surge",cut:0.0,lanes:vec![]};
    let mut heads=vec![];carve_head_record(&head,&mut heads);let head_len=heads.len() as u32;
    let mut metrics=vec![0.0;14];metrics[13]=2.0;
    let r=CarveRecords{initial_entities:m.entities.clone(),raw_changes:vec![],raw_offsets:vec![0,0],step_metrics:metrics,
        step_object_changes:vec![],oxbows:vec![],oxbow_basin:vec![],retained:None,unleashed:options.unleashed.clone(),bad:options.bad,
        total:0,metrics:[0.0;13],reason:"destination",changes:vec![],change_offsets:vec![0,0],heads,head_offsets:vec![0,head_len],
        path:vec![],path_offsets:vec![0],lengths:vec![0],removed:vec![],spread:vec![],group:vec![],closure:None,
        strength_depth:None,knobs:vec![],rock:vec![0;m.heights.len()],sediment:vec![0;m.heights.len()],curve:vec![],maturity:None};
    Plan{raw:Some(m.clone()),map:m,records:Records::Carve(Box::new(r)),literal:Literal::default(),geometry:vec![],objects:vec![],fallen:vec![],
        raw_objects:vec![],raw_fallen:vec![],step_objects:vec![],closure_objects:vec![],closure_fallen:vec![],literal_objects:vec![],
        before:None,before_objects:vec![],before_fallen:vec![]}
}
fn stations(m:&Map,path:&[Point],width:f64)->Vec<CarveStation> {
    path.iter().enumerate().map(|(k,p)|{let a=path[k.saturating_sub(1)];let b=path[(k+1).min(path.len()-1)];let d=max(1e-12,hypot(b.x-a.x,b.y-a.y));
        CarveStation{x:p.x,y:p.y,bed:m.heights[m.at(p.x,p.y)] as f64,width:width*0.5,dx:(b.x-a.x)/d,dy:(b.y-a.y)/d,bend:0.0,lanes:vec![]}}).collect()
}
fn grid(m:&Map,path:&[Point])->(Vec<f64>,Vec<usize>){
    let mut distance=vec![f64::INFINITY;m.heights.len()];let mut index=vec![0;m.heights.len()];
    for (k,p) in path.iter().enumerate(){let r=18.0;
        for y in max(0.0,(p.y-r).floor()) as usize..=min((m.h-1) as f64,(p.y+r).ceil()) as usize{
            for x in max(0.0,(p.x-r).floor()) as usize..=min((m.w-1) as f64,(p.x+r).ceil()) as usize{
                let i=y*m.w+x;let d=hypot(x as f64-p.x,y as f64-p.y);if d<distance[i]{distance[i]=d;index[i]=k;}}}}
    (distance,index)
}
// Whole blocks pair before the target is committed. Insufficient room reduces bank work;
// an essential thalweg cut is never partly applied or filled by a point bar.
fn balance(m:&Map,target:&mut[u8],channel:&[u8],keep:&[u8],beds:&[u8],idx:&[usize],valley:&[u8])->bool {
    let mut cuts=vec![];let mut fills=vec![];let mut amount=0usize;let mut capacity=0usize;
    for i in 0..target.len(){if keep.get(i).copied().unwrap_or(0)!=0{target[i]=m.heights[i];}
        if target[i]<m.heights[i]{cuts.push(i);amount+=(m.heights[i]-target[i]) as usize;}
        if target[i]>m.heights[i]&&channel[i]==0{fills.push(i);capacity+=(target[i]-m.heights[i]) as usize;}}
    // When inside bars alone are too small, spread sediment over the low floodplain.
    if capacity<amount{for i in 0..target.len(){if valley[i]==0||channel[i]!=0||keep.get(i).copied().unwrap_or(0)!=0||i%m.w<2||i%m.w>=m.w-2||i/m.w<2||i/m.w>=m.h-2{continue;}
        let z=beds[idx[i]];let top=(z.saturating_add(3)).min(m.ceiling as u8);
        if m.heights[i]>=top||target[i]<m.heights[i]||target[i]>m.heights[i]{continue;}
        // idx is only used inside the original valley's distance grid by callers.
        fills.push(i);target[i]=top;capacity+=(top-m.heights[i]) as usize;}}
    cuts.sort_by_key(|&i|(channel[i]==0,i));fills.sort_by_key(|&i|(m.heights[i],i));
    let usable=amount.min(capacity);let mandatory:usize=cuts.iter().filter(|&&i|channel[i]!=0).map(|&i|(m.heights[i]-target[i]) as usize).sum();
    if usable<mandatory{return false;}
    let mut remaining=usable;for i in cuts{let cut=remaining.min((m.heights[i]-target[i]) as usize);target[i]=m.heights[i]-cut as u8;remaining-=cut;}
    remaining=usable;for i in fills{let add=remaining.min((target[i]-m.heights[i]) as usize);target[i]=m.heights[i]+add as u8;remaining-=add;}
    true
}
fn route(m:&Map,path:&[Point],original:&[Point],beds:&[u8],target:&mut[u8],channel:&mut[u8],floor:u8,lo:usize,hi:usize){
    let mut last=None;
    let mut stamp=|i:usize,z:u8|{channel[i]=1;target[i]=target[i].min(z.max(m.heights[i].min(floor)));};
    for p in samples(path,0.45,1600){let k=near(original,p).0;let i=m.at(p.x,p.y);
        if k<lo||k>hi{last=Some(i);continue;}
        if let Some(j)=last{if j%m.w!=i%m.w&&j/m.w!=i/m.w{let a=j/m.w*m.w+i%m.w;let b=i/m.w*m.w+j%m.w;stamp(if m.heights[a]<=m.heights[b]{a}else{b},beds[k]);}}
        stamp(i,beds[k]);last=Some(i);}
}
fn age_map(base:&Map,previous:&Map,original:&[Point],course:&[Point],beds:&[u8],width:f64,s:&CarveSettings,keep:&[u8],lo:usize,hi:usize,old_d:&[f64],old_k:&[usize])->Option<Map>{
    let active=samples(course,0.65,650);let (d,k)=grid(base,&active);let active_k:Vec<_>=active.iter().map(|&p|near(course,p).0).collect();
    let mut target=base.heights.clone();let mut channel=vec![0;target.len()];let floor=s.floor as u8;
    for i in 0..target.len(){let at=old_k[i];let t=(at as f64-lo as f64)/max(1.0,(hi-lo) as f64);let fade=smooth(t*5.0)*smooth((1.0-t)*5.0);
        if at<lo||at>hi||old_d[i]>16.0||fade<=0.0||keep.get(i).copied().unwrap_or(0)!=0{continue;}
        let h=base.heights[i];let z=beds[at];let flood=z as f64+max(1.0,base.depth[base.at(original[at].x,original[at].y)].ceil());
        if h as f64>flood+4.0{continue;}
        let radius=width*0.5*(1.0+0.12*sin(k[i] as f64*0.071));
        if d[i]<=radius{channel[i]=1;target[i]=h.min(beds[active_k[k[i]]].max(h.min(floor)));}
        else if old_d[i]<radius+1.2{target[i]=h.max(min(base.ceiling,flood) as u8);}
        else if old_d[i]<min(15.0,width+4.0+s.power*0.02)&&h as f64>flood{
            target[i]=max(h.min(floor) as f64,round(h as f64-(h as f64-flood)*fade*(0.08+s.power*0.006))) as u8;}
    }
    route(base,course,original,beds,&mut target,&mut channel,floor,lo,hi);
    // Keep prevents a course crossing locked land; reject that migration increment, not the force.
    if (0..target.len()).any(|i|channel[i]!=0&&keep.get(i).copied().unwrap_or(0)!=0&&target[i]!=base.heights[i]){return None;}
    let valley:Vec<_>=(0..target.len()).map(|i|(old_d[i]<16.0&&old_k[i]>=lo&&old_k[i]<=hi) as u8).collect();
    if !balance(base,&mut target,&channel,keep,beds,old_k,&valley){return None;}
    let mut m=previous.clone();m.heights=target;
    for i in 0..m.heights.len(){m.lava[i]=base.lava[i]&mask(m.heights[i]);}
    Some(m)
}
fn record_stage(m:&mut Map,previous:&Map,r:&mut CarveRecords,course:&[Point],width:f64,event:&'static str){
    r.total+=1;let step=r.total;let mut cut=0.0;let mut fill=0.0;let mut changed=0usize;let mut sx=0usize;let mut sy=0usize;
    for i in 0..m.heights.len(){let dz=m.heights[i] as i32-previous.heights[i] as i32;
        if dz!=0{changed+=1;sx+=i%m.w;sy+=i/m.w;r.changes.extend([i as i32,m.heights[i] as i32]);r.raw_changes.extend([i as i32,m.heights[i] as i32]);}
        if dz<0{cut-=dz as f64;}else{fill+=dz as f64;}}
    debug_assert_eq!(cut,fill);
    r.change_offsets.push(r.changes.len() as u32);r.raw_offsets.push(r.raw_changes.len() as u32);
    r.metrics[0]+=cut;r.metrics[1]+=fill;r.metrics[6]=step as f64;r.metrics[7]=0.0;
    let mut metrics=r.metrics.to_vec();metrics.push(2.0);r.step_metrics.extend(metrics);
    let middle=if changed>0{course[near(course,Point{x:sx as f64/changed as f64,y:sy as f64/changed as f64}).0]}else{course[course.len()/2]};let at=m.at(middle.x,middle.y);
    carve_head_record(&CarveHead{x:middle.x,y:middle.y,z:m.heights[at] as f64,dx:1.0,dy:0.0,width,event,cut,lanes:vec![]},&mut r.heads);
    r.head_offsets.push(r.heads.len() as u32);r.lengths.push(course.len() as u32);
    let mut gone=vec![];
    m.entities.retain_mut(|e|{let source=matches!(e.template.as_ref(),"WaterSource"|"BadwaterSource"|"WaterSeep"|"StartingLocation");
        if !source&&previous.footprint(e,0).iter().any(|&i|m.heights[i]<previous.heights[i]){gone.push(e.slot);return false;}
        let i=e.y as usize*m.w+e.x as usize;let dz=m.heights[i] as f64-previous.heights[i] as f64;
        if dz!=0.0{e.z+=dz;e.raw_removed=true;r.step_object_changes.extend([step as f64,e.slot as f64,e.x,e.y,e.z]);}true});
    for slot in gone{if !r.removed.iter().any(|&(q,_)|q==slot){r.removed.push((slot,step));r.spread.push((slot,step));}}
    let heights=&m.heights;
    m.fallen.retain_mut(|f|{if r.removed.iter().any(|&(q,t)|q==f.slot&&t<=step){return false;}
        let i=previous.at(f.x,f.y);f.z+=heights[i] as f64-previous.heights[i] as f64;true});
}
fn move_water(base:&Map,map:&mut Map,original:&[Point],course:&[Point],width:f64,lo:usize,hi:usize){
    let mut depth=base.depth.clone();let mut mass:Vec<_>=depth.iter().zip(&base.contamination).map(|(d,c)|d*c).collect();let mut moves=vec![];
    for i in 0..depth.len(){if depth[i]<=0.015{continue;}let p=point(base,i);let(k,d)=near(original,p);
        if k<lo||k>hi||d>width*1.4{continue;}let q=course[k];let o=original[k];let j=map.at(p.x+q.x-o.x,p.y+q.y-o.y);moves.push((i,j,depth[i],mass[i]));}
    for &(i,_,d,c) in &moves{depth[i]-=d;mass[i]-=c;}for &(_,j,d,c) in &moves{depth[j]+=d;mass[j]+=c;}
    map.contamination=depth.iter().zip(&mass).map(|(d,c)|if *d>0.0{clamp(c/d,0.0,1.0)}else{0.0}).collect();map.depth=depth;
}
pub(super) fn plan(before:&Map,map:Map,s:&CarveSettings,intent:&Intent,keep:&[u8],options:CarveOptions)->Plan{
    let existing=existing(before,intent,s.aimed);let is_existing=existing.is_some();
    let mut p=if is_existing{empty(map,s,&options,intent)}else{carve_young(before,map,s,intent,keep,options)};
    let r=match &mut p.records{Records::Carve(r)=>r,_=>unreachable!()};let young_steps=r.total;
    let (original,width)=if let Some((path,width))=existing{(path,width)}else{
        let points=r.path_offsets.windows(2).map(|w|Point{x:r.path[w[0] as usize],y:r.path[w[0] as usize+1]}).collect();
        (points,clamp(s.width.unwrap_or(s.natural_width()),2.5,12.0))};
    if original.len()<6{return p;}
    let base=p.map.clone();let beds:Vec<_>=original.iter().map(|q|base.heights[base.at(q.x,q.y)]).collect();let mut course=original.clone();
    let (old_d,old_k)=grid(&base,&original);let mut lo=2;let mut hi=original.len()-3;
    if is_existing&&s.aimed{let a=near(&original,point(before,intent.origin as usize)).0;let b=near(&original,point(before,intent.end as usize)).0;lo=a.min(b).max(2);hi=a.max(b).min(original.len()-3);
        if lo==hi{lo=lo.saturating_sub(6);hi=(hi+6).min(original.len()-3);}}
    if hi<lo{std::mem::swap(&mut lo,&mut hi);}if hi-lo<6{lo=lo.saturating_sub(4);hi=(hi+4).min(original.len()-3);}
    let rounds=(round(s.power*0.8) as usize).max(12);let stride=(rounds+7)/8;let scale=if width>4.5{9}else{6};let mut bluff=0.0;
    if young_steps>0{r.step_metrics[young_steps*14+7]=0.0;}
    for round in 0..rounds{let mut next=course.clone();
        for k in lo..=hi{if beds[k]<s.floor as u8{continue;}let p0=course[k];let a=course[k.saturating_sub(scale)];let b=course[(k+scale).min(course.len()-1)];let prev=course[k.saturating_sub(2)];
            let length=max(1e-12,hypot(b.x-a.x,b.y-a.y));let nx=-(b.y-a.y)/length;let ny=(b.x-a.x)/length;let fade=smooth((k-lo) as f64/5.0)*smooth((hi-k) as f64/5.0);
            let curve=(p0.x-(a.x+b.x)*0.5)*nx+(p0.y-(a.y+b.y)*0.5)*ny;let phase=k as f64/(scale as f64*1.5)+hash(s.seed as f64,31.0)*6.0;
            let initiation=sin(phase+0.33*sin(phase*0.47))*0.13*(1.0-round as f64/rounds as f64);
            let motion=clamp(curve*0.18+initiation,-0.75,0.75)*fade;
            let q=Point{x:p0.x+nx*motion+(p0.x-prev.x)*0.028*fade,y:p0.y+ny*motion+(p0.y-prev.y)*0.028*fade};let o=original[k];
            if q.x<2.0||q.y<2.0||q.x>base.w as f64-3.0||q.y>base.h as f64-3.0||hypot(q.x-o.x,q.y-o.y)>3.0+s.power*0.2||base.heights[base.at(q.x,q.y)]>beds[k].saturating_add(5){bluff+=1.0;continue;}next[k]=q;}
        course=next;
        if round%stride==stride-1||round==rounds-1{if let Some(mut m)=age_map(&base,&p.map,&original,&course,&beds,width,s,keep,lo,hi,&old_d,&old_k){
            record_stage(&mut m,&p.map,r,&course,width,"surge");move_water(&base,&mut m,&original,&course,width,lo,hi);p.map=m;}}
    }
    // Neck closure is implemented below as a conserved final age increment.
    cutoff(&base,&mut p.map,r,&mut course,width,s,keep,lo,hi);
    r.path.clear();r.path_offsets=vec![0];for q in stations(&p.map,&course,width){r.path.extend([q.x,q.y,q.bed,q.width,q.dx,q.dy,q.bend,0.0]);r.path_offsets.push(r.path.len() as u32);}
    let changed=p.map.heights.iter().zip(&base.heights).filter(|(a,b)|a!=b).count();
    let cut:usize=p.map.heights.iter().zip(&base.heights).map(|(&h,&b)|b.saturating_sub(h) as usize).sum();let fill:usize=p.map.heights.iter().zip(&base.heights).map(|(&h,&b)|h.saturating_sub(b) as usize).sum();debug_assert_eq!(cut,fill);
    let mut stats=vec![young_steps as f64,rounds as f64,cut as f64,fill as f64,r.oxbows.len() as f64,bluff,is_existing as u8 as f64,changed as f64];
    for p in &original {stats.extend([p.x,p.y]);}r.maturity=Some(stats);
    r.metrics[6]=r.total as f64;r.metrics[7]=1.0;r.metrics[12]=r.oxbows.len() as f64;r.reason="destination";
    if r.total>0{r.step_metrics[r.total*14+7]=1.0;r.step_metrics[r.total*14+12]=r.oxbows.len() as f64;}
    if is_existing&&changed==0{p.map.error=27;}
    p.raw=Some(p.map.clone());p
}
fn cutoff(base:&Map,map:&mut Map,r:&mut CarveRecords,course:&mut Vec<Point>,width:f64,s:&CarveSettings,keep:&[u8],lo:usize,hi:usize) {
    if s.power<85.0{return;}
    let dense=samples(course,1.35,400);let lo=near(&dense,course[lo]).0;let hi=near(&dense,course[hi]).0;
    let path=stations(map,&dense,width);let mut candidates=vec![];
    for k in 26..path.len().saturating_sub(3){if let Some(cut)=carve_neck(&path[..=k],r.total+1){
        if cut.start>=lo&&cut.end<=hi&&cut.pool.iter().all(|q|(q.bed-cut.pool[0].bed).abs()<=2.0){candidates.push(cut);}}}
    candidates.sort_by_key(|c|(c.pool.len(),c.start,c.end));
    for mut cut in candidates.into_iter().take(8){
        let pool:Vec<_>=cut.pool.iter().map(|q|Point{x:q.x,y:q.y}).collect();
        let (pd,_)=grid(map,&pool);let (nd,_)=grid(map,&cut.neck);let (od,ok)=grid(map,&dense);
        let floor=s.floor as u8;let bed=cut.pool.iter().map(|q|map.heights[map.at(q.x,q.y)]).min().unwrap().max(floor);
        let rim=bed.saturating_add(2).min(map.ceiling as u8);let mut target=map.heights.clone();let mut channel=vec![0;target.len()];
        let mut next=dense[..cut.start].to_vec();next.extend_from_slice(&cut.neck);next.extend_from_slice(&dense[cut.end+1..]);
        for i in 0..target.len(){if keep.get(i).copied().unwrap_or(0)!=0||ok[i]<lo||ok[i]>hi{continue;}
            let p=point(map,i);let old=target[i];
            if pd[i]<width*0.55{target[i]=target[i].min(bed);}
            else if pd[i]<width*0.55+2.2&&nd[i]>width*0.5+2.0{target[i]=target[i].max(rim);}
            for bar in &cut.bars{let dx=p.x-bar.x;let dy=p.y-bar.y;let along=dx*bar.dx+dy*bar.dy;let side=-dx*bar.dy+dy*bar.dx;
                if along.abs()<2.2&&side.abs()<bar.width+2.0&&nd[i]>width*0.5+1.0{target[i]=target[i].max(rim);}}
            if nd[i]<width*0.5+0.4 {let (k,_)=near(&cut.neck,p);let head=map.heights[map.at(cut.neck[0].x,cut.neck[0].y)];let tail=map.heights[map.at(cut.neck.last().unwrap().x,cut.neck.last().unwrap().y)];
                let z=round(head as f64+(tail.min(head) as f64-head as f64)*k as f64/(cut.neck.len()-1) as f64) as u8;target[i]=target[i].min(z.max(old.min(floor)));channel[i]=1;}
            target[i]=target[i].max(old.min(floor));
        }
        let next_stations=stations(map,&next,width);let next_beds:Vec<_>=next_stations.iter().map(|q|q.bed as u8).collect();
        route(map,&next,&next,&next_beds,&mut target,&mut channel,floor,0,next.len()-1);
        // These cuts are the material for the two mouths and inside bars; neither is free earth.
        let need:usize=target.iter().zip(&map.heights).map(|(&h,&b)|h.saturating_sub(b) as usize).sum();
        let mut supply:usize=target.iter().zip(&map.heights).map(|(&h,&b)|b.saturating_sub(h) as usize).sum();
        for i in 0..target.len(){if supply>=need{break;}
            if keep.get(i).copied().unwrap_or(0)!=0||channel[i]!=0||pd[i]<width*0.7||pd[i]>width+6.0||ok[i]<lo||ok[i]>hi||target[i]>rim.saturating_add(4){continue;}
            let available=target[i].saturating_sub(floor.max(bed.saturating_add(1))).min(4) as usize;
            let take=available.min(need-supply);target[i]-=take as u8;supply+=take;
        }
        if supply<need{continue;}
        let valley:Vec<_>=(0..target.len()).map(|i|(od[i]<16.0&&pd[i]>width+2.0&&ok[i]>=lo&&ok[i]<=hi) as u8).collect();
        let beds:Vec<_>=dense.iter().map(|q|map.heights[map.at(q.x,q.y)]).collect();
        if !balance(map,&mut target,&channel,keep,&beds,&ok,&valley){continue;}
        let root=map.at(pool[pool.len()/2].x,pool[pool.len()/2].y);let mut seen=vec![false;target.len()];let mut basin=vec![];
        if target[root]<rim{seen[root]=true;basin.push(root);}let mut at=0;
        while at<basin.len(){let i=basin[at];at+=1;for j in adjacent(map,i).into_iter().flatten(){if !seen[j]&&target[j]<rim{seen[j]=true;basin.push(j);}}}
        let model=force_water_model(map);
        if basin.len()<4||basin.iter().any(|&i|i%map.w==0||i%map.w==map.w-1||i/map.w==0||i/map.w==map.h-1)
            ||next.iter().any(|q|seen[map.at(q.x,q.y)])||model.emitters.iter().any(|e|e.cells.iter().any(|&i|seen[i])){continue;}
        // Store actual pre-closure water, using the adopted game's rules and RetainedWater path.
        let sim=force_canonical_settle(&model,r.retained.as_ref());
        let mut wet:Vec<_>=basin.into_iter().filter(|&i|sim.d[i]>0.0).collect();wet.sort_unstable();if wet.len()<4{continue;}
        let mut retained=r.retained.take().unwrap_or(RetainedWater{tiles:vec![],floor:vec![],depth:vec![],contamination:vec![]});
        for &i in &wet{if !retained.tiles.contains(&i){retained.tiles.push(i);retained.floor.push(target[i] as f64);retained.depth.push(sim.d[i]);retained.contamination.push(sim.c[i]);}}
        // The literal operation requires one strictly ordered row per retained tile.
        let mut order:Vec<_>=(0..retained.tiles.len()).collect();order.sort_by_key(|&k|retained.tiles[k]);
        let retained=RetainedWater{tiles:order.iter().map(|&k|retained.tiles[k]).collect(),floor:order.iter().map(|&k|retained.floor[k]).collect(),depth:order.iter().map(|&k|retained.depth[k]).collect(),contamination:order.iter().map(|&k|retained.contamination[k]).collect()};
        let previous=map.clone();let mut m=map.clone();m.heights=target;for i in 0..m.heights.len(){m.lava[i]&=mask(m.heights[i]);}
        for &i in &wet{m.depth[i]=sim.d[i];m.contamination[i]=sim.c[i];}
        r.closure=Some(previous.clone());r.retained=Some(retained);r.oxbow_basin.extend(&wet);cut.step=r.total+1;cut.floor=bed as f64;
        record_stage(&mut m,&previous,r,&next,width,"oxbow");r.oxbows.push(cut);*map=m;*course=next;break;
    }
    let _=base;
}
