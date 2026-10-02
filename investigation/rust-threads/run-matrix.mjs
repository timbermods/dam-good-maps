import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {HERE,LOCAL,arg} from './common.mjs';
import {readFileSync,existsSync} from 'node:fs';
// Windows WebKit repeatedly closed when switching Wasm/TS pools in one page.
// One browser process per WebKit case/configuration bounds teardown and records retries.
async function run(args){return new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[HERE+'/measure.mjs',...args],{cwd:HERE,env:process.env,stdio:'inherit',windowsHide:true});
 child.on('error',reject);child.on('exit',code=>resolve(code));
});}
const smoke=process.argv.includes('--smoke'),counts=smoke?'1,2,3,4,7,8,16':'1,2,4,8,16';
for(const engine of arg('engines','chromium,firefox,webkit').split(',')){
 const groups=engine==='webkit'?[['rust-scalar','1'],...counts.split(',').flatMap(n=>[['rust',n],['typescript',n]])]:[['all',counts]];
 const cases=engine==='webkit'&&!smoke?JSON.parse(readFileSync(resolve(process.env.DGM_CHECKS,'checks.json'))).cases.filter(c=>/^m9b-(riverValley|lakeBasin|islands)-(128|256)-1$|^stress-(riverValley|lakeBasin|islands)-512$/.test(c.id)).map(c=>c.id):[null];
 for(const [backend,count]of groups)for(const id of cases){let code;
  if(id&&existsSync(resolve(LOCAL,'measurements.json'))&&JSON.parse(readFileSync(resolve(LOCAL,'measurements.json'))).rows.some(r=>r.stage==='bench'&&r.engine===engine&&r.id===id&&r.backend===backend&&r.threads===Number(count)))continue;
  for(let attempt=0;attempt<4;attempt++){
   code=await run(['--engines',engine,'--backend',backend,'--counts',count,'--resume',...(smoke?['--smoke']:[]),...(id?['--filter','^'+id+'$']:[])]);
   if(!code)break;console.log('Recorded interruption; resuming',engine,backend,count,'attempt',attempt+2);
  }
  if(code)throw Error('Repeated browser failure: '+engine+'/'+backend+'/'+count);
 }
}
