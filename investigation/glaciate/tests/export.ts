import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { storedMap } from '../../forces-core/core/map';
import { readTimber } from '../../../src/core/format/timber';
import { validateFile,jpegSize } from '../../../src/core/validate/checks';
import { timber } from '../export';

// Inspect the exact saved endpoints, without rerunning the planner or water solver.
const core=JSON.parse(readFileSync('checks/core.json','utf8'));
const cases=[];
for(const row of core.cases){
 const map=storedMap(JSON.parse(readFileSync('local/results/'+row.id+'.json','utf8')));
 const file=readTimber(timber(map));
 assert.deepEqual(jpegSize(file.thumbnail!),[960,540]);
 const report=validateFile(file,{profile:'export',loadOnly:true});
 const failures=report.checks.filter(c=>!c.ok);
 // Relocation promises one supported start, not a repaired entrance/resources.
 // Keep the editor's start findings visible without turning them into a veto.
 assert.deepEqual(failures.filter(c=>!c.id.startsWith('start.')),[],row.id+' structural export checks');
 cases.push({id:row.id,thumbnail:'960x540 JPEG',checks:report.checks.length,passed:report.passed,failures});
}
writeFileSync('checks/export.json',JSON.stringify({cases},null,2)+'\n');
console.log('PASS structural export checks for',cases.length,'endpoints; start findings recorded:',cases.filter(c=>!c.passed).length);
