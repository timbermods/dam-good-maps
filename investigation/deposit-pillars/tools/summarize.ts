import{readFileSync,writeFileSync}from'node:fs';
const b='investigation/deposit-pillars';const before=JSON.parse(readFileSync(`${b}/local/before/summary.json`,'utf8'));const after=JSON.parse(readFileSync(`${b}/local/after/summary.json`,'utf8'));
if(before.length!==14||after.length!==14||after.some((r:any)=>r.spiky||r.scattered||r.weak))throw Error('Sweep incomplete or defective');
const rows=after.map((r:any,i:number)=>{const old=before[i];if(r.theme!==old.theme||r.side!==old.side||JSON.stringify(r.skipped)!==JSON.stringify(old.skipped))throw Error('Mismatched sweep inputs');return {...r,before:{kept:old.kept,refused:old.refused,spiky:old.spiky,scattered:old.scattered,weak:old.weak}};});
writeFileSync(`${b}/sweep-summary.json`,JSON.stringify(rows,null,2)+'\n');
let table='| Theme | Size | Uses | Old pillars | Old scattered | New kept | New refused | New pillars | New scattered | New weak |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n';
for(const r of rows)table+=`| ${r.theme} | ${r.side}² | ${r.uses} | ${r.before.spiky} | ${r.before.scattered} | ${r.kept} | ${r.refused} | ${r.spiky} | ${r.scattered} | ${r.weak} |\n`;
const sums=(side:number)=>rows.filter((r:any)=>r.side===side).reduce((s:any,r:any)=>({uses:s.uses+r.uses,kept:s.kept+r.kept,refused:s.refused+r.refused,oldPillars:s.oldPillars+r.before.spiky,oldScattered:s.oldScattered+r.before.scattered}),{uses:0,kept:0,refused:0,oldPillars:0,oldScattered:0});
const small=sums(64),large=sums(128);
const summary=[
 'Deposit now allocates conserved sediment across one connected fan, with no lone pillars or scattered receiving tiles.',
 'Cause: full-height allocation by noisy tile rank, plus a fallback that invented and inflated nearby receiving sites.',
 'Fix: connected layers, donor-aware neighbour caps, and atomic refusal when a nine-tile receiving patch cannot fit.',
 'Draws under eight tiles always refuse with one actionable line before seeded shaping; clicks retain their placement rules.',
 `64²: all seven themes, ${small.uses} uses, ${small.kept} kept / ${small.refused} refused; zero pillars, scattered results or weak keeps.`,
 `128²: all seven themes, ${large.uses} uses, ${large.kept} kept / ${large.refused} refused; zero pillars, scattered results or weak keeps.`,
 '44 other-force pins unchanged; native/Wasm identical on all 50 fixtures; five Deposit pins re-pinned; 12 contracts and typechecks pass.',
 '20 before | after Deposits at 128² are in docs/sheets/deposit-pillars.png below; inspected directly, with the adoption patch and guide ready.'
];
writeFileSync(`${b}/REPORT.md`,summary.join('\n')+'\n\n'+`[20-pair contact sheet](docs/sheets/deposit-pillars.png) · [adoption patch](adoption.patch) · [integration](INTEGRATION.md) · [evidence](EVIDENCE.md) · [cause and reproduction](DETAILS.md)\n`);
writeFileSync(`${b}/EVIDENCE.md`,table+`\nThe baseline reproduced ${small.oldPillars} / ${large.oldPillars} uses with pillars and ${small.oldScattered} / ${large.oldScattered} uses with disconnected deposits at 64² / 128². Refused generator seeds are recorded in [sweep-summary.json](sweep-summary.json); three passing maps per cell are used in both phases, without silently losing theme coverage. Raw failures and height arrays stay in gitignored \`local/\` (D195).\n\nShort-line cutoff and the largest connected receiving patch on split/wet ground are deliberate shaping choices. See [DETAILS.md](DETAILS.md). No product file changed, no other checkout touched, no speed measurements or Timberborn probes run. The sheet is staged here so everything stays under \`investigation/deposit-pillars/\`; adoption copies it to \`docs/sheets/deposit-pillars.png\`.\n`);
console.log({small,large});
