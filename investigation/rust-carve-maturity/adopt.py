"""Exact source edits inside this clone's ignored export; emit a source-only adoption patch."""
from pathlib import Path
import json
from emit_patch import emit
STUDY=Path(__file__).resolve().parent; WORK=STUDY/'local/workspace'
BASE='59483c63eb3e687944cbea585fb4f51c2019e7ca'; changed=set()
def edit(name,old,new):
 p=WORK/name; text=p.read_text(encoding='utf-8');assert text.count(old)==1,(name,old[:90],text.count(old));p.write_text(text.replace(old,new),encoding='utf-8',newline='\n');changed.add(name)
edit('rust/forces/src/lib.rs','mod json;','mod json;\nmod maturity;')
edit('rust/forces/src/lib.rs','struct CarveSettings {','struct CarveSettings {\n    mature: bool,')
edit('rust/forces/src/lib.rs','            power: n(v, "power"),\n            wander:', '            mature: s(v, "maturity") == "mature",\n            power: n(v, "power"),\n            wander:')
edit('rust/forces/src/lib.rs','    command[33] = map.w as f64;','    command[33] = map.w as f64;\n    if opcode == 4.0 { command[37] = match job["settings"].get("maturity") {None => 0.0,Some(v) if matches!(v,V::Null) || v.as_str()==Some("auto") => 2.0,Some(v) if v.as_str()==Some("young") => 0.0,Some(v) if v.as_str()==Some("mature") => 1.0,_ => -1.0}; }')
# This is after the generic Glacier slots have been set, so the Carve slot cannot be overwritten.
edit('rust/forces/src/lib.rs','    command[37] = job["settings"]["tarn"].as_bool().unwrap_or(true) as u8 as f64;', '    if opcode != 4.0 { command[37] = job["settings"]["tarn"].as_bool().unwrap_or(true) as u8 as f64; }')
edit('rust/forces/src/lib.rs','            &CarveSettings {\n                power:', '            &CarveSettings {\n                mature: c[37] == 1.0 || c[37] == 2.0 && maturity::auto(&before, intent.origin as usize, c[3] as u32),\n                power:')
edit('rust/forces/src/lib.rs','struct CarveRecords {','struct CarveRecords {\n    maturity: Option<Vec<f64>>,')
edit('rust/forces/src/lib.rs','    let r = CarveRecords {\n        knobs,','    let r = CarveRecords {\n        maturity: None,\n        knobs,')
edit('rust/forces/src/lib.rs','fn carve(\n    before:', 'fn carve(before: &Map, map: Map, s: &CarveSettings, i: &Intent, keep: &[u8], options: CarveOptions) -> Plan {\n    if s.mature { maturity::plan(before,map,s,i,keep,options) } else { carve_young(before,map,s,i,keep,options) }\n}\nfn carve_young(\n    before:')
# Add only Mature's diagnostics; Young's complete packed output remains unchanged.
name='rust/forces/src/lib.rs';text=(WORK/name).read_text();start=text.index('impl CarveRecords {');end=text.index('\nfn carve(',start);section=text[start:end]
section=section.replace('        json!({"metrics":','        let mut value = json!({"metrics":',1)
section=section.replace('"strengthDepth":self.strength_depth})','"strengthDepth":self.strength_depth});\n        if let Some(stats)=&self.maturity { value["maturity"] = json!({"youngSteps":stats[0],"rounds":stats[1],"eroded":stats[2],"deposited":stats[3],"oxbows":stats[4],"bluffLimited":stats[5],"existingRiver":stats[6]!=0.0,"changed":stats[7],"original":stats[8..].chunks_exact(2).map(|p|json!({"x":p[0],"y":p[1]})).collect::<Vec<_>>()}); }\n        value')
edit(name,text[start:end],section)
edit(name,'                pair(d, 63, &r.knobs);','                if let Some(stats)=&r.maturity { pair(d,67,stats); }\n                pair(d, 63, &r.knobs);')
# Invalid choices are refused even through the native cold fixture entry point.
text=(WORK/name).read_text();a=text.index('        4 => {',text.index('fn operation_problem'));b=text.index('        5 => {',a)
part=text[a:b];part=part.replace('if !power','if !whole(c[37],0.0,2.0) || !power',1);edit(name,text[a:b],part)
edit('src/core/forces/carve/run.ts','  mode: "unleash" | "aim";','  mode: "unleash" | "aim";\n  /** Absent is legacy Young; null/auto is resolved by nature, never by playback. */\n  maturity?: "young" | "mature" | "auto" | null;')
edit('src/core/forces/carve/run.ts','import { planInRust }','import { carveMaturity } from "../nature";\nimport { planInRust }')
edit('src/core/forces/carve/run.ts','    this.keep = protectedGround(input, options.keep ?? null);','    if (settings.maturity === null || settings.maturity === "auto") settings.maturity = carveMaturity({W:input.W,H:input.H,heights:input.heights,at:intent.origin}, settings.seed ?? 0);\n    this.keep = protectedGround(input, options.keep ?? null);')
edit('src/core/forces/carve/run.ts','    const sim = new WaterSim(model, { depth: this.initialWater, contamination: this.initialContamination });','    const sim = new WaterSim(model, this.records.maturity ? this.records.map.water : { depth: this.initialWater, contamination: this.initialContamination });')
edit('src/core/forces/carve/run.ts','      m.entities = r.map.entities;','      m.entities = r.map.entities;\n      if (r.maturity) { m.water = {depth:r.map.water.depth.slice(),contamination:r.map.water.contamination.slice()}; m.fallen = r.map.fallen; }')
edit('src/core/forces/nature.ts','import { clamp } from "./random";','import { clamp, hash } from "./random";')
edit('src/core/forces/nature.ts','"wander" | "walls" | "depth" | "banks">','"wander" | "walls" | "depth" | "banks" | "maturity">')
edit('src/core/forces/nature.ts','{ wander: null, walls: null, depth: null, banks: null } as const','{ wander: null, walls: null, depth: null, banks: null, maturity: null } as const')
edit('src/core/forces/nature.ts','export function carveNature(s:', '/** Open ground leans Mature; rugged ground Young. Separate hash leaves old Auto draws untouched. */\nexport function carveMaturity(g: ForceGround, seed: number): "young" | "mature" { return hash(seed,6709) < .8 - .65*ruggedness(g) ? "mature" : "young"; }\nexport function carveNature(s:')
edit('src/core/forces/nature.ts','  return { ...s, wander, walls, ...(banks !== undefined ? { banks } : {}) } as CarveSettings;','  const maturity = s.maturity === null || s.maturity === "auto" ? carveMaturity(g,s.seed ?? 0) : s.maturity;\n  return { ...s, wander, walls, ...(banks !== undefined ? { banks } : {}), ...(maturity !== undefined ? { maturity } : {}) } as CarveSettings;')
edit('src/core/forces/settings.ts','    flags: ["defyGravity", "dry"],','    flags: ["defyGravity", "dry"],\n    details: [{key:"maturity",options:["young","mature","auto"],why:"a carve\'s maturity is Young, Mature or Auto"}],')
edit('src/core/forces/op.ts','depth?: number | null; floor?: number; riverDepth?: number | null; banks?: number }','depth?: number | null; floor?: number; riverDepth?: number | null; banks?: number; maturity?: "young" | "mature" | "auto" | null }')
edit('src/core/doc/ops.schema.json','"meltwater": { "type": "boolean" },','"meltwater": { "type": "boolean" },\n            "maturity": { "enum": ["young", "mature", "auto", null] },')
edit('src/core/forces/carve/result.ts','      dry: set.dry,','      dry: set.dry,\n      ...(run.settings.maturity === "mature" ? { maturity: "mature" as const } : {}),')
edit('src/core/forces/rust/bridge.ts','export interface CarveRecords {','export interface CarveRecords {\n  maturity?: { youngSteps:number; rounds:number; eroded:number; deposited:number; oxbows:number; bluffLimited:number; existingRiver:boolean; changed:number; original: {x:number;y:number}[] };')
edit('src/core/forces/rust/bridge.ts','        initialEntities: entityRows(view(45, Float64Array)),','        initialEntities: entityRows(view(45, Float64Array)),\n        ...(view(67,Float64Array).length ? {maturity:(() => {const a=view(67,Float64Array);return {...named(a,["youngSteps","rounds","eroded","deposited","oxbows","bluffLimited","existingRiver","changed"]),existingRiver:!!a[6],original:Array.from({length:(a.length-8)/2},(_,k)=>({x:a[8+2*k],y:a[9+2*k]}))} as CarveRecords["maturity"];})()} : {}),')

