// Read-only TS overlay: product and optional High fixture plus the one-file proposal.
import ts from 'typescript';
import {resolve} from 'node:path';
import {existsSync,readFileSync} from 'node:fs';
import {root,file,adopt} from './brush-adoption.mjs';
const config=ts.readConfigFile(resolve(root,'tsconfig.json'),ts.sys.readFile);
if(config.error)throw Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'));
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root),host=ts.createCompilerHost(parsed.options),high=process.argv.includes('--high');
const overlay=p=>high&&p.replaceAll('\\','/').startsWith(root.replaceAll('\\','/')+'/src/render3d/')?resolve(import.meta.dirname,'local/round3/high-source',p.slice(root.length+1)):null;
const oldRead=host.readFile.bind(host),oldExists=host.fileExists.bind(host),oldDir=host.directoryExists.bind(host);
host.fileExists=p=>!!(overlay(p)&&existsSync(overlay(p)))||oldExists(p);
host.directoryExists=p=>!!(overlay(p+'/')&&existsSync(overlay(p+'/')))||oldDir(p);
host.readFile=p=>{const path=overlay(p),code=path&&existsSync(path)?readFileSync(path,'utf8'):oldRead(p);return p.replaceAll('\\','/').endsWith('/'+file)&&code?adopt(code):code;};
const program=ts.createProgram(high?parsed.fileNames.filter(p=>p.replaceAll('\\','/').includes('/src/')):parsed.fileNames,parsed.options,host),diagnostics=ts.getPreEmitDiagnostics(program);
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));console.log(`Brush proposal ${high?'High fixture':'Standard'}: ${diagnostics.length} diagnostics`);process.exitCode=diagnostics.length?1:0;
