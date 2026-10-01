import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),local=path.join(here,'local');
await mkdir(local,{recursive:true});
await build({entryPoints:[path.join(here,'codes.ts')],bundle:true,platform:'node',format:'esm',outfile:path.join(local,'codec.mjs')});
const {encode,decode}=await import(pathToFileURL(path.join(local,'codec.mjs')).href);
const matrix=JSON.parse(await readFile(path.join(local,'matrix.json'),'utf8'));
const descriptions=matrix.runs.flatMap(r=>[r.invite?.description,r.reply?.description]).filter(Boolean);
assert.ok(descriptions.length>=8,'Run matrix.mjs first to capture real Chromium/Firefox SDP.');
let corruptions=0,roundtrips=0;
const results=[];
for(const d of descriptions) {
  for(const encoding of ['base64url','base58','base32','base85']) {
    const result=encode(d,encoding),code=result.code,out=decode(code);
    assert.equal(result.profile,'compact');assert.equal(encode(out,encoding).code,code);roundtrips++;
    assert.deepEqual(decode(' \n'+code.slice(0,20)+'\n'+code.slice(20)+' '),out);
    if(encoding==='base32')assert.deepEqual(decode(code.slice(0,4)+code.slice(4).toLowerCase()),out);
    for(let i=4;i<code.length;i++) {
      const bad=code.slice(0,i)+(code[i]==='A'?'B':'A')+code.slice(i+1);
      assert.throws(()=>decode(bad),/mistyped|truncated|damaged/,`${encoding} substitution at ${i}`);corruptions++;
    }
    for(let i=4;i<code.length;i++){assert.throws(()=>decode(code.slice(0,i)),/mistyped|truncated|damaged/);corruptions++;}
    assert.throws(()=>decode(code+'A'),/mistyped|truncated|damaged/);corruptions++;
    assert.throws(()=>decode(code.replace('S1','S9')),/Unsupported/);
  }
  const unexpected={...d,sdp:d.sdp+'a=future-capability:preserve-this\r\n'};
  const fallback=encode(unexpected);assert.equal(fallback.profile,'lossless');assert.deepEqual(decode(fallback.code),unexpected);
  results.push({type:d.type,...encode(d),code:undefined});
}
// Addresses/candidates not available on this machine: codec proof only, not connection proof.
const synthetic={...descriptions[0],sdp:descriptions[0].sdp.replace(/^a=candidate:.*\r\n/gm,'')+
  'a=candidate:x 1 udp 2122260223 2001:db8::42 60001 typ host generation 0\r\n'+
  'a=candidate:y 1 udp 1686052607 203.0.113.42 60002 typ srflx raddr 192.0.2.42 rport 60001 generation 0\r\n'+
  'a=candidate:x 1 tcp 1518280447 2001:db8::42 9 typ host tcptype passive generation 0\r\n'};
for(const e of ['base64url','base58','base32','base85']) {
  const code=encode(synthetic,e);assert.equal(code.profile,'compact');const sdp=decode(code.code).sdp;
  assert.ok(sdp.includes('2001:db8:0:0:0:0:0:42'));assert.ok(sdp.includes('typ srflx raddr 192.0.2.42 rport 60001'));assert.ok(sdp.includes('typ host tcptype passive'));
  assert.equal(encode(decode(code.code),e).code,code.code);roundtrips++;
}
const summary={roundtrips,corruptions,losslessFallbacks:descriptions.length,syntheticIPv6SrflxTcp:true,results};
await writeFile(path.join(local,'codec-check.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({...summary,results:undefined}));