edit('src/core/forces/carve/play.ts','    return this.total - k + 1;', '    const young = this.run.records.maturity?.youngSteps ?? this.total;\n    return k <= young ? young - k + 1 : k;')
edit('src/core/forces/carve/play.ts','    if (!this.fromEnd) return this.heads[this.at];','    if (!this.fromEnd || this.at > (this.run.records.maturity?.youngSteps ?? this.total)) return this.heads[this.at];')
edit('src/core/forces/carve/play.ts','    if (!this.fromEnd) {','    if (!this.fromEnd || this.at > (this.run.records.maturity?.youngSteps ?? this.total)) {')
edit('src/core/forces/carve/play.ts','    for (let s = total; s >= 1; s--) {','    const young = this.run.records.maturity?.youngSteps ?? total;\n    for (let s = young; s >= 1; s--) {')
edit('src/core/forces/carve/play.ts','    return (this.backward = out);','    for (let s = young+1; s <= total; s++) out.push(this.changes[s]);\n    return (this.backward = out);')
edit('src/core/forces/carve/play.ts','  }\n\n  private unleashedObject()', '    if (this.run.records.maturity) {\n      const records=this.run.records, moves=new Map<string,typeof records.stepObjectChanges[number]>();\n      // Native changes are absolute poses; age stages must never run backwards with the drawn carve.\n      for (const move of records.stepObjectChanges) if (this.goneAt(move.step)<=k) moves.set(move.id,move);\n      this.map.entities=this.objects.filter(e=>!removed.has(e.id)||this.goneAt(removed.get(e.id)!,e.id)>k).map(e=>{\n        const pose=moves.get(e.id);return pose?{...e,x:pose.x,y:pose.y,z:pose.z}:e;\n      });\n      this.map.fallen=(this.run.records.raw.fallen??[]).flatMap(f=>{\n        if (removed.has(f.id)&&this.goneAt(removed.get(f.id)!,f.id)<=k)return [];\n        const i=Math.floor(f.y)*W+Math.floor(f.x);return [{...f,z:f.z+heights[i]-records.map.heights[i]}];\n      });\n    }\n  }\n\n  private unleashedObject()')


