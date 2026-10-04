// @ts-ignore separate baseline module
import * as baseline from 'baseline-carve-api';
// @ts-ignore portable overlay module
import * as adopted from 'adopted-carve-api';
const hex=(b:Uint8Array)=>Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');
async function digest(x:any){
  const d=new DataView(new ArrayBuffer(8));
  const text=JSON.stringify(x,(_k,v)=>{
    if(typeof v==='number'){d.setFloat64(0,v,true);return {f64:hex(new Uint8Array(d.buffer))};}
    if(ArrayBuffer.isView(v)){const b=new Uint8Array((v as any).length*8),view=new DataView(b.buffer);for(let i=0;i<(v as any).length;i++)view.setFloat64(i*8,(v as any)[i],true);return {type:v.constructor.name,hex:hex(b)};}
    return v;
  });
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))));
}
async function run(api:any,c:any){
  const n=c.size,heights=new Uint8Array(n*n),entities:any[]=[];
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)heights[y*n+x]=Math.max(2,Math.min(16,15-Math.floor(y/24)-Math.floor((Math.abs(x-n*.5)+Math.abs(y-n*.4))/18)));
  for(let y=8;y<n-8;y+=8)for(let x=8;x<n-8;x+=8)entities.push(api.tree({id:`tree-${x}-${y}`,owner:'fixture',x,y,z:heights[y*n+x],species:'Pine',growth:.8}));
  const origin=Math.floor(n*.38)*n+Math.floor(n*.48),end=Math.floor(n*.82)*n+Math.floor(n*.65);
  const m={W:n,H:n,heights,entities,maxHeight:21,water:{depth:new Float64Array(n*n),contamination:new Float64Array(n*n)}};
  m.water.depth[origin]=2;
  const settings={...api.DEFAULTS,power:c.power,width:c.width,seed:927,mode:c.mode===1?'aim':'unleash',dry:c.mode===2};
  const intent={origin,...(c.mode===1?{end}:{})},r=new api.CarveRun(m,settings,intent,{sourceId:'fixed-source'});
  for(let i=0;!r.done&&i<3000;i++)r.step();if(!r.done)throw Error('Carve exceeded 3000 steps');
  const record=api.carveParams(m,r,{settings,origin:[origin%n,Math.floor(origin/n)],...(c.mode===1?{end:[end%n,Math.floor(end/n)]}:{}),cut:null});
  const values={map:r.map,head:r.head,trail:r.trail,metrics:r.metrics,record,steps:r.steps,reason:r.reason},components:any={};
  for(const [k,v]of Object.entries(values))components[k]=await digest(v);
  return {hash:await digest(components),components,steps:r.steps};
}
onmessage=async({data})=>{try{postMessage({id:data.id,baseline:await run(baseline,data),adopted:await run(adopted,data)});}catch(e){postMessage({id:data.id,error:String(e)});}};
