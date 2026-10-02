// One generation at a time: wall timings are not throughput timings.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const mode = process.argv[2] || 'after';
const sizes = (process.argv[3] || '96,128,256').split(',').map(Number);
for (const size of sizes) {
  const out = path.join(__dirname, 'local', `${mode}-${size}.jsonl`);
  const result = spawnSync(process.execPath, [path.join(__dirname, 'run.cjs'), '../../investigation/m9b/measures.ts', '--one', Array.from({length:20}, (_,k)=>`riverValley:${k+1}`).join(','), '--size', String(size)], {
    cwd: path.resolve(__dirname, '../..'), env: {...process.env, RV_MODE:mode, RV_CAPTURE:'1'}, encoding:'utf8', maxBuffer:32*1024*1024,
  });
  fs.writeFileSync(out, result.stdout || '');
  if (result.status !== 0) throw new Error(String(result.error || result.stderr || `batch failed: ${result.status}`));
  const maps = result.stdout.trim().split('\n').map(l=>JSON.parse(l));
  if (maps.length !== 20 || maps.some(m=>m.error)) throw new Error(`Incomplete batch: ${out}`);
  console.log(JSON.stringify({mode,size,maps:maps.length,all:maps.filter(m=>m.outcomes?.met).length,water:maps.filter(m=>m.outcomes?.water).length,failed:maps.filter(m=>!m.ok).length}));
}
