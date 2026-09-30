import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { quietEvidence } from './window-policy.mjs';
const dir = fileURLToPath(new URL('.', import.meta.url));
const statusPath = resolve(dir,'local/window-status.json'), loadPath = resolve(dir,'local/window-load.jsonl');
const status = JSON.parse(readFileSync(statusPath));
const evidence = quietEvidence(readFileSync(loadPath,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),status.window.start,status.window.end);
const manifests = readdirSync(resolve(dir,'local/runs')).map(folder => resolve(dir,'local/runs',folder,'manifest.json')).filter(existsSync).map(path => ({path, ...JSON.parse(readFileSync(path))}));
const qualified = manifests.filter(m => m.mode !== 'smoke').flatMap(m => m.results.filter(r => r.qualified && r.status === 'complete').map(r => ({manifest:m.path,phase:m.phase,mode:m.mode,...r})));
const counts = {timings:qualified.filter(r=>r.mode==='measure').length,captures:qualified.filter(r=>r.mode==='capture').length,hours:qualified.filter(r=>r.longSession).length};
const result = {window:{start:new Date(status.window.start).toISOString(),end:new Date(status.window.end).toISOString()},
  runner:{started:status.started,finished:status.finished,state:status.state,attempts:status.attempts.length,pendingTasks:status.pending.length,hour:status.hourChoice},
  load:evidence,allManifestsInspected:manifests.length,qualified:counts,
  sources:[statusPath,loadPath].map(path=>({path:path.slice(dir.length).replaceAll('\\','/'),sha256:createHash('sha256').update(readFileSync(path)).digest('hex')})),
  limitation:'Original runner stopped at its hour reservation deadline. No CPU samples exist for the remaining 61 minutes; later quietness is unknown. Scheduling fallback repaired afterward; no retrospective measurements.'};
writeFileSync(resolve(dir,'window-proof.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
