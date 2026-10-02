import {exact} from './codec.mjs';
export function higher(api,payload){
 const out={},file=payload.fileBytes?api.readTimber(payload.fileBytes):null;
 if(file){const v=api.validateMap(file,payload.opts);out.validation={report:v.report,analysis:v.analysis,mechanics:v.mechanics};}
 if(payload.measurable)out.metrics=api.measure(payload.measurable);
 if(payload.outcomeInput)out.outcomes=api.outcomesOf(payload.outcomeInput);
 if(payload.playability){const c=new api.Collector('import');const input=file?{...payload.playability,objects:api.mapObjects(file.world)}:payload.playability;out.playability={analysis:api.checkPlayability(input,c),checks:c.checks};}
 return exact(out);
}
export function argsOf(input){let at=3;const np=input[at++],p=input.slice(at,at+np);at+=np;const na=input[at++],a=[];for(let k=0;k<na;k++){const n=input[at++];a.push(input.slice(at,at+n));at+=n;}const op=input[0],W=input[1],H=input[2];
 const h=Uint8Array.from(a[0]),mask=v=>Uint8Array.from(v),links=v=>Array.from({length:v.length/2},(_,i)=>[v[2*i],v[2*i+1]]);
 if(op===1)return [mask(a[0]),W,H];
 if(op===2)return [h,W,H,mask(a[1]),links(a[2]),{x:p[0],y:p[1]},p[2]];
 if(op===3)return [h,W,H,mask(a[1]),links(a[2])];if(op===4)return [a[0],W,H,mask(a[1])];if(op===5)return [mask(a[0]),W,H,!!p[0]];if(op===6)return [h,W,H];
 if(op===7)return [{W,H,floor:a[0],dam:a[1],emitters:[{cells:Array.from(a[2].keys()).filter(i=>a[2][i]),strength:1,contamination:0}]}];
 if(op===9)return [h,W,H,{wet:a[1],keep:mask(a[2]),want:p[0],lo:p[1],firm:p[2]}];
 return [h,mask(a[1]),a[2],W,H,a[3].length?a[3]:null,p[0],a[4],p[1],p[2],p[3]];
}
export function frames(bytes){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=0;const out=[];while(at<bytes.length){const n=view.getUint32(at,true);at+=4;const absolute=bytes.byteOffset+at;out.push(absolute%8?new Float64Array(bytes.buffer.slice(absolute,absolute+n)):new Float64Array(bytes.buffer,absolute,n/8));at+=n;}if(at!==bytes.length)throw Error('frame boundary');return out;}
