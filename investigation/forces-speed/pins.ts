import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..'),local=join(root,'investigation/forces-speed/local');
const tree=process.argv.includes('--adopted')?join(local,'adopted'):root;
const {forceFixtures}=await import(pathToFileURL(join(tree,'tools/rust/forces-jobs.ts')).href);
const {executeInRust}=await import(pathToFileURL(join(tree,'src/core/forces/rust/bridge.ts')).href);
const pins=JSON.parse(readFileSync(join(root,'tools/rust/forces-pins.json'),'utf8'));
const dir=join(local,process.argv[process.argv.indexOf('--out')+1]??'pins');mkdirSync(dir,{recursive:true});
const rows=[];
for(const f of forceFixtures()){
 const wasm=executeInRust(f.job),hash=createHash('sha256').update(wasm).digest('hex');
 if(hash!==pins[f.name])throw Error('pin changed '+f.name);
 if(process.argv.includes('--native')){
 const input=join(dir,'job.bin'),output=join(dir,'output.bin');writeFileSync(input,f.job);
 execFileSync(join(tree,'rust/target/release/forces-batch.exe'),[input,output],{windowsHide:true});
 if(!readFileSync(output).equals(Buffer.from(wasm)))throw Error('native changed '+f.name);
 }
 rows.push({name:f.name,hash});
}
writeFileSync(join(dir,'pins.json'),JSON.stringify(rows,null,2));
console.log(rows.length+' pinned force fixtures identical'+(process.argv.includes('--native')?' in native and Node-Wasm':''));