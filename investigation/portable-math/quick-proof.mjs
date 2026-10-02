// Reconcile optional product checks against the untouched experimental source.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {LOCAL,json} from './common.mjs';
const read=n=>JSON.parse(readFileSync(resolve(LOCAL,n+'.json'),'utf8'));
const assertions=r=>r.testResults.flatMap(r=>r.assertionResults);
const passed=n=>new Set(assertions(read(n)).filter(r=>r.status==='passed').map(r=>r.fullName));
const native=read('native-quick'),fixedNative=passed('native-assets-recheck'),fixedAdopted=passed('adopted-assets-recheck');
const before=assertions(native).filter(r=>r.status==='failed'&&!fixedNative.has(r.fullName)).map(r=>r.fullName).sort();
const after=readFileSync(resolve(LOCAL,'quick-tests.log'),'utf8').split(/\r?\n/).filter(r=>/^ FAIL  /.test(r)).map(r=>r.split(' > ').slice(1).join(' ')).filter(r=>!fixedAdopted.has(r)).sort();
if(JSON.stringify(before)!==JSON.stringify(after))throw Error('New optional product quick-test failures');
const repaired=assertions(native).filter(r=>r.status==='failed'&&fixedNative.has(r.fullName)).length;
const result={source:'e292cefe30469033a922650f0455f87297c051d5',tests:native.numTotalTests,passed:native.numPassedTests+repaired,pending:native.numPendingTests,baselineFailures:before.length,newFailures:0,failureNames:before};
if(result.passed!==836||result.baselineFailures!==15||result.pending!==13)throw Error('Unexpected quick-test evidence');
json('quick-proof.json',result);console.log('Optional product quick suite:',result.passed,'passed;',before.length,'identical baseline failures;',result.pending,'skipped; no new failures');