edit('rust/forces/src/lib.rs','const FORCE_ERRORS: [&str; 27]','const FORCE_ERRORS: [&str; 28]')
edit('rust/forces/src/lib.rs','    "No room to rise here",\n];','    "No room to rise here",\n    "the Floor or kept ground leaves no room to age this river",\n];')
edit('src/core/forces/rust/bridge.ts','  "No room to rise here",\n];','  "No room to rise here",\n  "the Floor or kept ground leaves no room to age this river",\n];')
edit('tools/rust/forces-jobs.ts','  return out;\n}', '  for (let k=0;k<6;k++) {\n    const j=job("carve",64,k);j.settings={...j.settings,maturity:k===5?null:"mature",power:k===1?0:k===2?55:100,width:k===2?2:k===4?24:null,floor:1};\n    if(k%2||k===2){j.map=fixture("river",64);j.intent={origin:20*64+35,end:52*64+35,via:[24*64+35,36*64+35,48*64+35]};j.settings={...j.settings,mode:"aim",defyGravity:true};}\n    if(k===3)j.map.water.contamination.fill(.7);\n    out.push({name:`maturity 64 ${k}`,job:j});\n  }\n  return out;\n}')
edit('tools/rust/forces-jobs.ts','import { createHash } from "node:crypto";','import { createHash } from "node:crypto";\nimport { decode } from "../../src/core/forces/rust/protocol";')
edit('tools/rust/forces-jobs.ts','  for (const f of forceFixtures()) pins[f.name] = sha256(executeInRust(f.job));','  for (const f of forceFixtures()) {const out=executeInRust(f.job);if(f.name.startsWith("maturity ")&&(decode(out) as {error?:string}).error)throw Error(`Unexpected refusal: ${f.name}`);pins[f.name]=sha256(out);}')
edit('tools/determinism/cases.ts','import { CarveRun, DEFAULTS as CARVE }','import { fixture as forceFixture } from "../../tests/contract/forceFixtures";\nimport { CarvePlay } from "../../src/core/forces/carve/play";\nimport { CarveRun, DEFAULTS as CARVE }')
edit('tools/determinism/cases.ts','seed: number, mode: number) {','seed: number, mode: number, maturity = false) {')
edit('tools/determinism/cases.ts','    const carve = new CarveRun(m, settings, intent,','    if (maturity) {settings={...settings,maturity:"mature"};if(mode)intent={origin:20*n+35,end:52*n+35,via:[24*n+35,36*n+35,48*n+35]};}\n    const play = maturity ? new CarvePlay(new CarveRun(m, settings, intent, {sourceId:`carve-source-${seed}`})) : null;\n    const carve = play?.run ?? new CarveRun(m, settings, intent,')
edit('tools/determinism/cases.ts','    return { map: fullMap(carve.map as any), record: kept.ok ? kept.params : null };','    const frames: {stage:number;map:FullForceMap}[]=[];if(play){play.plan();for(const stage of [1,Math.floor(play.total/2),play.total]){play.showTo(stage);frames.push({stage,map:fullMap(snapshotMap(play.map))});}}\n    return { map: fullMap(carve.map as any), record: kept.ok ? kept.params : null, frames };')
edit('tools/determinism/cases.ts','origin: [x, y], ...(mode ? { end: [end % n, Math.floor(end / n)] } : {}), cut: null } as ForceRequest;', 'origin: maturity ? [intent.origin%n, Math.floor(intent.origin/n)] : [x,y], ...(mode ? { end: maturity ? [intent.end%n,Math.floor(intent.end/n)] : [end % n, Math.floor(end / n)] } : {}), ...(maturity && intent.via ? {via:intent.via.map((v:number)=>[v%n,Math.floor(v/n)])} : {}), cut: null } as ForceRequest;')
# CarvePlay is constructed before native tape playback, then explicitly planned even if run.finish preceded it.
edit('src/core/forces/carve/play.ts','    if (!this.run.done) {','    if (!this.run.done || this.run.records.maturity && this.changes.length === 1) {')
edit('tools/determinism/cases.ts','  return out;\n}\n\n/** One case','  for (const power of [0,100]) for (const mode of [0,1]) out.push({id:`force/maturity/64/${power}/${mode}`,kind:"force",n:64,verb:"carve",power,size:24,mode});\n  return out;\n}\n\n/** One case')
edit('tools/determinism/cases.ts','    let m: any = fixture(c.n);','    let m: any = c.id.includes("/maturity/") ? forceFixture(c.mode?"river":"plain",c.n) : fixture(c.n);')
edit('tools/determinism/cases.ts','701 + k, c.mode ?? k % 2);','701 + k, c.mode ?? k % 2, c.id.includes("/maturity/"));')
edit('tools/determinism/cases.ts','          record = f.record;','          record = f.record;\n          if ("frames" in f && f.frames) for (const frame of f.frames) await add(`${c.id}/${k}/playback/${frame.stage}`,frame.map,record);')

