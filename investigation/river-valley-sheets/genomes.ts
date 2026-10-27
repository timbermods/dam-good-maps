import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {drawGenome,leanGenome} from '../../src/core/land/genome';
import {makeSpec,AVAILABLE_THEMES} from '../../src/core/spec/mapspec';
const hashes={};
for(const theme of AVAILABLE_THEMES.filter(t=>t!=='riverValley')){
 const genomes=[];
 for(let seed=1;seed<=30;seed++)for(let attempt=0;attempt<9;attempt++){
  const spec=makeSpec({seed,theme,size:{x:128,y:128},designedFor:'normal'});
  const g=drawGenome(theme,seed,128,128,attempt);leanGenome(g,spec.settings,128,128,seed,attempt,spec.designedFor);genomes.push(g);
 }
 hashes[theme]=createHash('sha256').update(JSON.stringify(genomes)).digest('hex');
}
const mode=process.env.RV_MODE||'dev';
writeFileSync(`investigation/river-valley-sheets/local/genomes-${mode}.json`,JSON.stringify(hashes,null,2)+'\n');
console.log(hashes);
