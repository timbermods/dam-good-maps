// Built directly in Rust (D438/D444). Behaviour/look reference: Deposit round 2, approved #114/D364.
use super::*;
use super::rift::{noise, result, ride};

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
fn receiving(m:&Map,origin:Point,drawn:bool,floor:u8,power:f64)->(Point,u32) {
    let h=m.heights[m.at(origin.x,origin.y)];let mut lo=h;let mut hi=h;
    for y in (-5..=5).step_by(2) {for x in (-5..=5).step_by(2) {let v=m.heights[m.at(origin.x+x as f64,origin.y+y as f64)];lo=lo.min(v);hi=hi.max(v);}}
    let mut units=0u32;let cut=(0.6+power*4.4).ceil() as u8;
    for i in 0..m.heights.len() {
        let v=m.heights[i]; if hypot((i%m.w) as f64-origin.x,(i/m.w) as f64-origin.y)<=48.0&&v>h&&v>floor {units+=(v-floor).min(cut) as u32;}
    }
    if units>=round(48.0+power*160.0) as u32 {
        if m.depth[m.at(origin.x,origin.y)]>0.08{return (origin,3);}
        if drawn||h-lo<3&&(h as f64)<m.ceiling-1.0{return(origin,if hi-lo<2{2}else{0});}
    }
    let mut best=f64::INFINITY;let mut mouth=origin;
    for i in 0..m.heights.len() {
        let d=hypot((i%m.w) as f64-origin.x,(i/m.w) as f64-origin.y);let v=m.heights[i];
        if v as i32>h as i32-2||d>48.0||d<3.0 {continue;}
        let score=d+v as f64*2.5;if score<best {best=score;mouth=Point{x:(i%m.w) as f64,y:(i/m.w) as f64};}
    }
    if best==f64::INFINITY&&hi-lo<2 {
        // An edge click on a flat needs an upstream apron inside the map, not outside it.
        let inset=8.0;mouth=Point{x:clamp(origin.x,min(inset,(m.w-1) as f64*0.25),(m.w-1) as f64-min(inset,(m.w-1) as f64*0.25)),y:clamp(origin.y,min(inset,(m.h-1) as f64*0.25),(m.h-1) as f64-min(inset,(m.h-1) as f64*0.25))};
    }
    (mouth,if best==f64::INFINITY&&hi-lo<2{2}else if hi<=h{4}else{1})
}
fn heading(m:&Map,mouth:Point,last:Point,drawn:bool,reach:f64)->Point {
    let base=if drawn{portable_math::atan2(last.y-mouth.y,last.x-mouth.x)}else{0.0};let mut best=f64::INFINITY;let mut angle=base;
    for k in 0..if drawn{9}else{32} {
        let a=if drawn{base+(k as f64-4.0)*0.075}else{k as f64*std::f64::consts::PI/16.0};let mut score=0.0;
        for d in [6.0,12.0,20.0] {for side in [-0.22,0.0,0.22] {
            let x=mouth.x+cos(a+side)*min(d,reach);let y=mouth.y+sin(a+side)*min(d,reach);
            let i=m.at(x,y);let b=m.at(mouth.x-cos(a)*d,mouth.y-sin(a)*d);
            score+=m.heights[i] as f64*1.4-m.heights[b] as f64*0.35;
            if x<0.0||y<0.0||x>=m.w as f64||y>=m.h as f64{score+=8.0;}
        }}
        if drawn{score+=(a-base).abs()*80.0;}if score<best{best=score;angle=a;}
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
struct Offer {i:usize,target:u8,rank:f64,u:f64}
struct Donor {i:usize,target:u8,rank:f64}
// Shape the original cone with its original material budget. Connections spend real
// sediment; excess column height pays for them, never discarded lobes or volume.
fn component(m:&Map,add:&[u8],root:usize)->Vec<bool> {
    let mut seen=vec![false;add.len()];let mut queue=vec![root];seen[root]=true;let mut at=0;
    while at<queue.len(){let i=queue[at];at+=1;for j in neighbours(m,i).into_iter().flatten(){if add[j]>0&&!seen[j]{seen[j]=true;queue.push(j);}}}seen
}
fn peel(m:&Map,add:&[u8],i:usize)->bool {
    let adjacent:Vec<_>=neighbours(m,i).into_iter().flatten().filter(|&j|add[j]>0).collect();
    if adjacent.is_empty(){return false;}let mut queue=vec![adjacent[0]];let mut at=0;
    while at<queue.len(){let j=queue[at];at+=1;for k in neighbours(m,j).into_iter().flatten(){
        if k!=i&&add[k]>0&&(k%m.w).abs_diff(i%m.w)<=1&&(k/m.w).abs_diff(i/m.w)<=1&&!queue.contains(&k){queue.push(k);}
    }}adjacent.iter().all(|j|queue.contains(j))
}
fn supported(m:&Map,bed:&[u8],add:&[u8],i:usize,height:u8)->bool {
    height<=neighbours(m,i).into_iter().flatten().map(|j|bed[j]+add[j]).max().unwrap_or(0).saturating_add(2)
}
fn safe_lower(m:&Map,bed:&[u8],add:&mut[u8],i:usize)->bool {
    add[i]-=1;let safe=neighbours(m,i).into_iter().flatten().all(|j|add[j]==0||supported(m,bed,add,j,bed[j]+add[j]));add[i]+=1;safe
}
fn shape(m:&Map,offers:&[Offer],bed:&[u8],room:&[u8],outlet:&[u8],budget:usize,mouth:Point,dir:Point)->Vec<u8> {
    let n=bed.len();let mut add=vec![0;n];if budget==0{return add;}let mut remaining=budget;let mut target=m.heights.clone();let mut rank=vec![10.0;n];
    for o in offers{target[o.i]=o.target;rank[o.i]=o.rank;let amount=remaining.min((o.target-m.heights[o.i]) as usize);add[o.i]=amount as u8;remaining-=amount;}
    let mut volume=budget-remaining;
    // Only the beds of donors actually cut enter the cap, not every possible cut.
    loop{let mut changed=false;for i in 0..n{if add[i]>0&&!supported(m,bed,&add,i,bed[i]+add[i]){
        let cap=neighbours(m,i).into_iter().flatten().map(|j|bed[j]+add[j]).max().unwrap_or(0).saturating_add(2);
        let next=cap.saturating_sub(bed[i]).min(add[i]);volume-=(add[i]-next) as usize;add[i]=next;changed=true;
    }}if !changed{break;}}
    let bounds=offers.iter().fold((m.w,0,m.h,0),|(x0,x1,y0,y1),o|(x0.min(o.i%m.w),x1.max(o.i%m.w),y0.min(o.i/m.w),y1.max(o.i/m.w)));
    let legal:Vec<bool>=(0..n).map(|i|room[i]>0&&outlet[i]==0&&bed[i]==m.heights[i]&&(m.heights[i] as f64)<m.ceiling
        &&i%m.w>=bounds.0.saturating_sub(8)&&i%m.w<=bounds.1.saturating_add(8)&&i/m.w>=bounds.2.saturating_sub(8)&&i/m.w<=bounds.3.saturating_add(8)).collect();
    // Preserve the original footprint's extent, including its separate lobes.
    let mut largest=vec![false;n];let mut visited=vec![false;n];let mut largest_count=0;
    for i in 0..n{if add[i]==0||visited[i]{continue;}let group=component(m,&add,i);let count=group.iter().filter(|&&v|v).count();
        for j in 0..n{visited[j]|=group[j];}if count>largest_count{largest=group;largest_count=count;}
    }
    let root=offers.iter().find(|o|largest[o.i]).map(|o|o.i).or_else(||(0..n).filter(|&i|legal[i]&&supported(m,bed,&add,i,bed[i]+1))
        .min_by(|&a,&b|hypot((a%m.w) as f64-mouth.x,(a/m.w) as f64-mouth.y).total_cmp(&hypot((b%m.w) as f64-mouth.x,(b/m.w) as f64-mouth.y))));
    let root=match root{Some(i)=>i,None=>return add};if add[root]==0&&budget>0{add[root]=1;volume+=1;}
    if budget<18{
        add.fill(0);add[root]=1;volume=1;
        while volume<budget.min(9){let best=(0..n).filter(|&i|legal[i]&&add[i]==0&&neighbours(m,i).into_iter().flatten().any(|j|add[j]>0)&&supported(m,bed,&add,i,bed[i]+1))
            .min_by(|&a,&b|{let score=|i:usize|hypot((i%m.w) as f64-mouth.x,(i/m.w) as f64-mouth.y)-neighbours(m,i).into_iter().flatten().filter(|&j|add[j]>0).count() as f64*2.0;score(a).total_cmp(&score(b))});
            match best{Some(i)=>{add[i]=1;volume+=1;},None=>break}
        }
        largest=component(m,&add,root);
    }
    let mut anchors=vec![root];
    for axis in 0..3{let extreme=(0..n).filter(|&i|largest[i]).max_by(|&a,&b|{
        let score=|i:usize|{let x=(i%m.w) as f64-mouth.x;let y=(i/m.w) as f64-mouth.y;match axis{0=>x*dir.x+y*dir.y,1=>-x*dir.y+y*dir.x,_=>x*dir.y-y*dir.x}};score(a).total_cmp(&score(b))
    });if let Some(i)=extreme{anchors.push(i);}}
    loop{
        let connected=component(m,&add,root);if (0..n).all(|i|add[i]==0||connected[i]){break;}
        let mut dist=vec![f64::INFINITY;n];let mut parent=vec![usize::MAX;n];let mut heap=ForceHeap::default();
        for i in 0..n{if connected[i]{dist[i]=0.0;parent[i]=i;heap.push(0.0,i);}}
        let mut goal=None;
        while let Some((key,i))=heap.pop(){if key!=dist[i]{continue;}if add[i]>0&&!connected[i]{goal=Some(i);break;}
            for j in neighbours(m,i).into_iter().flatten(){if !legal[j]||!supported(m,bed,&add,j,bed[j]+add[j].max(1)){continue;}
                let cost=key+if add[j]>0{0.1}else if target[j]>m.heights[j]{1.0}else{2.0};
                if cost<dist[j]{dist[j]=cost;parent[j]=i;heap.push(cost,j);}
            }
        }
        if let Some(mut i)=goal{while !connected[i]{if add[i]==0{add[i]=1;volume+=1;}i=parent[i];}}
        else{
            // A protected/capped barrier may genuinely divide the working ground.
            // Return its sediment to the receiving side, never strand detached tiles.
            for i in 0..n{if add[i]>0&&!connected[i]{volume-=add[i] as usize;add[i]=0;}}
            break;
        }
    }
    // Connections are paid for by the cone, preserving the original total volume.
    while volume>budget{
        let mut best=None;let mut score=f64::NEG_INFINITY;
        for i in 0..n{if add[i]==0||add[i]==1&&(anchors.contains(&i)||!peel(m,&add,i))||!safe_lower(m,bed,&mut add,i){continue;}
            let value=add[i] as f64*100.0+rank[i];if value>score{score=value;best=Some(i);}
        }
        match best{Some(i)=>{add[i]-=1;volume-=1;},None=>{if anchors.len()>1{anchors.truncate(1);}else{break;}}}
    }
    while volume<budget{
        let mut best=None;let mut score=f64::INFINITY;
        for i in 0..n{if !legal[i]||add[i]>=room[i]||bed[i] as f64+add[i] as f64>=m.ceiling
            ||!neighbours(m,i).into_iter().flatten().any(|j|add[j]>0)||!supported(m,bed,&add,i,bed[i]+add[i]+1){continue;}
            let adjacent=neighbours(m,i).into_iter().flatten().filter(|&j|add[j]>0).count();
            let value=if bed[i]+add[i]<target[i]{rank[i]+add[i] as f64*0.25}else{20.0+add[i] as f64*4.0-adjacent as f64};
            if value<score{score=value;best=Some(i);}
        }
        match best{Some(i)=>{add[i]+=1;volume+=1;},None=>break}
    }
    add
}
pub(super) fn plan(before:&Map,mut map:Map,s:&Settings,intent:&Intent,keep:&[u8],area:&[u8],channels:u32)->Plan {
    let n=map.heights.len();let power=max(0.025,s.power/100.0);let floor=s.floor.unwrap_or(1.0) as u8;
    let origin=intent.path[0];let last=*intent.path.last().unwrap();let drawn=intent.path.len()>1&&hypot(last.x-origin.x,last.y-origin.y)>1.0;
    let (mut mouth,mut placement)=receiving(before,origin,drawn,floor,power);
    let drawn=drawn&&hypot(last.x-mouth.x,last.y-mouth.y)>1.0;
    let width=s.size.unwrap_or(14.0+s.power*0.34);
    // Size is reach; Power changes the material/relief within it (D361). Full Power matches round 2.
    let reach=if drawn{clamp(hypot(last.x-mouth.x,last.y-mouth.y),4.0,112.0)}else{9.0+width*0.80};
    let dir=heading(before,mouth,last,drawn,reach);let width=if drawn{max(10.0,reach*0.95)}else{width};
    let mouth_h=before.heights[map.at(mouth.x,mouth.y)];let wet=(-3..=3).any(|y|(-3..=3).any(|x|before.depth[map.at(mouth.x+x as f64,mouth.y+y as f64)]>0.08));
    let datum_h=max(mouth_h as f64,if wet{(mouth_h as f64+before.depth[map.at(mouth.x,mouth.y)]).ceil()}else{mouth_h as f64});
    let outlet=if wet{outlet(before,mouth,dir)}else{vec![0;n]};
    let spine:Vec<(Point,f64)>=outlet.iter().enumerate().filter(|(_,v)|**v!=0).filter_map(|(i,_)|{let p=Point{x:(i%map.w) as f64,y:(i/map.w) as f64};let d=(p.x-mouth.x)*dir.x+(p.y-mouth.y)*dir.y;if d>=-1.0{Some((p,d))}else{None}}).collect();
    let count=if channels==1{2}else if channels==2{5}else if width>38.0{4}else{3};
    let mut branches=vec![];let mut channel=vec![0;n];
    for b in 0..count {let mut branch=vec![];let steps=(reach*2.0).ceil() as usize;
        for k in 0..=steps {let u=k as f64/steps as f64;let d=u*reach;let mut spread=(b as f64/(count-1) as f64-0.5)*width*0.85*smooth((u-0.1)/0.9);
            let wander=(noise(s.seed,d/10.0,400.0+b as f64*51.0)-0.5)*3.0*smooth(u*8.0);let mut p=Point{x:mouth.x+dir.x*d,y:mouth.y+dir.y*d};
            if wet&&!spine.is_empty(){let base=p;let mut best=f64::INFINITY;for &(q,along) in &spine{let score=(along-d).abs()*4.0+hypot(q.x-base.x,q.y-base.y)*0.1;if score<best{best=score;p=q;}}
                let mut left=0.0;let mut right=0.0;
                for side in [-1.0,1.0]{let mut v=0.5;while v<=width*0.48{let x=p.x-dir.y*v*side;let y=p.y+dir.x*v*side;if x<0.0||y<0.0||x>=map.w as f64||y>=map.h as f64||before.heights[map.at(x,y)]>mouth_h{break;}if side<0.0{left=-v;}else{right=v;}v+=0.5;}}
                spread=(left+(right-left)*b as f64/(count-1) as f64)*0.8*smooth((u-0.04)/0.25);spread=clamp(spread+wander*0.18,left*0.8,right*0.8);
            }
            let off=spread+if wet&&!spine.is_empty(){0.0}else{wander};p.x-=dir.y*off;p.y+=dir.x*off;
            paint(&map,&mut channel,p,if wet{0.85}else{1.15});branch.push(p);
        }branches.push(branch);
    }
    let mut stages=vec![0;n*3];
    for stage in 0..2{for (b,branch) in branches.iter().enumerate(){for(k,p)in branch.iter().enumerate(){let u=k as f64/(branch.len()-1) as f64;
        if u>0.16&&if stage==0{b>=(count+1)/2}else{b<count/2}{continue;}
        let shift=if wet{0.0}else{(noise(s.seed,u*5.0,2500.0+stage as f64*100.0+b as f64*17.0)-0.5)*4.0*smooth(u*5.0)};
        for d in [-0.5,0.0,0.5]{stages[stage*n+map.at(p.x-dir.y*(shift+d),p.y+dir.x*(shift+d))]=1;}
    }}}stages[2*n..].copy_from_slice(&channel);
    let mut distance=vec![u16::MAX;n];let mut queue=vec![];for i in 0..n{if channel[i]!=0{distance[i]=0;queue.push(i);}}
    let mut at=0;while at<queue.len(){let i=queue[at];at+=1;for j in neighbours(&map,i).into_iter().flatten(){if distance[j]>distance[i]+1{distance[j]=distance[i]+1;queue.push(j);}}}
    let mut offers=vec![];let mut donors=vec![];let mut expected=0.0;
    let room_at=|i:usize|if keep.get(i).copied().unwrap_or(0)!=0{0}else{area.get(i).copied().unwrap_or(255)};
    for i in 0..n {
        if room_at(i)==0{continue;}let h=before.heights[i];let dx=(i%map.w) as f64-mouth.x;let dy=(i/map.w) as f64-mouth.y;
        let along=dx*dir.x+dy*dir.y;let cross=-dx*dir.y+dy*dir.x;let u=along/reach;
        let lobe=0.72+0.38*noise(s.seed,cross/8.0,900.0)+0.12*noise(s.seed,along/12.0,700.0);
        let half=3.0+power*6.0+width*0.5*pow(clamp(u,0.0,1.0),0.78)*lobe;
        let offset=(noise(s.seed,along/12.0,2100.0)-0.5)*width*0.18*smooth(u*4.0);let toe=reach*(0.73+0.31*noise(s.seed,cross/7.0,1100.0));
        if along>=-3.0&&along<=toe&&(cross-offset).abs()<half{
            let edge=smooth((half-(cross-offset).abs())/6.0)*smooth((toe-along)/6.0);
            let datum=datum_h+1.7+power*if placement==2{3.0}else{7.0}-clamp(u,0.0,1.0)*(1.2+power*if placement==2{2.0}else{5.0});
            let relief=(noise(s.seed,along/17.0+cross/10.0,1400.0)-0.5)*1.35;
            let mut target=max(h as f64,min(map.ceiling,round(h as f64+max(0.0,datum+relief-h as f64)*edge))) as u8;
            if channel[i]!=0{target=if wet{target.min(h.max(mouth_h))}else{h.max(target.saturating_sub(1))};}
            if wet&&channel[i]==0{target=target.min(h.max(mouth_h.saturating_add(1).saturating_add((distance[i] as f64*0.8).floor() as u8)));}
            if outlet[i]!=0||wet&&before.depth[i]>0.08&&along<3.0{target=h;}
            if wet&&before.depth[i]>0.08&&(before.depth[i]<0.8||channel[i]!=0){target=target.min(h+1);}
            target=target.min(h.saturating_add(room_at(i)));
            if target>h{offers.push(Offer{i,target,rank:u+cross.abs()/max(1.0,half)*0.08+hash(s.seed,i as f64)*0.045,u});}
        }
        let back=-along;let upstream=reach*1.5+12.0;let dw=4.0+min(15.0,width*0.27)*smooth(back/12.0);
        if back>2.0&&back<upstream&&cross.abs()<dw&&h>floor&&h>=mouth_h&&before.depth[i]<=0.05{
            let want=0.6+power*4.4*(0.65+0.35*smooth((upstream-back)/15.0));let cut=(h-floor).min(want.ceil() as u8).min(room_at(i));
            expected+=min(cut as f64,want);if cut>0{donors.push(Donor{i,target:h-cut,rank:back/upstream+cross.abs()/dw*0.18+hash(s.seed,i as f64+70000.0)*0.05});}
        }
    }
    let mut offered=vec![false;n];for o in &offers{offered[o.i]=true;}donors.retain(|d|!offered[d.i]);
    let mut used=vec![false;n];for d in &donors{used[d.i]=true;}
    // Only higher shoulders supplement upstream material; a flat still cuts its upstream banks.
    for i in 0..n{let h=before.heights[i];let d=hypot((i%map.w) as f64-mouth.x,(i/map.w) as f64-mouth.y);
        if room_at(i)==0||used[i]||offered[i]||h<=floor.max(mouth_h)||d>max(48.0,width)||before.depth[i]>0.05{continue;}
        let cut=(h-floor).min((0.6+power*4.4).ceil() as u8).min(room_at(i));if cut==0{continue;}
        donors.push(Donor{i,target:h-cut,rank:1.5+d/max(48.0,width)+hash(s.seed,i as f64)*0.03});used[i]=true;expected+=cut as f64;
    }
    // Fully submerged terrain still has upstream sediment; prefer dry donors when available.
    if donors.is_empty(){for i in 0..n{
        let h=before.heights[i];let dx=(i%map.w) as f64-mouth.x;let dy=(i/map.w) as f64-mouth.y;
        let back=-(dx*dir.x+dy*dir.y);let cross=(-dx*dir.y+dy*dir.x).abs();let upstream=reach*1.5+12.0;
        if room_at(i)==0||offered[i]||outlet[i]!=0||h<=floor||h<mouth_h||back<=2.0||back>=upstream||cross>4.0+min(15.0,width*0.27){continue;}
        let cut=(h-floor).min((0.6+power*4.4).ceil() as u8).min(room_at(i));
        if cut>0{donors.push(Donor{i,target:h-cut,rank:back/upstream+cross/max(1.0,width)*0.18});used[i]=true;expected+=cut as f64;}
    }}
    // At a map edge or capped sector, put the same sediment into the nearest lower hollow.
    if offers.is_empty()&&!donors.is_empty(){let mut best=f64::INFINITY;let mut center=None;
        for i in 0..n{let h=before.heights[i];if room_at(i)==0||h>=mouth_h||h as f64>=map.ceiling{continue;}let d=hypot((i%map.w) as f64-origin.x,(i/map.w) as f64-origin.y);let score=d+h as f64*2.0;if score<best{best=score;center=Some(i);}}
        if let Some(i)=center{mouth=Point{x:(i%map.w) as f64,y:(i/map.w) as f64};placement=4;let radius=4.0+power*10.0;let datum=before.heights[i] as f64+1.0+power*4.0;
            for j in 0..n{if used[j]||room_at(j)==0||outlet[j]!=0{continue;}let d=hypot((j%map.w) as f64-mouth.x,(j/map.w) as f64-mouth.y);let h=before.heights[j];let target=max(h as f64,min(map.ceiling,round(datum-d/radius*(1.0+power*3.0)))) as u8;let target=target.min(h.saturating_add(room_at(j)));if d<radius&&target>h{offers.push(Offer{i:j,target,rank:d/radius,u:d/radius});offered[j]=true;}}
        }
    }
    let minimum=round(48.0+power*160.0) as usize;let mut room:usize=offers.iter().map(|o|(o.target-before.heights[o.i]) as usize).sum();let min_area=16+round(power*16.0) as usize;
    if room<minimum||offers.len()<min_area{
        let mut candidates:Vec<(usize,f64)>=(0..n).filter(|&i|!offered[i]&&room_at(i)!=0&&outlet[i]==0&&channel[i]==0).map(|i|(i,hypot((i%map.w) as f64-mouth.x,(i/map.w) as f64-mouth.y))).collect();
        candidates.sort_by(|a,b|a.1.total_cmp(&b.1).then(a.0.cmp(&b.0)));
        for (i,d) in candidates{let h=before.heights[i];if d>max(16.0,width*0.6)||h as f64>=map.ceiling||h as f64>mouth_h as f64+3.0+power*2.0||wet&&before.depth[i]>0.05{continue;}
            if used[i]{donors.retain(|v|v.i!=i);used[i]=false;}
            let base=max(mouth_h as f64+2.0,(h as f64+before.depth[i]).ceil()+1.0);let target=min(map.ceiling,max(h as f64+1.0,base+round(power*2.0-d*0.1))) as u8;let target=target.min(h.saturating_add(room_at(i)));
            offers.push(Offer{i,target,rank:d/max(12.0,reach),u:d/max(12.0,reach)});offered[i]=true;room+=(target-h) as usize;if room>=minimum&&offers.len()>=min_area{break;}
        }
    }
    while room<minimum{let mut grew=false;for o in &mut offers{let h=before.heights[o.i];let cap=min(map.ceiling,min(h as f64+3.0+round(power*5.0),h as f64+room_at(o.i) as f64)) as u8;
        if o.target>=cap||channel[o.i]!=0||outlet[o.i]!=0{continue;}o.target+=1;room+=1;grew=true;if room>=minimum{break;}}
        if !grew{break;}
    }
    let available:usize=donors.iter().map(|d|(before.heights[d.i]-d.target) as usize).sum();
    if available<9{let mut candidates:Vec<_>=(0..n).filter(|&i|room_at(i)>0&&!offered[i]&&!used[i]&&outlet[i]==0&&before.heights[i]>floor
        &&{let dx=(i%map.w) as f64-mouth.x;let dy=(i/map.w) as f64-mouth.y;-(dx*dir.x+dy*dir.y)>2.0||before.heights[i]>mouth_h})
        .map(|i|(i,hypot((i%map.w) as f64-mouth.x,(i/map.w) as f64-mouth.y)+if before.depth[i]>0.05{48.0}else{0.0})).collect();
        candidates.sort_by(|a,b|a.1.total_cmp(&b.1).then(a.0.cmp(&b.0)));let mut missing=9-available;
        for (i,_) in candidates{if missing==0{break;}let cut=(before.heights[i]-floor).min(room_at(i)).min(missing as u8);
            donors.push(Donor{i,target:before.heights[i]-cut,rank:3.0+hypot((i%map.w) as f64-mouth.x,(i/map.w) as f64-mouth.y)/max(48.0,width)});missing-=cut as usize;
        }
    }
    offers.sort_by(|a,b|a.rank.total_cmp(&b.rank).then(a.i.cmp(&b.i)));donors.sort_by(|a,b|a.rank.total_cmp(&b.rank).then(a.i.cmp(&b.i)));
    let capacity:usize=offers.iter().map(|o|(o.target-before.heights[o.i]) as usize).sum();let supply=(round(expected) as usize).max(minimum);let donor_capacity:usize=donors.iter().map(|d|(before.heights[d.i]-d.target) as usize).sum();
    let budget=capacity.max(9).min(supply).min(donor_capacity);
    let mut bed=before.heights.clone();let mut remaining=budget;
    for d in &donors{let cut=remaining.min((before.heights[d.i]-d.target) as usize);bed[d.i]-=cut as u8;remaining-=cut;}
    let room:Vec<u8>=(0..n).map(room_at).collect();let add=shape(before,&offers,&bed,&room,&outlet,budget,mouth,dir);
    let deposited:usize=add.iter().map(|&v|v as usize).sum();
    let mut progress=vec![f64::NAN;n];for o in &offers{progress[o.i]=o.u;}
    let mut arrival=vec![2.0f32;n];let mut stats=[0.0;11];stats[6]=count as f64;stats[7]=wet as u8 as f64;
    for i in 0..n{if add[i]>0{map.heights[i]+=add[i];let x=(i%map.w) as f64-mouth.x;let y=(i/map.w) as f64-mouth.y;let u=if progress[i].is_nan(){(x*dir.x+y*dir.y)/reach}else{progress[i]};let side=(-x*dir.y+y*dir.x)/max(1.0,width);
        arrival[i]=clamp(0.08+u*0.66+0.16*smooth(side*sin(u*std::f64::consts::PI*3.0)*4.0+0.5)+noise(s.seed,(i%map.w) as f64/9.0,1800.0)*0.035,0.04,0.88) as f32;
    }}
    remaining=deposited;for d in &donors{let cut=remaining.min((before.heights[d.i]-d.target) as usize);map.heights[d.i]-=cut as u8;remaining-=cut;
        if cut>0{arrival[d.i]=min(0.85,0.02+d.rank*0.055) as f32;stats[10]=max(stats[10],hypot((d.i%map.w) as f64-mouth.x,(d.i/map.w) as f64-mouth.y));}
    }
    for i in 0..n{let dz=map.heights[i] as i32-before.heights[i] as i32;if dz!=0{stats[0]+=1.0;}if dz>0{stats[2]+=dz as f64;stats[5]=max(stats[5],dz as f64);}if dz<0{stats[1]-=dz as f64;stats[4]=max(stats[4],-dz as f64);}map.lava[i]&=mask(map.heights[i]);}
    stats[3]=stats[2]-stats[1];debug_assert_eq!(stats[3],0.0);
    if deposited==0{map.error=if donor_capacity==0{if before.heights.iter().any(|&h|h>floor){32}else{33}}else{34};}
    map.entities.retain(|e|{let i=e.y as usize*map.w+e.x as usize;let dz=map.heights[i] as i32-before.heights[i] as i32;
        let held=matches!(e.template.as_ref(),"WaterSource"|"BadwaterSource"|"WaterSeep"|"StartingLocation");
        let threshold=if e.template.as_ref()=="BlueberryBush"{2}else if plant(&e.template){3}else{4};
        if !held&&dz>=threshold{stats[8]+=1.0;false}else{if dz!=0{stats[9]+=1.0;}true}
    });
    ride(before,&mut map);let mut ids=vec![false;before.entities.iter().chain(map.entities.iter()).map(|e|e.id_key).max().unwrap_or(0)+1];
    for e in &map.entities{ids[e.id_key]=true;}map.fallen.retain(|f|ids.get(f.id_key).copied().unwrap_or(false));
    result(map,Records::Deposit(Box::new(DepositRecords{arrival,channel,stages,branches,mouth,direction:dir,reach,placement,width,stats})))
}
