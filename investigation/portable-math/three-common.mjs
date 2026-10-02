import {resolve,dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import {deps,ROOT} from './common.mjs';
export function threeRoot(){
 const dir=process.env.DGM_THREE??dirname(deps.resolve('three/package.json'));
 const version=JSON.parse(readFileSync(resolve(dir,'package.json'))).version;
 const expected=JSON.parse(readFileSync(resolve(ROOT,'package-lock.json'))).packages['node_modules/three'].version;
 if(version!==expected)throw Error('Three version differs from product lock: '+version+' / '+expected);
 return dir;
}
