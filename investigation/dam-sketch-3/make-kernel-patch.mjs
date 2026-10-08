import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = process.cwd(), folder = resolve(root, 'investigation/dam-sketch-3');
mkdirSync(resolve(folder, 'local/kernel'), {recursive:true});
cpSync(resolve(root,'rust'), resolve(folder,'local/kernel/rust'), {recursive:true,filter:p=>!p.includes('target')});
const files = ['columns.rs','stack_memory.rs'];
for (const file of files) {
 const path=resolve(folder,'local/kernel/rust/water/src',file);
 let s=readFileSync(path,'utf8').replaceAll('\r\n','\n');
 if(file==='columns.rs') {
  s=s.replace('/// Inert objects', '/// 12 finished player dam, 13 finished floodgate (strength is selected height, 0..3).\n/// Inert objects');
  s=s.replace('o.kind > 11', 'o.kind > 13');
  s=s.replace('return Err("Water object is unknown or malformed.");', 'return Err("Water object is unknown or malformed.");',1);
  const anchor='    let mut gaps: Vec<Vec<(i16, i16)>> = mask';
  s=s.replace(anchor, '    if objects.iter().any(|o| o.kind == 13 && (o.strength > 3.0 || o.z as f64 + o.strength > OPEN as f64)) {\n        return Err("Floodgate height is invalid.");\n    }\n'+anchor);
  s=s.replace('        if [1, 3, 4, 5, 6].contains(&o.kind) {', '        // Selected gate levels use the same full-obstacle path as a levee.\n        let full = if o.kind == 13 { o.strength.floor() as i16 } else if [1, 3, 4, 5, 6].contains(&o.kind) { 1 } else { 0 };\n        for dz in 0..full {');
  s=s.replace('                let z = o.z;', '                let z = o.z + dz;');
  s=s.replace('        if o.kind == 2 {', '        if o.kind == 2 || o.kind == 12 || (o.kind == 13 && o.strength.fract() > 0.0) {');
  s=s.replace('                height_limit.insert(o.z as usize * n + i, 0.65);', '                let (z, height) = if o.kind == 13 { (o.z + o.strength.floor() as i16, o.strength.fract()) } else { (o.z, 0.65) };\n                height_limit.insert(z as usize * n + i, height);');
  s=s.replace('            6 => vec![(1, o.z), (1, o.z + 1)],','            6 => vec![(1, o.z), (1, o.z + 1)],\n            12 | 13 => vec![(0, o.z)],');
 } else s=s.replace('integer(p[0], 0.0, 11.0)','integer(p[0], 0.0, 13.0)');
 writeFileSync(path,s);
}
let patch='';
for(const file of files){
 const original=`rust/water/src/${file}`, edited=`investigation/dam-sketch-3/local/kernel/${original}`;
 let diff;try{diff=execFileSync('git',['diff','--no-index','--',original,edited],{cwd:root,encoding:'utf8'});}catch(e){if(e.status!==1)throw e;diff=e.stdout;}
 diff=diff.replaceAll(`b/${edited}`,`b/${original}`).replaceAll(`a/${original}`,`a/${original}`);
 patch+=diff;
}
writeFileSync(resolve(folder,'kernel.patch'),patch);
