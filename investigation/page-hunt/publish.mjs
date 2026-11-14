// Prepare explicit GitHub Git API bodies when the local .git directory is read-only.
// Does not send network requests, alter .git, or publish any ref itself.
import { readFileSync, writeFileSync } from 'node:fs';
const root = 'investigation/page-hunt';
const names = [
  'REPORT.md','DETAILS.md','INTEGRATION.md','verification.json','adoption-page.patch',
  'prepare.mjs','package.mjs','check.mjs','typecheck.mjs','publish.mjs','playwright.config.ts',
  'repro/transport.ts','repro/cancel.spec.ts','repro/project.spec.ts',
  'overlay/src/ui/App.tsx','overlay/src/editor/save/useSave.ts','overlay/tests/unit/pageHunt.test.ts',
];
const tree = names.map(name=>({ path: `${root}/${name}`, mode:'100644', type:'blob', content:readFileSync(`${root}/${name}`,'utf8') }));
const bytes = tree.reduce((n,f)=>n+Buffer.byteLength(f.content),0);
if (bytes > 1_000_000 || tree.some(f=>f.path.includes('/local/'))) throw new Error('Publication size/path guard');
writeFileSync(`${root}/local/tree-request.json`,JSON.stringify({ base_tree:'3178ec9da2c0d70913ddc51d9402f197b7d93299', tree }));
console.log(`Prepared ${tree.length} investigation-only files, ${bytes} bytes.`);
