//! Seeded, dependency-free property inputs. No product file is modified.
#[macro_use]
#[path = "../../../rust/forces/src/json.rs"]
pub mod json;
use json::{N, V};
use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicUsize, Ordering::Relaxed};

struct Meter;
static LIVE: AtomicUsize = AtomicUsize::new(0);
static PEAK: AtomicUsize = AtomicUsize::new(0);
unsafe impl GlobalAlloc for Meter {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 {
        let p = System.alloc(l);
        if !p.is_null() { let n = LIVE.fetch_add(l.size(), Relaxed) + l.size(); PEAK.fetch_max(n, Relaxed); }
        p
    }
    unsafe fn dealloc(&self, p: *mut u8, l: Layout) { LIVE.fetch_sub(l.size(), Relaxed); System.dealloc(p,l); }
}
#[global_allocator]
static ALLOC: Meter = Meter;
pub fn reset_peak() { PEAK.store(LIVE.load(Relaxed), Relaxed); }
pub fn peak() -> usize { PEAK.load(Relaxed) }

pub const VERBS: [&str; 7] = ["carve", "craterize", "erupt", "quake", "glaciate", "rift", "deposit"];
#[derive(Clone, Copy, Debug)]
pub struct Spec {
    pub verb: usize, pub w: usize, pub h: usize, pub terrain: u32,
    pub power: u32, pub big: bool, pub anchor: u32, pub variant: u32, pub seed: u32,
}
fn next(s: &mut u32) -> u32 { *s = s.wrapping_mul(1664525).wrapping_add(1013904223); *s }
pub fn specs() -> Vec<Spec> {
    let mut out = vec![];
    // Explicit limits, all corners/edges, both ends of Power and Size, each mode/detail.
    for verb in 0..7 { for terrain in 0..6 { for power in [0,100] { for big in [false,true] {
        out.push(Spec { verb,w:17,h:17,terrain,power,big,anchor:terrain,variant:terrain,seed:0 });
    }}}}
    // Tiny API maps, odd rectangles, common editor sizes, and the largest 512-square maps.
    for (w,h) in [(1,1),(2,2),(3,5),(64,64),(96,96),(127,129),(257,255),(512,512)] {
        for verb in 0..7 { for power in [0,100] {
            out.push(Spec {verb,w,h,terrain:2,power,big:power==0,anchor:0,variant:0,seed:1});
        }}
    }
    let mut rng=0x356d368;
    for k in 0..140 {
        let r=next(&mut rng); let seed=next(&mut rng);
        out.push(Spec {verb:k%7,w:9+(r%29) as usize,h:9+((r>>5)%31) as usize,
            terrain:(r>>10)%6,power:[0,1,50,99,100][((r>>14)%5) as usize],big:r&1!=0,
            anchor:(r>>18)%9,variant:(r>>22)%8,seed});
    }
    // Reduced repros, shared verbatim with the individually failing cargo tests.
    for (verb,terrain,variant) in [(0,1,0),(0,2,0),(4,2,0),(0,1,0),(1,0,0),
        (2,3,0),(3,3,1),(4,1,0),(5,1,0),(6,1,0)] {
        out.push(Spec {verb,w:1,h:1,terrain,power:0,big:false,anchor:0,variant,seed:0});
    }
    out
}
pub fn heights(s: Spec) -> Vec<u8> {
    let mut rng=s.seed;
    (0..s.w*s.h).map(|i| match s.terrain {
        0=>0, 1=>1, 2=>10, 3=>22,
        4=> (1+((i/s.w)*21/s.h)) as u8,
        _=> (next(&mut rng)%23) as u8,
    }).collect()
}
fn array(v: impl IntoIterator<Item=f64>) -> V { V::Array(v.into_iter().map(|x| V::Number(N::Float(x))).collect()) }
fn encode(v: &V,b: &mut Vec<u8>) {
    fn text(s:&str,b:&mut Vec<u8>){b.extend((s.len() as u32).to_le_bytes());b.extend(s.as_bytes());}
    match v {
        V::Null=>b.push(0), V::Bool(v)=>b.push(if *v{2}else{1}),
        V::Number(n)=>{b.push(3);b.extend(n.as_f64().unwrap().to_le_bytes());},
        V::String(s)=>{b.push(4);text(s,b);},
        V::Array(a)=>{b.push(5);b.extend((a.len() as u32).to_le_bytes());for v in a{encode(v,b)}},
        V::Object(o)=>{b.push(6);b.extend((o.len() as u32).to_le_bytes());for (k,v) in o {text(k,b);encode(v,b)}},
    }
}
pub fn decode(b:&[u8]) -> V {
    fn u(b:&[u8],p:&mut usize)->usize {let n=u32::from_le_bytes(b[*p..*p+4].try_into().unwrap());*p+=4;n as usize}
    fn text(b:&[u8],p:&mut usize)->String {let n=u(b,p);let s=String::from_utf8(b[*p..*p+n].to_vec()).unwrap();*p+=n;s}
    fn read(b:&[u8],p:&mut usize)->V {let t=b[*p];*p+=1;match t {
        0=>V::Null,1=>V::Bool(false),2=>V::Bool(true),
        3=>{let n=f64::from_le_bytes(b[*p..*p+8].try_into().unwrap());*p+=8;V::Number(N::Float(n))},
        4=>V::String(text(b,p)),5=>{let n=u(b,p);V::Array((0..n).map(|_|read(b,p)).collect())},
        6=>{let n=u(b,p);let mut m=json::Map::new();for _ in 0..n {let k=text(b,p);m.insert(k,read(b,p));}V::Object(m)},_=>panic!("tag")}}
    let mut p=0;let v=read(b,&mut p);assert_eq!(p,b.len());v
}
pub fn force_input(s: Spec) -> Vec<u8> {
    let n=s.w*s.h; let h=heights(s); let v=s.variant;
    let (x,y)=match s.anchor%9 {
        0=>(0,0),1=>(s.w-1,0),2=>(0,s.h-1),3=>(s.w-1,s.h-1),
        4=>(s.w/2,0),5=>(0,s.h/2),6=>(s.w-1,s.h/2),7=>(s.w/2,s.h-1),_=>(s.w/2,s.h/2),
    };
    let origin=y*s.w+x;let end=(s.h-1-y)*s.w+(s.w-1-x);
    let path=json!([{"x":x,"y":y},{"x":s.w-1-x,"y":s.h-1-y}]);
    let size=match s.verb {1=>if s.big{180.0}else{4.0},2=>if s.big{140.0}else{6.0},_=>if s.big{64.0}else{4.0}};
    let mut settings=json!({"power":s.power,"seed":s.seed,"size":size,"floor":1,"wander":35,
        "width":if s.big{24}else{2},"depth":if s.big{12}else{1},"banks":0,"riverDepth":1,
        "defyGravity":true,"dry":v%2==1,"layers":v%2==0,"meltwater":v%2==0,
        "tarn":true,"scree":true,"benches":["none","some","many"][(v%3) as usize],
        "steps":["few","some","many"][(v%3) as usize],"shape":if v%2==0{"steep"}else{"broad"},
        "summit":["auto","peak","crater","caldera"][(v%4) as usize],
        "centre":["auto","bowl","peak","ring","flat"][(v%5) as usize],"debris":if v%2==0{"light"}else{"heavy"},
        "flows":if v%2==0{"light"}else{"heavy"},"rays":v%2==0,"ridges":v%2==0,
        "scarp":if v%2==0{"sheer"}else{"stepped"},"channels":["auto","few","many"][(v%3) as usize]});
    let (mode,walls)=match s.verb {
        0=>(if v%2==0{"unleash"}else{"aim"},if v%2==0{"steep"}else{"wide"}),
        1=>(if v%2==0{"strike"}else{"aim"},if v%2==0{"steep"}else{"terraced"}),
        2=>(if v%2==0{"vent"}else{"fissure"},"steep"),
        3=>(if v%2==0{"lift"}else{"slide"},"sheer"),
        4=>(if v%2==0{"flow"}else{"aim"},"steep"),
        5=>("drop",["auto","sheer","stepped"][(v%3) as usize]),_ =>("fan","steep"),
    };
    settings["mode"]=json!(mode);settings["walls"]=json!(walls);
    let wet=if s.terrain==4{2.0}else{0.0};
    let entities:Vec<V>=if s.terrain==5 {(0..n.min(32)).map(|i|json!({"id":format!("existing-{i}"),
        "template":if i%2==0{"WaterSource"}else{"BadwaterSource"},"owner":"placed","orientation":"Cw0",
        "x":i%s.w,"y":i/s.w,"z":h[i],"components":{"WaterSource":{"SpecifiedStrength":0.5}}})).collect()} else {vec![]};
    let map=json!({"W":s.w,"H":s.h,"maxHeight":22,"heights":array(h.iter().map(|&h|h as f64)),
        "lava":array((0..n).map(|_|0.0)),"rockLayers":array((0..23).map(|_|0.0)),
        "water":{"depth":array((0..n).map(|_|wet)),"contamination":array((0..n).map(|_|if s.terrain==4{1.0}else{0.0}))},
        "entities":entities,"fallen":[],"usedIds":[]});
    let intent=if s.verb==5||s.verb==6 {if v%2==0{json!({"path":[{"x":x,"y":y}]})}else{json!({"path":path})}}
        else {json!({"origin":origin,"end":if end==origin{(end+1)%n}else{end},"side":if v%2==0{1}else{-1},"path":path})};
    let job=json!({"verb":VERBS[s.verb],"map":map,"settings":settings,"intent":intent,
        "keep":array((0..n).map(|_|0.0)),"options":{},"footprints":{}});
    let mut b=vec![];encode(&job,&mut b);b
}

