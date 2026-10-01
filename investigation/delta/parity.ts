import {generate} from '../../src/core/gen/generate';
import {makeSpec} from '../../src/core/spec/mapspec';
import {createHash} from 'node:crypto';
for(const theme of ['any','riverValley'] as const){const r=generate(makeSpec({theme,seed:2,size:{x:96,y:96}}));console.log(JSON.stringify({theme,ok:r.report.passed,sha256:createHash('sha256').update(r.bytes).digest('hex')}));}
