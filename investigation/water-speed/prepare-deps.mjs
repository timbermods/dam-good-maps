// Provision only an ignored manifest; the caller installs into local/deps.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {ROOT,LOCAL,json} from './common.mjs';
const pkg=JSON.parse(readFileSync(resolve(ROOT,'package.json'),'utf8'));
const lock=JSON.parse(readFileSync(resolve(ROOT,'package-lock.json'),'utf8'));
const dependencies={...pkg.dependencies,...pkg.devDependencies,esbuild:'0.28.2'};
for(const name of Object.keys(dependencies))dependencies[name]=lock.packages['node_modules/'+name]?.version??dependencies[name];
json(resolve(LOCAL,'deps/package.json'),{name:'water-speed-local-dependencies',private:true,type:'module',dependencies});
console.log('npm --prefix local/deps install');
