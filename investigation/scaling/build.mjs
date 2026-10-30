import {build} from 'vite';
import preact from '@preact/preset-vite';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url)),root=resolve(dir,'../..');
const phase=process.argv[2]??'before';
if(!['before','after'].includes(phase))throw Error('before|after');
const proposal=phase==='after'?(await import('./proposal.mjs')).adopt:(_f,s)=>s;
await build({root,configFile:false,base:'/',mode:'e2e',plugins:[{name:'scaling-observation',enforce:'pre',transform(code,id){
  const path=id.replaceAll('\\','/');let s=proposal(path.slice(root.replaceAll('\\','/').length+1),code);
  if(path.endsWith('/src/ui/App.tsx'))s=s.replace('  function openFile(file: File) {','  (window as any).scalingOpen = openBytes;\n  function openFile(file: File) {');
  if(path.endsWith('/src/worker/generator.worker.ts'))s=s.replace('  openTimber:', '  scalingMemory: () => ed.scalingMemory(),\n  openTimber:');
  if(path.endsWith('/src/worker/session.ts'))s+=`\nexport function scalingMemory() { return (${readFileSync(resolve(dir,'retained.js'),'utf8')})(session); }\n`;
  if(path.endsWith('/src/render3d/renderer.ts'))s+=`\n(window as any).scalingVerify = (r: any) => {
    const same = (a: any, b: any) => { const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength), y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength); return x.length === y.length && x.every((v: number, i: number) => v === y[i]); };
    const m = r.map, failures: string[] = [];
    for (const [key, mesh] of r.terrain) { const [cx, cy] = key.split(',').map(Number), d = meshChunk(m.source, cx, cy), g = mesh.geometry;
      if (!same(d.positions, g.attributes.position.array) || !same(d.normals, g.attributes.normal.array) || !same(d.indices, g.index.array)) failures.push('terrain:' + key); }
    if (!r.waterQueue.size) { const lower = lowerByTile(m.surface, m.water);
      for (const [key, mesh] of r.water) { const [cx, cy] = key.split(',').map(Number), d = meshWaterChunk(m.W, m.H, m.heights, m.surface, m.water, lower, cx, cy), g = mesh.geometry;
        if (!same(d.positions, g.attributes.position.array) || !same(d.normals, g.attributes.normal.array) || !same(d.indices, g.index.array) || !same(d.data, g.attributes.wdata.array) || !same(d.flags, g.attributes.wflags.array)) failures.push('water:' + key); }
    }
    return {failures, terrain: r.terrain.size, water: r.water.size, waterQueue: r.waterQueue.size};
  };\n`;
  return s===code?undefined:{code:s,map:null};
},transformIndexHtml(html){return {html,tags:[{tag:'script',attrs:{type:'module',src:'/investigation/scaling/probe.js'},injectTo:'head'}]};}},preact()],worker:{format:'es',plugins:()=>[{name:'scaling-worker-observation',enforce:'pre',transform(code,id){
  const path=id.replaceAll('\\','/');let s=proposal(path.slice(root.replaceAll('\\','/').length+1),code);
  if(path.endsWith('/src/worker/generator.worker.ts'))s=s.replace('  openTimber:', '  scalingMemory: () => ed.scalingMemory(),\n  openTimber:');
  if(path.endsWith('/src/worker/session.ts'))s+=`\nexport function scalingMemory() { return (${readFileSync(resolve(dir,'retained.js'),'utf8')})(session); }\n`;
  return s===code?undefined:{code:s,map:null};
}}]},build:{target:'es2022',outDir:resolve(dir,'local/build',phase),emptyOutDir:true,chunkSizeWarningLimit:1500}});
