// The trial's valid measurements count toward the core; no duplicate pacing runs.
export function trialTasks() {
  return ['standard','high'].flatMap(look=>Array.from({length:5},(_,i)=>['before','after'].map(phase=>({
    browser:'edge',profile:'native',size:256,look,id:'craterize-fast',mode:'measure',repeat:i+1,repeats:1,phase,trial:true
  }))).flat());
}
export function alreadyInTrial(task) {
  return task.mode==='measure'&&task.browser==='edge'&&task.profile==='native'&&task.size===256&&
    task.id==='craterize-fast'&&['standard','high'].includes(task.look)&&task.repeat>=1&&task.repeat<=5;
}
export function runOutcome(code,rows) {
  if(rows.some(r=>['invalid-busy','blocked-busy'].includes(r.status)))return 'busy';
  return code===0&&rows.length&&rows.every(r=>r.qualified&&r.status==='complete')?'complete':'error';
}
