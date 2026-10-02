// A green partial corpus must never be mistaken for permission to adopt this investigation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE} from './common.mjs';
const status=JSON.parse(readFileSync(resolve(HERE,'STATUS.json')));
const missing=Object.entries(status.gates).filter(([,passed])=>passed!==true).map(([name])=>name);
assert.equal(missing.length,0,'NOT READY FOR ADOPTION: '+missing.join(', '));
console.log('All required adoption gates marked passed; inspect their pinned evidence before adoption.');