# Strengthen the existing fixture checker: exact bytes, rather than the 53-bit convenience hash.
edit("tools/rust/check.ts", '  return hash53(out);\n});\nconst forcesBin', '  return Buffer.from(out);\n});\nconst forcesBin')
edit("tools/rust/check.ts", 'const got = hash53(new Uint8Array(out.buffer, out.byteOffset + at + 4, len));', 'const got = out.subarray(at + 4, at + 4 + len);')
edit("tools/rust/check.ts", 'if (got !== nodeForces[k])', 'if (!got.equals(nodeForces[k]))')
# Only the force page's hash is replaced. Water retains its existing check.
p=WORK/"tools/rust/check.ts"; text=p.read_text(encoding="utf-8"); a=text.index('const FORCES_IN_PAGE ='); b=text.index('const forcesPayload',a); section=text[a:b]; start=section.index('    let h1 ='); end=section.index('    x.water_dealloc(res',start); section=section[:start]+"    let str = ''; for (const v of b) str += String.fromCharCode(v); out.push(btoa(str));\n"+section[end:]; text=text[:a]+section+text[b:]; text=text.replace('as number[];\n      forceHashes.forEach','as string[];\n      forceHashes.forEach').replace('if (h !== nodeForces[k])','if (!Buffer.from(h, "base64").equals(nodeForces[k]))'); p.write_text(text,encoding="utf-8");changed.add("tools/rust/check.ts")


