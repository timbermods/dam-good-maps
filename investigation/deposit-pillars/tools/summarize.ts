import {readFileSync,writeFileSync} from 'node:fs';
const b='investigation/deposit-pillars';
const before=JSON.parse(readFileSync(`${b}/local/before/summary.json`,'utf8'));
const after=JSON.parse(readFileSync(`${b}/local/final/summary.json`,'utf8'));
if(before.length!==14||after.length!==14||after.some((r:any)=>r.spiky||r.scattered||r.weak||r.refused||r.volumeChanges))throw Error('Sweep incomplete or defective');
const rows=after.map((r:any,i:number)=>{const old=before[i];if(r.theme!==old.theme||r.side!==old.side||JSON.stringify(r.skipped)!==JSON.stringify(old.skipped))throw Error('Mismatched sweep inputs');return {...r,before:{kept:old.kept,refused:old.refused,spiky:old.spiky,scattered:old.scattered,weak:old.weak}};});
writeFileSync(`${b}/sweep-summary.json`,JSON.stringify(rows,null,2)+'\n');
let table='| Theme | Size | Uses kept | Old pillars | Old scattered | New refused | New pillars | New scattered | New weak | Volume losses | Tiny fans expanded |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n';
for(const r of rows)table+=`| ${r.theme} | ${r.side}² | ${r.kept} | ${r.before.spiky} | ${r.before.scattered} | ${r.refused} | ${r.spiky} | ${r.scattered} | ${r.weak} | ${r.volumeChanges} | ${r.expandedSmallFans} |\n`;
const sums=(side:number)=>rows.filter((r:any)=>r.side===side).reduce((s:any,r:any)=>({uses:s.uses+r.uses,kept:s.kept+r.kept,refused:s.refused+r.refused,oldPillars:s.oldPillars+r.before.spiky,oldScattered:s.oldScattered+r.before.scattered,expanded:s.expanded+r.expandedSmallFans}),{uses:0,kept:0,refused:0,oldPillars:0,oldScattered:0,expanded:0});
const small=sums(64),large=sums(128);
const oldSamples=JSON.parse(readFileSync(`${b}/local/before/samples.json`,'utf8'));
const newSamples=JSON.parse(readFileSync(`${b}/local/final/samples.json`,'utf8'));
const lookup=new Map(newSamples.map((s:any)=>[`${s.theme}/${s.seed}/${s.k}`,s]));
const cases=oldSamples.filter((s:any)=>s.k<3&&lookup.has(`${s.theme}/${s.seed}/${s.k}`)).slice(0,20);
if(cases.length!==20)throw Error('Missing sheet cases');
const metric=(s:any)=>{let volume=0;const xs:number[]=[],ys:number[]=[];for(let i=0;i<s.heights.length;i++)if(s.heights[i]>s.input[i]){volume+=s.heights[i]-s.input[i];xs.push(i%128);ys.push((i/128)|0);}return {volume,area:xs.length,xSpan:Math.max(...xs)-Math.min(...xs)+1,ySpan:Math.max(...ys)-Math.min(...ys)+1};};
const sheet=cases.map((old:any,i:number)=>{const next:any=lookup.get(`${old.theme}/${old.seed}/${old.k}`);if(next.reason||JSON.stringify(old.input)!==JSON.stringify(next.input)||JSON.stringify(old.path)!==JSON.stringify(next.path)||old.power!==next.power)throw Error('Sheet gestures changed');return {case:i+1,theme:old.theme,power:old.power,before:metric(old),after:metric(next)};});
if(sheet.some(r=>r.before.volume!==r.after.volume||r.after.xSpan<r.before.xSpan||r.after.ySpan<r.before.ySpan))throw Error('Sheet volume or extent shrank');
writeFileSync(`${b}/sheet-summary.json`,JSON.stringify(sheet,null,2)+'\n');
let sheetTable='| Case | Theme | Power | Before blocks | After blocks | Before span | After span |\n| --- | --- | ---: | ---: | ---: | --- | --- |\n';
for(const r of sheet)sheetTable+=`| ${String(r.case).padStart(2,'0')} | ${r.theme} | ${r.power} | ${r.before.volume} | ${r.after.volume} | ${r.before.xSpan} × ${r.before.ySpan} | ${r.after.xSpan} × ${r.after.ySpan} |\n`;
const summary=[
 'Deposit retains its original lobed cone, reach, curving distributaries and normal sediment volume.',
 'Short draws and clicks make connected fans at every Power, including zero; no length gate remains.',
 'The shaping fix reconnects lobes and spreads excess column height, with caps based on actual donor cuts.',
 `64²: all seven themes, all ${small.uses} uses kept; zero pillars, scattered results, weak keeps or volume losses.`,
 `128²: all seven themes, all ${large.uses} uses kept; zero pillars, scattered results, weak keeps or volume losses.`,
 `${small.uses+large.uses-small.expanded-large.expanded} original budgets match exactly; ${small.expanded+large.expanded} tiny effects grow to nine real blocks for visible small fans (D356).`,
 '44 other-force pins unchanged; all 50 fixtures match native/Wasm; five Deposit pins re-pinned; 13 contracts and typechecks pass.',
 'The same 20 before | after gestures are refreshed and inspected; cases 03, 09 and 18 retain their old volumes and full fans.'
];
writeFileSync(`${b}/REPORT.md`,summary.join('\n')+'\n\n'+`[20-pair contact sheet](docs/sheets/deposit-pillars.png) · [adoption patch](adoption.patch) · [integration](INTEGRATION.md) · [evidence](EVIDENCE.md) · [cause and reproduction](DETAILS.md)\n`);
writeFileSync(`${b}/EVIDENCE.md`,table+`\nThe baseline reproduced ${small.oldPillars} / ${large.oldPillars} uses with pillars and ${small.oldScattered} / ${large.oldScattered} uses with disconnected deposits at 64² / 128². [sweep-summary.json](sweep-summary.json) records every cell and rejected generator seed. Both phases use the same three passing maps per cell. Raw height arrays and per-use results stay in gitignored local/ (D195).\n\nThe original worker evaluates every identical request alongside the revised worker. All 1,680 revised uses keep; 1,677 preserve their exact original deposited volume. Three original tiny effects use nine blocks instead: one Lake Basin and one Islands case at 64², and one Delta case at 128². Supplemental permitted upstream/shoulder cuts pay for the added visibility; balance stays zero. The normal cone budget and reach stay intact.\n\n`+sheetTable+`\nAll 20 sheet cases preserve their original volumes and retain or extend their receiving spans, including all seven Power 0 gestures. [sheet-summary.json](sheet-summary.json) also records receiving areas. Cases 03, 09 and 18 retain their 1,508 / 491 / 661 blocks and 44 × 47 / 41 × 33 / 41 × 33 receiving spans. Orange is deposited sediment; blue is donor excavation. The source terrain and image are procedural project outputs.\n\n[verification.json](verification.json) records 44 unchanged other-force pins, five Deposit re-pins, all 50 native/Wasm matches, 96 short-line fans, and six Deposit fixture geometry/budget matches. The 13 focused contracts and both typechecks pass. The adoption patch applies cleanly at the pinned base.\n\nNo product file changed, no other checkout was touched, and no speed measurements or Timberborn probes ran. The sheet stays under investigation/deposit-pillars/; adoption copies it to docs/sheets/deposit-pillars.png. See [DETAILS.md](DETAILS.md) for the shaping and reproduction.\n`);
console.log({small,large,sheet:sheet.map(r=>({case:r.case,old:r.before,after:r.after}))});
