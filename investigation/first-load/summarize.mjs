import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
const here='investigation/first-load',local=here+'/local';
const labels=['dev-before','dev-adopted','dev-before-reopen','dev-adopted-reopen','page-before','page-adopted','page-before-reopen','page-adopted-reopen'];
const median=values=>{const a=values.toSorted((a,b)=>a-b),mid=Math.floor(a.length/2);return a.length%2?a[mid]:(a[mid-1]+a[mid])/2;};
const data=Object.fromEntries(labels.map(label=>[label,JSON.parse(readFileSync(`${local}/${label}-results.json`))]));
const table=['| Target/input | Cold before → after | Warm before → after |','|---|---:|---:|'];
for(const [label,after,name] of [['dev-before','dev-adopted','dev / generate + Refine'],['dev-before-reopen','dev-adopted-reopen','dev / stored reopen'],['page-before','page-adopted','feature/page / generate'],['page-before-reopen','page-adopted-reopen','feature/page / stored reopen']]){
 const fmt=(key,visit)=>(median(data[key].results.filter(r=>r.visit===visit).map(r=>r.editable))/1000).toFixed(2)+' s';
 table.push(`| ${name} | ${fmt(label,'cold')} → ${fmt(after,'cold')} | ${fmt(label,'warm')} → ${fmt(after,'warm')} |`);
}
let csv='target,scenario,visit,repeat,first_request_to_editable_ms,parse_cpu_ms,compile_cpu_ms,wasm_module_call_sum_ms,requests_begun_before_editable_gzip_bytes,total_capture_body_bytes,map_sha256\n';
const compact=[];
for(const [label,d] of Object.entries(data))for(const r of d.results){
 const wasm=r.worker.events.filter(e=>e.name.includes('wasm-')&&e.duration!==undefined);
 const sum=wasm.reduce((n,e)=>n+e.duration,0)+r.measures.filter(e=>e.name.startsWith('fl:wasm-')).reduce((n,e)=>n+e.duration,0);
 csv+=[label,r.scenario,r.visit,r.run,r.editable.toFixed(1),r.parse.toFixed(1),r.compile.toFixed(1),sum.toFixed(2),r.transferredToEditable,r.transferred,r.generated?.sha256||''].join(',')+'\n';
 compact.push({label,scenario:r.scenario,visit:r.visit,run:r.run,editableMs:+r.editable.toFixed(1),parseCpuMs:+r.parse.toFixed(1),compileCpuMs:+r.compile.toFixed(1),wasmModuleCallSumMs:+sum.toFixed(2),marks:r.marks,worker:r.worker.events.filter(e=>['worker-evaluated','generate:start','generate:end','refine:start','refine:end','openProject:start','openProject:end','replica-follow','editorReady:start','backgroundCheck:start'].includes(e.name)).map(e=>({name:e.name,atMs:+e.at.toFixed(1)})),mapSHA256:r.generated?.sha256,isolated:r.isolated,pageErrors:r.errors,correctness:r.correctness});
}
writeFileSync(here+'/measurements.csv',csv);
const cache=JSON.parse(readFileSync(`${local}/page-adopted-http-cleared-reopen-results.json`)).results[1];
writeFileSync(here+'/evidence.json',JSON.stringify({pins:{dev:'009a00b034136ba25fdff1d0e0d5977be1a13e78',page:'beee673e2dc3fb75d04277f0baf47755deb9fae9'},hardware:data['page-before'].hardware,ua:data['page-before'].results[0].ua,gpu:data['page-before'].results[0].gpu,results:compact,cacheWithHttpCleared:{isolated:cache.isolated,errors:cache.errors,assetNetworkRequests:cache.requests.filter(r=>/assets.*\.(js|css)$/.test(r.url)),pageAssetResponses:cache.network.filter(r=>/assets.*\.(js|css)$/.test(r.url)).map(r=>({path:new URL(r.url).pathname,serviceWorker:r.sw,status:r.status}))}},null,2)+'\n');
const stageTable=['| Generation stage (wall ms; overlaps) | Page cold before / after | Page warm before / after | Dev cold before / after |','|---|---:|---:|---:|'];
const fn={
 'Generator ready after construction':r=>r.worker.events.find(e=>e.name==='worker-evaluated').at-r.worker.workers[0].at,
 'Generator begins (final document clock)':r=>r.worker.events.find(e=>e.name==='generate:start').at,
 'Generate worker RPC':r=>r.worker.events.find(e=>e.name==='generate:end').at-r.worker.events.find(e=>e.name==='generate:start').at,
 'Open/refine worker RPC':r=>r.worker.events.find(e=>e.name==='refine:end').at-r.worker.events.find(e=>e.name==='refine:start').at,
 'Renderer warmup':r=>r.marks['fl:prepare-end']-r.marks['fl:prepare-start'],
 'Renderer setMap/first frame':r=>r.marks['fl:map-frame']-r.marks['fl:render-start'],
 'JS parse trace CPU':r=>r.parse,
 'Compile trace CPU':r=>r.compile,
 'Wasm Module calls summed across workers':r=>r.worker.events.filter(e=>e.name.includes('wasm-')).reduce((n,e)=>n+(e.duration||0),0),
 'Cold/warm request bodies started before editable (KiB)':r=>r.transferredToEditable/1024
};
for(const [name,f] of Object.entries(fn)){
 const avg=(l,v)=>{const n=median(data[l].results.filter(r=>r.visit===v).map(f));return Number.isFinite(n)?n.toFixed(1):'—';};
 stageTable.push(`| ${name} | ${avg('page-before','cold')} / ${avg('page-adopted','cold')} | ${avg('page-before','warm')} / ${avg('page-adopted','warm')} | ${avg('dev-before','cold')} / ${avg('dev-adopted','cold')} |`);
}
const resources=['| Page startup resource | Before raw / gzip KiB | After raw / gzip KiB |','|---|---:|---:|'];
for(const prefix of ['generator.worker','checks.worker','checksReplica','waterStrip.worker','main','jsxRuntime.module','Tooltip','Editor','bake.worker']){
 const sizes=l=>{const rows=data[l].results[0].requests.filter(r=>new URL(r.url,'http://local').pathname.split('/').at(-1).startsWith(prefix+'-')&&r.url.endsWith('.js'));return rows.length?rows.map(r=>`${(r.raw/1024).toFixed(1)} / ${(r.body/1024).toFixed(1)}`).join(' + '):'—';};resources.push(`| ${prefix}.js | ${sizes('page-before')} | ${sizes('page-adopted')} |`);
}
mkdirSync(here+'/captures',{recursive:true});copyFileSync(local+'/page-before-cold.png',here+'/captures/page-before.png');copyFileSync(local+'/page-adopted-cold.png',here+'/captures/page-after.png');
writeFileSync(local+'/tables.md',table.join('\n')+'\n\n'+stageTable.join('\n')+'\n\n'+resources.join('\n')+'\n');
console.log(table.join('\n'));console.log(stageTable.join('\n'));
