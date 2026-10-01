const fs=require('node:fs'),path=require('node:path');
const read=(mode,size)=>fs.readFileSync(path.join(__dirname,'local',mode,`${size}.jsonl`),'utf8').trim().split('\n').map(JSON.parse);
const q=(a,p)=>{const s=a.slice().sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor(s.length*p))];};
const rows=[];
for(const size of [96,128,256])for(const mode of ['before','after']) {
  const all=read(mode,size),a=all.filter(m=>!m.error);
  if(all.length!==20||a.length!==20||new Set(a.map(m=>m.seed)).size!==20)throw Error(`Incomplete ${mode} ${size}`);
  const row={size,mode,allThree:a.filter(m=>m.ok&&m.outcomes?.met).length,
    absolutesFailed:a.filter(m=>!m.ok).length,promise:a.filter(m=>m.outcomes?.promise).length,
    readable:a.filter(m=>m.outcomes?.water).length,standout:a.filter(m=>m.outcomes?.standout).length,
    majoritySea:a.filter(m=>(m.outcomes?.signature?.mainBody??0)>0.5).length,
    firstLandMs:{median:q(a.map(m=>m.ms.firstLook),.5),p90:q(a.map(m=>m.ms.firstLook),.9)},
    cpuLandMs:{median:q(a.map(m=>m.cpu.land),.5),p90:q(a.map(m=>m.cpu.land),.9)},
    waterMs:{median:q(a.map(m=>m.ms.water),.5),p90:q(a.map(m=>m.ms.water),.9)},
    sea:a.map(m=>m.outcomes?.signature?.mainBody??0),water:a.map(m=>m.outcomes?.signature?.water??0),
    maxSettleTicks:Math.max(...a.map(m=>m.settleTicks)),
    minLogs:Math.min(...a.map(m=>m.walk?.logs??0)),minMines:Math.min(...a.map(m=>m.mines.walked)),
    minBerries:Math.min(...a.map(m=>m.bushesNear)),maxLandAttempts:Math.max(...a.map(m=>m.attempts)),
    headsLeaking:a.filter(m=>m.head.losing).length,multipleShown:a.filter(m=>m.shown!==1).length,
    worn:a.filter(m=>m.worn).length,failures:a.filter(m=>!m.ok).map(m=>({seed:m.seed,checks:m.failedChecks}))};
  row.settled=a.filter(m=>JSON.parse(fs.readFileSync(path.join(__dirname,'local',mode,`${size}-${m.seed}-checks.json`),'utf8')).settle.settled).length;
  row.warnings={};
  for(const m of a)for(const c of JSON.parse(fs.readFileSync(path.join(__dirname,'local',mode,`${size}-${m.seed}-checks.json`),'utf8')).checks) {
    if(!c.ok&&c.severity==='warning')row.warnings[c.id]=(row.warnings[c.id]??0)+1;
  }
  row.sea={min:Math.min(...row.sea),median:q(row.sea,.5),max:Math.max(...row.sea)};
  row.water={min:Math.min(...row.water),median:q(row.water,.5),max:Math.max(...row.water)};
  rows.push(row);
}
fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify(rows,null,2)+'\n');
console.log(JSON.stringify(rows,null,2));
const cycleFile=path.join(__dirname,'local/after/cycles.jsonl');
if(fs.existsSync(cycleFile)) {
  const all=fs.readFileSync(cycleFile,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const cycles=[96,128,256].map(size=>{
    const a=all.filter(m=>m.size===size),expected=size===256&&!process.env.ISLANDS_FULL_CYCLES?3:20;
    if(a.length!==expected||new Set(a.map(m=>m.seed)).size!==expected)throw Error(`Incomplete weather replay ${size}`);
    return {size,seeds:a.map(m=>m.seed),count:a.length,startWaterFailures:a.filter(m=>m.startWater).length,
      farmlandFailures:a.filter(m=>m.farmland).length,maxLandReached:Math.max(...a.map(m=>m.land))};
  });
  fs.writeFileSync(path.join(__dirname,'cycle-results.json'),JSON.stringify(cycles,null,2)+'\n');
}
