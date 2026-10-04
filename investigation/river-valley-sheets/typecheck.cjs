const fs=require('node:fs');const ts=require('typescript');const transform=require('./transform.cjs');
const config=ts.readConfigFile('tsconfig.json',ts.sys.readFile);const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,process.cwd());
const host=ts.createCompilerHost(parsed.options);const read=host.readFile.bind(host);host.readFile=file=>{const source=read(file);return source===undefined?source:transform(file,source);};
const program=ts.createProgram(parsed.fileNames,parsed.options,host);const diagnostics=ts.getPreEmitDiagnostics(program);
if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>process.cwd(),getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));process.exitCode=1;}else console.log('Adoption source typecheck passed');
const file='src/core/land/hydro.ts';fs.writeFileSync('investigation/river-valley-sheets/local/hydro.after.ts',transform(process.cwd()+'/'+file,fs.readFileSync(file,'utf8')));
