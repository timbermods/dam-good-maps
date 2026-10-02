import {deps,json} from './common.mjs';
const rows={};
for(const name of ['chromium','firefox','webkit']){const b=await deps('playwright')[name].launch({headless:true});try{const page=await b.newPage();rows[name]=await page.evaluate(()=>{const x=17*(21/60-.5),positive=Math.exp(x),negative=Math.exp(-x),sum=positive+negative,forcing=1/sum+.5,hex=v=>{const d=new DataView(new ArrayBuffer(8));d.setFloat64(0,v);return d.getBigUint64(0).toString(16).padStart(16,'0');};return Object.fromEntries(Object.entries({x,positive,negative,sum,forcing}).map(([k,v])=>[k,{value:v,bits:hex(v)}]));});}finally{await b.close();}}
json('weather-exp-terms.json',rows);console.log(JSON.stringify(rows,null,2));