edit("tools/determinism/run.ts", 'const serial = process.argv.includes("--serial");', 'const serial = process.argv.includes("--serial");\nconst noTimings = process.argv.includes("--no-timings");')
edit("tools/determinism/run.ts", 'const t0 = performance.now();', 'const t0 = noTimings ? 0 : performance.now();')
edit("tools/determinism/run.ts", 'const tc = performance.now();', 'const tc = noTimings ? 0 : performance.now();')
edit("tools/determinism/run.ts", '    slowest.push({ case: c.id, seconds:', '    if (!noTimings) slowest.push({ case: c.id, seconds:')
edit("tools/determinism/run.ts", 'const seconds = Math.round((performance.now() - t0) / 1000);', 'const seconds = noTimings ? null : Math.round((performance.now() - t0) / 1000);')
edit("tools/determinism/run.ts", '${errors.length} errors, ${seconds} s`', '${errors.length} errors${noTimings ? "" : `, ${seconds} s`}`')


edit('tools/rust/forces-jobs.ts','import { createHash } from "node:crypto";','import { readFileSync } from "node:fs";\nimport { gunzipSync } from "node:zlib";\nimport { createHash } from "node:crypto";')
edit('tools/rust/forces-jobs.ts','  return out;\n}', '  const j=JSON.parse(gunzipSync(readFileSync(new URL("../../investigation/meander/maps/long.json.gz",import.meta.url))).toString());\n  const heights=Uint8Array.from(j.heights);const map={...j,heights,lava:new Uint32Array(heights.length),fallen:j.fallen??[],water:{depth:Float64Array.from(j.water.depth),contamination:Float64Array.from(j.water.contamination)}};\n  const gestures=[{"origin":973,"end":5241,"via":[1100,1356,1612,1868,2124,2380,2636,2892,3148,3276,3533,3789,3917,4174,4303,4304,4434,4436,4438,4440,4442,4443,4445,4574,4703,4832,4961,5218,5346,5475,5732,5861,5989,6246,6374,6504,6505,6507,6380,6253,5998,5870,5614,5358,5231,5104,4978,4979,4981,5110,5239]},{"origin":3276,"end":5475,"via":[3533,3789,3917,4174,4303,4304,4434,4436,4438,4440,4442,4443,4445,4574,4703,4832,4961,5218,5346]}];\n  gestures.forEach((intent,k)=>out.push({name:`maturity oxbow 128 ${k}`,job:{verb:"carve",map,settings:{...job("carve",64,0).settings,maturity:"mature",power:100,seed:4,mode:"aim",defyGravity:true,width:null,floor:1},intent,keep:null}}));\n  return out;\n}')
changed.update(str(p.relative_to(STUDY/'overlay')).replace('\\','/') for p in (STUDY/'overlay').rglob('*') if p.is_file())
(STUDY/'local/changed.json').write_text(json.dumps(sorted(changed)),encoding='utf-8')
emit(STUDY,BASE,changed);print('Patched',len(changed),'exported source files; product unchanged.')