pub const NONFINITE:u32=1; pub const BOUNDS:u32=2; pub const ADDED:u32=4;
pub const NO_EFFECT:u32=8; pub const REFUSED:u32=16; pub const PANIC:u32=32;
// Envelope: flags, changed heights, newly introduced IDs, numeric refusal, each u32; then exact bytes.
#[cfg(feature = "forces")]
pub fn force(s: Spec) -> Vec<u8> {
    let input=force_input(s);let before=heights(s);
    let mut task=forces::prepare(&input);forces::plan(&mut task);
    let error=unsafe{forces::forces_error(&task)};
    let d=unsafe{std::slice::from_raw_parts(forces::forces_descriptor(&task),136)};
    let mut flags=if error!=0{REFUSED|NO_EFFECT}else{0};let changed;let mut typed=vec![];
    unsafe {
        let h=std::slice::from_raw_parts(d[0] as *const u8,d[1]);
        changed=h.iter().zip(&before).filter(|(a,b)|a!=b).count() as u32;
        if h.iter().any(|&v|v>22){flags|=BOUNDS;}
        // Public numeric data, including optional-field sentinels. Commands/unused path capacity
        // are input storage, excluded. Descriptor types are taken from describe(), not guessed.
        let mut slots=vec![2,3,4,12,18,19,20,21,24,29,34,35,36,37,38,45,48,49,50,51,52,53,57,58,59,60,61];
        if s.verb==0 {slots.extend([13,14,41,54,63,66]);}
        for slot in slots {if d[slot*2+1]==0 {continue;}
            let a=std::slice::from_raw_parts(d[slot*2] as *const f64,d[slot*2+1]);
            typed.extend((slot as u32).to_le_bytes());typed.extend((a.len() as u32).to_le_bytes());
            for v in a {typed.extend(v.to_le_bytes());}
            for (i,v) in a.iter().enumerate(){if !v.is_finite(){flags|=NONFINITE;if std::env::var_os("PROPS_DIAG").is_some(){eprintln!("nonfinite slot={slot} index={i} value={v}");}}}
        }
        if s.verb!=0 && d[21]>0 { // arrival/flow arrays are f32, except Carve offsets.
            let a=std::slice::from_raw_parts(d[20] as *const f32,d[21]);
            typed.extend(10u32.to_le_bytes());typed.extend((a.len() as u32).to_le_bytes());
            for v in a {typed.extend(v.to_le_bytes());}
            if a.iter().any(|v|!v.is_finite()){flags|=NONFINITE;}
        }
        if s.verb==3 {for slot in [43,44] {if d[slot*2+1]>0 {
            if std::slice::from_raw_parts(d[slot*2] as *const f64,d[slot*2+1]).iter().any(|v|!v.is_finite()){flags|=NONFINITE;}
        }}}
    }
    let packed=forces::pack(&task);let value=decode(&packed);

    let added=value["map"]["entities"].as_array().map_or(0,|a|a.iter().filter(|e|!e["id"].as_str().unwrap_or("").starts_with("existing-")).count());

    if added>0 {flags|=ADDED;}
    if changed==0 {flags|=NO_EFFECT;}
    let mut out=vec![];for v in [flags,changed,added as u32,error]{out.extend(v.to_le_bytes())}out.extend(packed);out.extend(typed);out
}

