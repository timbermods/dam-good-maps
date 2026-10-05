import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const base='investigation/deposit-pillars';
let s=readFileSync('rust/forces/src/deposit.rs','utf8');
const from=s.indexOf('    let minimum=round(48.0+power*160.0)');
const to=s.indexOf('    for i in 0..n{let dz=',from);
s=s.slice(0,from)+`    // A budget is a layer over a connected fan, never a prefix of full-height columns.
    // Do not mint extra receiving sites or inflate the cone to meet a minimum volume.
    offers.sort_by(|a,b|a.rank.total_cmp(&b.rank).then(a.i.cmp(&b.i)));
    donors.sort_by(|a,b|a.rank.total_cmp(&b.rank).then(a.i.cmp(&b.i)));
    let mut site=vec![usize::MAX;n];for (k,o) in offers.iter().enumerate(){site[o.i]=k;}
    let mut seen=vec![false;n];let mut footprint=vec![];
    // Existing ridges, kept tiles and wet outlets can split the geometric cone. Use its
    // largest connected receiving patch; ties retain the patch nearest the mouth.
    for o in &offers{if seen[o.i]{continue;}let mut patch=vec![o.i];seen[o.i]=true;let mut at=0;
        while at<patch.len(){let i=patch[at];at+=1;for j in neighbours(&map,i).into_iter().flatten(){
            if site[j]!=usize::MAX&&!seen[j]{seen[j]=true;patch.push(j);}
        }}
        if patch.len()>footprint.len(){footprint=patch;}
    }
    let mut included=vec![false;n];for &i in &footprint{included[i]=true;}
    let capacity:usize=footprint.iter().map(|&i|(offers[site[i]].target-before.heights[i]) as usize).sum();
    let minimum=round(48.0+power*160.0) as usize;
    let donor_capacity:usize=donors.iter().map(|d|(before.heights[d.i]-d.target) as usize).sum();
    let budget=capacity.min((round(expected) as usize).max(minimum)).min(donor_capacity);
    // Reserve donors' deepest possible beds before shaping: cutting a neighbouring
    // bank later must not turn an already supported deposit into a lone pillar.
    let mut support=before.heights.clone();for d in &donors{support[d.i]=d.target;}
    let mut remaining=budget;let mut placed=vec![false;n];let mut order=vec![];
    // Start near the mouth on a tile that can accept its first level safely.
    let root=offers.iter().find(|o|included[o.i]&&neighbours(&map,o.i).into_iter().flatten()
        .map(|j|support[j]).max().unwrap_or(0).saturating_add(2)>before.heights[o.i]);
    if let Some(root)=root{
        order.push(root.i);let mut queued=vec![false;n];queued[root.i]=true;let mut at=0;
        while at<order.len(){let i=order[at];at+=1;for j in neighbours(&map,i).into_iter().flatten(){
            if included[j]&&!queued[j]{queued[j]=true;order.push(j);}
        }}
        loop{let mut grew=false;
            for &i in &order{
                if remaining==0{break;}let o=&offers[site[i]];
                if map.heights[i]>=o.target{continue;}
                if !placed[i]&&i!=root.i&&!neighbours(&map,i).into_iter().flatten().any(|j|placed[j]){continue;}
                let cap=neighbours(&map,i).into_iter().flatten().map(|j|support[j]).max().unwrap_or(0).saturating_add(2);
                if map.heights[i]>=cap{continue;}
                map.heights[i]+=1;support[i]=map.heights[i];placed[i]=true;remaining-=1;grew=true;
            }
            if remaining==0||!grew{break;}
        }
    }
    let mut deposited=budget-remaining;
    // Fewer than a 3 x 3 patch is scattered debris, not a fan. Refuse atomically.
    if placed.iter().filter(|&&v|v).count()<9{map.heights.clone_from(&before.heights);placed.fill(false);deposited=0;}
    let mut arrival=vec![2.0f32;n];let mut stats=[0.0;11];stats[6]=count as f64;stats[7]=wet as u8 as f64;
    for o in &offers{if placed[o.i]{let x=(o.i%map.w) as f64-mouth.x;let y=(o.i/map.w) as f64-mouth.y;let side=(-x*dir.y+y*dir.x)/max(1.0,width);
        arrival[o.i]=clamp(0.08+o.u*0.66+0.16*smooth(side*sin(o.u*std::f64::consts::PI*3.0)*4.0+0.5)+noise(s.seed,(o.i%map.w) as f64/9.0,1800.0)*0.035,0.04,0.88) as f32;
    }}
    remaining=deposited;for d in &donors{let cut=remaining.min((before.heights[d.i]-d.target) as usize);map.heights[d.i]-=cut as u8;remaining-=cut;
        if cut>0{arrival[d.i]=min(0.85,0.02+d.rank*0.055) as f32;stats[10]=max(stats[10],hypot((d.i%map.w) as f64-mouth.x,(d.i/map.w) as f64-mouth.y));}
    }
`+s.slice(to);
s=s.replace('if budget==0{map.error=', 'if deposited==0{map.error=');
writeFileSync(`${base}/overlay/rust/forces/src/deposit.rs`,s);
let lib=readFileSync('rust/forces/src/lib.rs','utf8').replace('const FORCE_ERRORS: [&str; 36]', 'const FORCE_ERRORS: [&str; 37]');
lib=lib.replace('    "the Floor or kept ground leaves no room to age this river",','    "the Floor or kept ground leaves no room to age this river",\n    "Draw a longer line for a fan (at least 8 tiles)",');
const needle='            if !whole(c[19],1.0,512.0)';const idx=lib.indexOf(needle);
const end=lib.indexOf('\n',idx);
lib=lib.slice(0,end)+`\n            if opcode==7&&points>1 {let length=hypot(path[(points-1)*2]-path[0],path[(points-1)*2+1]-path[1]);if length>1.0&&length<8.0{return 36;}}`+lib.slice(end);
writeFileSync(`${base}/local/checkout/rust/forces/src/lib.rs`,lib);
let bridge=readFileSync('src/core/forces/rust/bridge.ts','utf8').replace('  "the Floor or kept ground leaves no room to age this river",','  "the Floor or kept ground leaves no room to age this river",\n  "Draw a longer line for a fan (at least 8 tiles)",');
writeFileSync(`${base}/local/checkout/src/core/forces/rust/bridge.ts`,bridge);
