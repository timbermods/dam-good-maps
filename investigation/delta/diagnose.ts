import {readFileSync} from 'node:fs';
import {deltaHydro} from './prototype';
import {straightness} from '../../src/core/analysis/straight';
const size=Number(process.argv[2]||256),seed=Number(process.argv[3]||1);
const m=JSON.parse(readFileSync(`${__dirname}/local/after/${size}-${seed}.json`,'utf8'));
const h=new Uint8Array(size*size),hy=deltaHydro(h,m.info.genome,seed,size,size);
console.log('planned',straightness(size,size,Float64Array.from(hy.water)));
const st=straightness(size,size,m.water);console.log('settled',st.longest,st.canal);
