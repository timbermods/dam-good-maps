import ts from 'typescript';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const loaded = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(loaded.config, ts.sys, process.cwd());
const overlay = new Map(['src/ui/App.tsx', 'src/editor/save/useSave.ts', 'tests/unit/pageHunt.test.ts'].map(p=>[
  resolve(p).toLowerCase(), resolve('investigation/page-hunt/overlay', p),
]));
const host = ts.createCompilerHost(config.options);
const read = host.readFile.bind(host), exists = host.fileExists.bind(host);
host.readFile = p => overlay.has(resolve(p).toLowerCase()) ? readFileSync(overlay.get(resolve(p).toLowerCase()),'utf8') : read(p);
host.fileExists = p => overlay.has(resolve(p).toLowerCase()) ? existsSync(overlay.get(resolve(p).toLowerCase())) : exists(p);
const files = [...config.fileNames, resolve('tests/unit/pageHunt.test.ts'),
  ...['playwright.config.ts','repro/transport.ts','repro/cancel.spec.ts','repro/project.spec.ts'].map(p=>resolve('investigation/page-hunt',p))];
const program = ts.createProgram(files, config.options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: p=>p, getCurrentDirectory: ()=>process.cwd(), getNewLine: ()=> '\n',
  }));
  process.exitCode = 1;
} else console.log('Product + adoption overlay + Chrome repro scripts: typecheck passed.');
