import {createHash} from 'node:crypto';
import {strict as assert} from 'node:assert';
// Hash complete typed-array bytes, not rounded JSON floats. Include type and shape boundaries.
export function digest(value) {
  const hash=createHash('sha256');
  const seen=new Set();
  function visit(v) {
    if(v===null || typeof v!=='object'){hash.update(typeof v+':'+String(v)+';');return;}
    if(seen.has(v))throw Error('cyclic identity input'); seen.add(v);
    if(ArrayBuffer.isView(v)){hash.update(v.constructor.name+':'+v.byteLength+':');hash.update(new Uint8Array(v.buffer,v.byteOffset,v.byteLength));}
    else if(v instanceof Map){hash.update('Map:'+v.size+':');for(const [k,x]of v){visit(k);visit(x);}}
    else if(v instanceof Set){hash.update('Set:'+v.size+':');for(const x of v)visit(x);}
    else if(Array.isArray(v)){hash.update('Array:'+v.length+':');for(const x of v)visit(x);}
    else {hash.update('Object:');for(const k of Object.keys(v).sort()){if(typeof v[k]==='function')continue;hash.update(k+':');visit(v[k]);}}
    seen.delete(v);hash.update('|');
  }
  visit(value);return hash.digest('hex');
}
export function identityState(r,lands) {
  const {timings,failures,...rest}=r;
  // Timings and failure elapsed milliseconds are explicitly informational in M9b.
  return {...rest,failures:failures.map(({ms,...f})=>f),lands};
}
export function compareRaw(a,b,path='result') {
  if(typeof a==='function'&&typeof b==='function')return;
  if(a===null||typeof a!=='object'){assert(Object.is(a,b),path);return;}
  assert(b!==null&&typeof b==='object',path);
  assert.equal(a.constructor?.name,b.constructor?.name,path+' type');
  if(ArrayBuffer.isView(a)){assert.equal(a.byteLength,b.byteLength,path+' length');assert(Buffer.from(a.buffer,a.byteOffset,a.byteLength).equals(Buffer.from(b.buffer,b.byteOffset,b.byteLength)),path+' bytes');return;}
  if(a instanceof Map||a instanceof Set){compareRaw([...a],[...b],path);return;}
  const keys=Object.keys(a).sort();assert.deepEqual(keys,Object.keys(b).sort(),path+' keys');for(const k of keys)compareRaw(a[k],b[k],path+'.'+k);
}
export function resultIdentity(r,lands) {
  return {full:digest(identityState(r,lands)),
    terrain:digest(r.built.heights),water:digest([r.built.water,r.built.contamination,r.built.settle]),
    objects:digest(r.built.entities),timber:digest(r.bytes),firstLand:digest(lands),
    decisions:digest([r.spec.accepted,r.attempts,r.info,r.failures.map(({ms,...f})=>f),r.report])};
}
