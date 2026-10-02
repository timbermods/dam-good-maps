import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root,dir,require} from './build.mjs';
const ts=require('typescript');
const deps=process.env.DGM_DEPS??resolve(root,'../../../startup/local/checkout');
const map=p=>p.replaceAll('\\','/').replace(root.replaceAll('\\','/')+'/node_modules',deps.replaceAll('\\','/')+'/node_modules');
const sys={...ts.sys,readFile:p=>ts.sys.readFile(map(p)),fileExists:p=>ts.sys.fileExists(map(p)),directoryExists:p=>ts.sys.directoryExists(map(p)),getDirectories:p=>ts.sys.getDirectories(map(p)),realpath:p=>map(p)};
const json=ts.readConfigFile(resolve(root,'tsconfig.json'),sys.readFile);
const config=ts.parseJsonConfigFileContent(json.config,sys,root);
const results=[];
for(const variant of process.argv.includes('--round2')?['round2']:['before','after']){
  const host=ts.createCompilerHost(config.options);
  Object.assign(host,{fileExists:p=>{const file=p.replaceAll('\\','/'),core=root.replaceAll('\\','/')+'/src/core/';return variant==='round2'&&file.startsWith(core)&&existsSync(resolve(dir,'round2/candidate',file.slice(core.length)))||sys.fileExists(p);},directoryExists:sys.directoryExists,getDirectories:sys.getDirectories,realpath:sys.realpath});
  const read=p=>{const file=p.replaceAll('\\','/');const core=root.replaceAll('\\','/')+'/src/core/';if((variant==='after'||variant==='round2')&&file.startsWith(core)){if(variant==='round2'){const candidate=resolve(dir,'round2/candidate',file.slice(core.length));if(existsSync(candidate))return readFileSync(candidate,'utf8');}const candidate=resolve(dir,'candidate',file.slice(core.length));if(existsSync(candidate))return readFileSync(candidate,'utf8');}return sys.readFile(p);};
  host.readFile=read;host.getSourceFile=(f,lang)=>{const s=read(f);return s===undefined?undefined:ts.createSourceFile(f,s,lang);};
  const program=ts.createProgram(config.fileNames,config.options,host);
  const diagnostics=ts.getPreEmitDiagnostics(program);
  results.push({variant,diagnostics:diagnostics.length});
  console.log(variant,diagnostics.length,'diagnostics');
  if(diagnostics.length){console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:x=>x,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));process.exitCode=1;}
}

writeFileSync(resolve(dir,process.argv.includes('--round2')?'local/round2-typecheck.json':'local/typecheck.json'),JSON.stringify({results},null,2)+'\n');
