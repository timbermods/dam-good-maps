import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {strict as assert} from 'node:assert';
import {dir,root} from '../build.mjs';
const prefix=process.argv[2]??'round2-adopted',local=n=>resolve(dir,'local',n);
const jsonl=f=>readFileSync(f,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const sha=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
const median=a=>{assert(a.length);const s=a.slice().sort((a,b)=>a-b),i=s.length>>1;return s.length%2?s[i]:(s[i-1]+s[i])/2;};
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const themes=['any','riverValley','canyon','highlands','lakeBasin','delta','islands'],sizes=[96,128,256];
const names=['Any','River Valley','Canyon','Highlands','Lake Basin','Delta','Islands'];
const rows=jsonl(local(prefix+'.jsonl')),manifest=JSON.parse(readFileSync(local(prefix+'-manifest.json')));
assert.equal(rows.length,5040,'840 inputs, two variants, three repetitions required');
assert.equal(new Set(rows.map(r=>`${r.theme}/${r.size}/${r.seed}/${r.variant}/${r.rep}`)).size,5040,'duplicate rows');
for(const v of['after','round2'])assert.equal(sha(local(v+'-profile.mjs')),manifest.bundle[v],'bundle differs from recorded matrix');
const browsers=jsonl(local('round2-browsers.jsonl')),browserManifest=JSON.parse(readFileSync(local('round2-browsers-manifest.json')));
assert.equal(browsers.length,2520,'840 cases in all three engines required');
assert.equal(new Set(browsers.map(r=>r.key+'/'+r.engine)).size,2520);
assert.equal(sha(local('round2-browser.mjs')),browserManifest.bundleSha256);
const ui=jsonl(local('round2-browser-ui.jsonl'));assert.equal(ui.length,42,'all three paired production-page visits required');
assert(ui.every(r=>r.editUndo&&r.proof.response.passed));
for(const visit of ui){const ref=rows.find(r=>r.theme===visit.theme&&r.size===256&&r.seed===1&&r.rep===0&&r.variant===visit.variant);assert.deepEqual(visit.proof,ref.uiProof,'production UI/Node bytes '+visit.theme+'/'+visit.variant);}
const baseline=new Map(sizes.flatMap(size=>{
 const file=resolve(root,`investigation/m9b/baseline/13d1f1a2-${size}.jsonl.gz`);
 return gunzipSync(readFileSync(file)).toString().trim().split('\n').map(JSON.parse).map(r=>[`${r.theme}/${size}/${r.seed}`,r]);
}));
const key=r=>`${r.theme}/${r.size}/${r.seed}`;
const cells=[],rejections=[],checks=[],profileRows=[];let repeatChecks=0,crossEngineChecks=0;
for(const size of sizes)for(const theme of themes){
 const pick=v=>rows.filter(r=>r.size===size&&r.theme===theme&&r.variant===v);
 const before=pick('after'),after=pick('round2');assert.equal(before.length,120);assert.equal(after.length,120);
 const rep0=v=>pick(v).filter(r=>r.rep===0);
 for(let seed=1;seed<=40;seed++){
  const caseKey=`${theme}/${size}/${seed}`;
  for(const v of['after','round2']){
   const rs=pick(v).filter(r=>r.seed===seed);assert.deepEqual(rs.map(r=>r.rep).sort(),[0,1,2]);
   for(const row of rs.slice(1)){assert.deepEqual(row.identity,rs[0].identity,'repeat '+caseKey+'/'+v);repeatChecks++;}
  }
  const node=after.find(r=>r.seed===seed&&r.rep===0),control=before.find(r=>r.seed===seed&&r.rep===0),old=baseline.get(caseKey);
  assert.equal(control.passed,old.ok,'baseline failure set drift '+caseKey);
  assert.equal(control.outcomes?.met??false,old.outcomes?.met??false,'baseline outcome drift '+caseKey);
  assert(node.passed&&node.changed===0&&node.shown===1,'candidate absolute/first-land failure '+caseKey);
  const br=browsers.filter(r=>r.key===caseKey);assert.equal(br.length,3);
  for(const row of br){assert(row.passed&&row.changed===0&&row.shown===1);assert.deepEqual(row.components,node.components,'browser/Node maps '+caseKey+'/'+row.engine);assert.equal(row.hash,node.identity.full,'browser/Node full state '+caseKey+'/'+row.engine);crossEngineChecks++;}
  if((size===256&&((theme==='lakeBasin'&&seed===24)||(theme==='riverValley'&&seed===39)))||(!control.passed))checks.push({theme,size,seed,beforePassed:control.passed,afterPassed:node.passed,beforeChanged:control.changed,afterChanged:node.changed,beforeMet:control.outcomes?.met??false,afterMet:node.outcomes?.met??false});
 }
 const stats=(rs,f,valid=false)=>{
  const chosen=valid?rs.filter(r=>r.passed):rs;
  const bySeed=[...new Set(chosen.map(r=>r.seed))].map(seed=>median(chosen.filter(r=>r.seed===seed).map(f).filter(n=>Number.isFinite(n)&&n>=0)));
  const raw=chosen.map(f).filter(n=>Number.isFinite(n)&&n>=0);return{median:median(bySeed),worst:Math.max(...raw),observations:raw.length};
 };
 const redraw=r=>Math.max(0,r.genomes-1),refused=r=>r.attempts.filter(a=>!a.passed&&a.firstLand<0).length;
 const outcomes=rs=>({all:rs.filter(r=>r.outcomes?.met).length,promise:rs.filter(r=>r.outcomes?.promise).length,water:rs.filter(r=>r.outcomes?.water).length,standout:rs.filter(r=>r.outcomes?.standout).length,total:40});
 const b=rep0('after'),a=rep0('round2'),bo=outcomes(b),ao=outcomes(a);assert(ao.all>=bo.all,'outcome share declined '+theme+'/'+size);
 const load=rs=>({medianMean:median(rs.map(r=>r.load.mean).filter(Number.isFinite)),worst:Math.max(...rs.map(r=>r.load.max).filter(Number.isFinite)),missing:rs.filter(r=>r.load.samples===0).length});
 const inputSavings=Array.from({length:40},(_,i)=>{const seed=i+1;return 1-median(after.filter(r=>r.seed===seed).map(r=>r.cpu))/median(before.filter(r=>r.seed===seed).map(r=>r.cpu));});
 const cell={theme,size,beforeOutcomes:bo,afterOutcomes:ao,beforeFailures:b.filter(r=>!r.passed).map(r=>r.seed),afterFailures:a.filter(r=>!r.passed).map(r=>r.seed),beforeRedraws:{mean:mean(b.map(redraw)),worst:Math.max(...b.map(redraw)),total:b.reduce((s,r)=>s+redraw(r),0)},afterRedraws:{mean:mean(a.map(redraw)),worst:Math.max(...a.map(redraw)),total:a.reduce((s,r)=>s+redraw(r),0)},beforeRefused:{mean:mean(b.map(refused)),worst:Math.max(...b.map(refused)),total:b.reduce((s,r)=>s+refused(r),0)},afterRefused:{mean:mean(a.map(refused)),worst:Math.max(...a.map(refused)),total:a.reduce((s,r)=>s+refused(r),0)},firstLand:{before:stats(before,r=>r.timings.firstLook,true),after:stats(after,r=>r.timings.firstLook,true)},settledReturn:{before:stats(before,r=>r.timings.final,true),after:stats(after,r=>r.timings.final,true)},waterStart:{before:stats(before,r=>r.timings.firstWater,true),after:stats(after,r=>r.timings.firstWater,true)},cpu:{before:stats(before,r=>r.cpu),after:stats(after,r=>r.cpu),medianInputSaving:median(inputSavings)},load:{before:load(before),after:load(after)}};
 for(const [variant,rs]of[['after',before],['round2',after]])for(const phase of['preland','postland']){
  const categories=[...new Set(rs.flatMap(r=>Object.keys(r.prof.categories).filter(k=>k.startsWith(phase+':')).map(k=>k.slice(phase.length+1))))].sort();
  const phaseTotal=rs.reduce((s,r)=>s+Object.entries(r.prof.categories).filter(([k])=>k.startsWith(phase+':')).reduce((n,[,v])=>n+v,0),0);
  for(const category of categories){const metric=stats(rs,r=>r.prof.categories[phase+':'+category]??0);const total=rs.reduce((s,r)=>s+(r.prof.categories[phase+':'+category]??0),0);profileRows.push({theme,size,variant,phase,category,...metric,share:phaseTotal?total/phaseTotal:0});}
 }
 cells.push(cell);
 for(const variant of['after','round2'])for(const row of rep0(variant))for(const at of row.attempts.filter(a=>!a.passed&&a.firstLand<0))rejections.push({theme,size,variant,reason:at.stage});
}
const uiFailures=existsSync(local('round2-browser-ui-failures.jsonl'))?jsonl(local('round2-browser-ui-failures.jsonl')):[];
const browserCells=themes.map(theme=>{const measure=(variant,f)=>{const a=ui.filter(r=>r.theme===theme&&r.variant===variant);assert.equal(a.length,3);return{median:median(a.map(f)),worst:Math.max(...a.map(f))};};const event=(r,name)=>r.events.find(e=>e.name===name)?.at??NaN;return{theme,firstLand:{before:measure('after',r=>event(r,'landPaintFrame')),after:measure('round2',r=>event(r,'landPaintFrame'))},settled:{before:measure('after',r=>event(r,'settledPaintFrame')),after:measure('round2',r=>event(r,'settledPaintFrame'))},editable:{before:measure('after',r=>r.editable),after:measure('round2',r=>r.editable)}};});
const testFiles=['round2-final-tests.json','round2-resource-control.json','round2-rivers-control.json'];
const testResults=testFiles.map(f=>JSON.parse(readFileSync(local(f))));
const failedNames=r=>r.testResults.flatMap(f=>f.assertionResults.filter(a=>a.status==='failed').map(a=>a.fullName)).sort();
assert.deepEqual(failedNames(testResults[0]),testResults.slice(1).flatMap(failedNames).sort(),'new contract failure');
assert.equal(testResults[0].numPassedTests,49);assert.equal(testResults[0].numFailedTests,3);assert.equal(testResults[0].numPendingTests,2);
const contracts={passed:49,failed:3,skipped:2,newFailures:0,existingFailures:failedNames(testResults[0]),rawSha256:Object.fromEntries(testFiles.map(f=>[f,sha(local(f))]))};
const deps=process.env.DGM_DEPS??resolve(root,'../../../startup/local/checkout');
const dependencyVersions=Object.fromEntries(['fflate','preact','@preact/signals','comlink','three','esbuild','typescript','vite','vitest'].map(n=>[n,JSON.parse(readFileSync(resolve(deps,'node_modules',n,'package.json'))).version]));
const evidence={contracts,dependencyVersions,patches:{round1:sha(resolve(dir,'adoption.patch')),round2:sha(resolve(dir,'round2/adoption.patch'))},baselineRawSha256:Object.fromEntries(sizes.map(size=>[size,sha(resolve(root,`investigation/m9b/baseline/13d1f1a2-${size}.jsonl.gz`))])),inputs:840,repetitions:3,generations:5040,repeatStateChecks:repeatChecks,crossEngineStateChecks:crossEngineChecks,candidateFailures:0,candidateChangedTiles:0,candidateCallbacks:1,outcomeGates:21,passedOutcomeGates:21,checks,cells,browserCells,uiFailures,manifest,browserManifest,rawFiles:Object.fromEntries([prefix+'.jsonl',prefix+'-manifest.json','round2-browsers.jsonl','round2-browsers-manifest.json','round2-browser-ui.jsonl','round2-browser-ui-manifest.json'].map(f=>[f,sha(local(f))])),harness:Object.fromEntries(['build.mjs','identity.mjs','trace.mjs','browser.mjs','prepare-browser.mjs','round2/worker.mjs','round2/matrix.mjs','round2/browsers.mjs','round2/prototype.mjs','round2/make-patch.mjs','round2/summarize.mjs','round2/contact-sheet.py','typecheck.mjs','tests.config.mjs'].map(f=>[f,sha(resolve(dir,f))]))};
writeFileSync(resolve(dir,'round2/EVIDENCE.json'),JSON.stringify(evidence,null,2)+'\n');
writeFileSync(resolve(dir,'round2/PROFILE.csv'),'theme,size,variant,phase,category,median_ms,worst_ms,observations,phase_share\n'+profileRows.map(r=>[r.theme,r.size,r.variant,r.phase,r.category,r.median,r.worst,r.observations,r.share].join(',')).join('\n')+'\n');
const headings=['theme','size','outcomes_before_of_40','outcomes_after_of_40','redraw_mean_before','redraw_worst_before','redraw_mean_after','redraw_worst_after','refused_mean_before','refused_worst_before','refused_mean_after','refused_worst_after','land_median_before_ms','land_worst_before_ms','land_median_after_ms','land_worst_after_ms','settled_median_before_ms','settled_worst_before_ms','settled_median_after_ms','settled_worst_after_ms','cpu_per_input_median_saving','load_median_before','load_worst_before','load_missing_before','load_median_after','load_worst_after','load_missing_after'];
const lines=cells.map(c=>[c.theme,c.size,c.beforeOutcomes.all,c.afterOutcomes.all,c.beforeRedraws.mean,c.beforeRedraws.worst,c.afterRedraws.mean,c.afterRedraws.worst,c.beforeRefused.mean,c.beforeRefused.worst,c.afterRefused.mean,c.afterRefused.worst,c.firstLand.before.median,c.firstLand.before.worst,c.firstLand.after.median,c.firstLand.after.worst,c.settledReturn.before.median,c.settledReturn.before.worst,c.settledReturn.after.median,c.settledReturn.after.worst,c.cpu.medianInputSaving,c.load.before.medianMean,c.load.before.worst,c.load.before.missing,c.load.after.medianMean,c.load.after.worst,c.load.after.missing].join(','));
writeFileSync(resolve(dir,'round2/TIMINGS.csv'),headings.join(',')+'\n'+lines.join('\n')+'\n');
writeFileSync(resolve(dir,'round2/BROWSER.csv'),'theme,variant,first_land_median_ms,first_land_worst_ms,settled_median_ms,settled_worst_ms,editable_median_ms,editable_worst_ms,load_median_mean,load_worst,load_missing\n'+browserCells.flatMap(c=>['before','after'].map(side=>{const v=side==='before'?'after':'round2',rs=ui.filter(r=>r.theme===c.theme&&r.variant===v);return[c.theme,v,c.firstLand[side].median,c.firstLand[side].worst,c.settled[side].median,c.settled[side].worst,c.editable[side].median,c.editable[side].worst,median(rs.map(r=>r.load.mean).filter(Number.isFinite)),Math.max(...rs.map(r=>r.load.max).filter(Number.isFinite)),rs.filter(r=>!r.load.samples).length].join(',');})).join('\n')+'\n');
const grouped=new Map();for(const r of rejections){const k=[r.theme,r.size,r.variant,r.reason].join(',');grouped.set(k,(grouped.get(k)??0)+1);}writeFileSync(resolve(dir,'round2/REJECTIONS.csv'),'theme,size,variant,reason,count\n'+[...grouped].map(([k,v])=>k+','+v).join('\n')+'\n');
const fmt=x=>(x.median/1000).toFixed(2)+' / '+(x.worst/1000).toFixed(2);
const table=['| Theme | Size | Redraws/map mean / worst before → after | First land before → after | Settled return before → after | All three /40 before → after |','|---|---:|---:|---:|---:|---:|',...cells.map(c=>`| ${names[themes.indexOf(c.theme)]} | ${c.size}² | ${c.beforeRedraws.mean.toFixed(2)} / ${c.beforeRedraws.worst} → ${c.afterRedraws.mean.toFixed(2)} / ${c.afterRedraws.worst} | ${fmt(c.firstLand.before)} → ${fmt(c.firstLand.after)} | ${fmt(c.settledReturn.before)} → ${fmt(c.settledReturn.after)} | ${c.beforeOutcomes.all} → ${c.afterOutcomes.all} |`)];
writeFileSync(local('round2-table.md'),table.join('\n')+'\n');
console.log('All outcome, absolute, strict first-land, repeat and cross-engine gates pass; tables written.');
