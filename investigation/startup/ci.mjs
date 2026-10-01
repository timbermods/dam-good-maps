// Run after adopting the patch AND connecting the real first-visit workspace.
import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import { join,dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..'),dist=join(here,'local/ci-dist');
await build({root,configFile:join(root,'vite.config.ts'),build:{manifest:true,outDir:dist,emptyOutDir:true},plugins:[{
  name:'startup-clock',transform(code,id){
    const path=id.replaceAll('\\','/');
    if(path.endsWith('/src/ui/View3D.tsx'))return code.replace('const stats = r.setMap(props.view);','const stats = r.setMap(props.view); performance.mark("map-frame");');
    if(path.endsWith('/src/platform/index.ts'))return code.replace('const checks = new Worker','performance.mark("checks-start"); const checks = new Worker');
    if(path.endsWith('/src/editor/Editor.tsx'))return code.replace('if (mounted.current) props.onEditable?.();','if (mounted.current) { performance.mark("first-editable-frame"); props.onEditable?.(); }');
    if(path.endsWith('/src/page/firstVisit/load.ts'))return code.replace('random: () => number = Math.random','random: () => number = () => Number(new URLSearchParams(location.search).get("pick") ?? "0.001")').replace('if (!map) return null;','if (!map) return null; performance.mark("startup-map:" + map.id);');
  }
}]});
const run=(name,args)=>execFileSync(process.execPath,[join(here,name),...args],{cwd:root,stdio:'inherit'});
run('gate.mjs',['--round2','--dist',dist]);
const results=join(here,'local/ci-results.json');
run('measure.mjs',['--variants','site','--dist',dist,'--maps','all','--runs','5','--out',results,'--summary',join(here,'local/ci-summary.json')]);
run('gate.mjs',['--round2','--dist',dist,'--results',results]);
