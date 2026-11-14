import ts from 'typescript';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {root,proposed,overlay,helpers} from './overlay.mjs';
helpers();
const config=ts.readConfigFile(resolve(root,'tsconfig.json'),ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root),options={...parsed.options,noEmit:true};
const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
const candidate=p=>{p=resolve(p);return p.startsWith(root)?resolve(proposed,p.slice(root.length+1)):p;};
host.fileExists=p=>exists(candidate(p))||exists(p);
host.readFile=p=>{p=resolve(p);let s;try{s=readFileSync(candidate(p),'utf8');}catch{s=read(p);}return s&&p.startsWith(root)?overlay(p.slice(root.length+1).replaceAll('\\','/'),s):s;};
function files(p){return readdirSync(p,{withFileTypes:true}).flatMap(f=>f.isDirectory()?files(resolve(p,f.name)):[resolve(p,f.name)]);}
const added=files(proposed).filter(p=>p.endsWith('.ts')).map(p=>resolve(root,p.slice(proposed.length+1)));
const program=ts.createProgram([...parsed.fileNames,...added],options,host),errors=ts.getPreEmitDiagnostics(program);
if(errors.length){console.error(ts.formatDiagnosticsWithColorAndContext(errors,{getCurrentDirectory:()=>root,getCanonicalFileName:p=>p,getNewLine:()=> '\n'}));process.exitCode=1;}else console.log('Round 2 proposal typecheck passed.');
