// Round 3 builds are isolated from the rejected round 2 proposal and its evidence.
import {build} from 'vite';
import preact from '@preact/preset-vite';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..'),dir=import.meta.dirname;
const phase=process.argv[2]??'before',look=process.argv[3]??'standard';
if(!['before','after'].includes(phase)||!['standard','high'].includes(look))throw Error('before|after standard|high');
const overlay=resolve(dir,'local/round3/high-source'),out=resolve(dir,'local/round3/build',look,phase);
const slash=p=>p.replaceAll('\\','/');
const fileAt=p=>[p,p+'.ts',p+'.tsx',p+'/index.ts'].find(existsSync);
const focused=phase==='after'?await import('./brush-adoption.mjs'):null;
await build({root,configFile:false,base:'/',mode:'e2e',plugins:[{
 name:'brush-investigation',enforce:'pre',resolveId(source,importer){
  if(look!=='high'||!importer||!source.startsWith('.'))return;
  const p=slash(resolve(importer.split('?')[0],'..',source));
  if(p.startsWith(slash(root)+'/src/render3d/'))return fileAt(slash(overlay)+p.slice(slash(root).length));
  if(p.startsWith(slash(overlay)+'/src/')&&!fileAt(p))return fileAt(slash(root)+p.slice(slash(overlay).length));
 },transform(code,id){return focused?.transform(code,slash(id));},
 transformIndexHtml(html){return {html,tags:[{tag:'script',attrs:{type:'module',src:'/investigation/performance/probe.js'},injectTo:'head'}]};}
},preact()],worker:{format:'es'},build:{target:'es2022',outDir:out,emptyOutDir:true,sourcemap:true,chunkSizeWarningLimit:900}});
const git=args=>spawnSync('git',args,{cwd:root,encoding:'utf8'}).stdout.trim();
const sources=git(['ls-files','src']).split('\n').map(f=>({file:f,sha256:createHash('sha256').update(readFileSync(resolve(root,f))).digest('hex')}));
const assets=readdirSync(resolve(out,'assets')).filter(n=>/\.(js|css)$/.test(n)).sort().map(n=>({file:n,sha256:createHash('sha256').update(readFileSync(resolve(out,'assets',n))).digest('hex')}));
const proposal=focused?{file:focused.file,sha256:createHash('sha256').update(focused.adopt(readFileSync(resolve(root,focused.file),'utf8'))).digest('hex')}:null;
mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'provenance.json'),JSON.stringify({phase,look,base:git(['rev-parse','HEAD']),released:'e5a6bf35',sources,assets,proposal,highFixture:look==='high'?JSON.parse(readFileSync(resolve(dir,'local/round3/high-source.json'))):null},null,2));