pub const WATER_CASES:usize=96;
#[cfg(feature = "water")]
pub fn water_case(id:usize)->(Vec<u8>,usize,u32,bool) {
    let (w,h)=[(1,1),(2,2),(3,5),(17,19),(64,64),(96,96),(127,129),(512,512)][id%8];
    let n=w*h;let variant=id/8;let terrain=(variant%4) as u32;
    let hts=heights(Spec{verb:0,w,h,terrain:if terrain==2{5}else if terrain==3{3}else{0},power:0,big:false,anchor:0,variant:0,seed:0x368});
    let mut b=vec![];let u=|b:&mut Vec<u8>,v:u32|b.extend(v.to_le_bytes());
    let f=|b:&mut Vec<u8>,v:f64|b.extend(v.to_le_bytes());
    let canonical=variant>=8;
    u(&mut b,if canonical{water::protocol::CANONICAL_MAGIC}else{water::protocol::SIM_MAGIC});
    u(&mut b,w as u32);u(&mut b,h as u32);u(&mut b,1);
    for &h in &hts {f(&mut b,h as f64)}
    for &h in &hts {f(&mut b,h as f64+if variant%3==0{0.5}else{0.0})}
    let count=if variant%4>=2{n.min(32)}else{0};u(&mut b,count as u32);
    for k in 0..count {u(&mut b,1);u(&mut b,(k*n/count) as u32);f(&mut b,if k%2==0{0.5}else{2.0});
        f(&mut b,(k%2) as f64);u(&mut b,if k%3==0{1}else{0});u(&mut b,(k*n/count) as u32);f(&mut b,2.0);f(&mut b,0.5);}
    u(&mut b,if variant%2==0{1}else{0});u(&mut b,if variant%3==0{1}else{0});
    if canonical {u(&mut b,0);u(&mut b,0);}else{u(&mut b,1);}
    for i in 0..n{f(&mut b,if variant%4==1{22.0}else if variant%4>=2{(i%7) as f64}else{0.0});}
    for i in 0..n{f(&mut b,if variant%4>=2{(i%2) as f64}else{0.0});}
    (b,n,if n>100000{24}else{192},canonical)
}
#[cfg(feature = "water")]
pub fn water(id:usize)->Vec<u8> {
    let (input,n,ticks,canonical)=water_case(id);
    let bytes=if canonical{water::protocol::canonical_job(&input)}else{
        let mut sim=water::protocol::decode_sim(&input);sim.run(ticks as u64,if id/8%2==0{1.0}else{0.0});
        assert_eq!(sim.books_check(),0,"water bookkeeping");
        let mut b=vec![];for &v in sim.d.iter().chain(&sim.c).chain(&sim.out){b.extend(v.to_le_bytes());}b.extend(sim.saturation());b
    };
    let (start,end)=if canonical{(24,24+6*n*8)}else{(0,6*n*8)};
    let mut flags=0;for b in bytes[start..end].chunks_exact(8){if !f64::from_le_bytes(b.try_into().unwrap()).is_finite(){flags|=NONFINITE;}}
    let mut out=vec![];for v in [flags,0,0,0]{out.extend(v.to_le_bytes());}out.extend(bytes);out
}
#[cfg(feature="forces")]
pub fn case(id:usize)->Vec<u8> {force(specs()[id])}
#[cfg(feature="water")]
pub fn case(id:usize)->Vec<u8> {water(id)}
pub fn count()->usize{if cfg!(feature="forces"){specs().len()}else{WATER_CASES}}
#[no_mangle]
pub extern "C" fn props_count()->u32 {count() as u32}
#[no_mangle]
pub unsafe extern "C" fn props_run(id:u32,len:*mut u32)->*mut u8 {
    reset_peak();let b=case(id as usize).into_boxed_slice();*len=b.len() as u32;Box::into_raw(b) as *mut u8
}
#[no_mangle]
pub extern "C" fn props_peak()->u32 {peak() as u32}
#[no_mangle]
pub extern "C" fn props_alloc(n:usize)->*mut u8 {Box::into_raw(vec![0;n].into_boxed_slice()) as *mut u8}
#[no_mangle]
pub unsafe extern "C" fn props_free(p:*mut u8,n:usize) {drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(p,n)));}
