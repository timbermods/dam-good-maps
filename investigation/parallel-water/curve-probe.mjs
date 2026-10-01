import http from 'node:http';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {HERE,LOCAL,deps,json} from './common.mjs';
await deps('esbuild').build({entryPoints:[resolve(HERE,'curve-probe.ts')],outfile:resolve(LOCAL,'curve-probe.js'),bundle:true,platform:'browser',target:'es2022'});
const host=http.createServer((req,res)=>{if(req.url==='/probe.js'){res.setHeader('Content-Type','text/javascript');res.end(readFileSync(resolve(LOCAL,'curve-probe.js')));}else{res.setHeader('Content-Type','text/html');res.end('<script src="/probe.js"></script>');}});
await new Promise(r=>host.listen(0,'127.0.0.1',r));
const output={engines:{},mismatches:[]};
try {
  for(const name of ['chromium','firefox','webkit']) {
    const browser=await deps('playwright')[name].launch({headless:true});
    try{const page=await browser.newPage();await page.goto(`http://127.0.0.1:${host.address().port}`);const rows=await page.evaluate(()=>probe());output.engines[name]={version:browser.version(),rows};
      const reference=output.engines.chromium.rows;
      for(const mode of Object.keys(rows))for(let i=0;i<rows[mode].length;i++)if(JSON.stringify(reference[mode][i])!==JSON.stringify(rows[mode][i]))output.mismatches.push({engine:name,mode,tick:rows[mode][i].tick,components:Object.keys(reference[mode][i]).filter(k=>reference[mode][i][k]!==rows[mode][i][k])});
    }finally{await browser.close();}
  }
}finally{host.close();json('curve-probe.json',output);}
console.log(JSON.stringify(output.mismatches));
