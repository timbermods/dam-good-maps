// One-file experiment: replace transient boxed vertex arrays with reusable typed scratch storage.
// No scheduler, easing, solver, editor interface, or topology changes.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
export const root=resolve(import.meta.dirname,'../..'),file='src/render3d/waterMesh.ts';
const replacement=`class WaterBuffer {
  private capacity = 0;
  private pos = new Float32Array(0);
  private data = new Float32Array(0);
  private nrm = new Int8Array(0);
  private flg = new Float32Array(0);
  private idx = new Uint32Array(0);
  quads = 0;
  falls: number[] = [];
  reset(): void {
    this.quads = 0;
    this.falls.length = 0;
    // Do not keep an unusually large imported cave mesh's scratch allocation.
    if (this.capacity > 8192) {
      this.capacity = 0;
      this.pos = new Float32Array(0); this.data = new Float32Array(0);
      this.nrm = new Int8Array(0); this.flg = new Float32Array(0); this.idx = new Uint32Array(0);
    }
  }
  private reserve(): void {
    if (this.quads < this.capacity) return;
    const previous = this.capacity;
    this.capacity = Math.max(512, previous * 2);
    const pos = new Float32Array(this.capacity * 12); pos.set(this.pos); this.pos = pos;
    const data = new Float32Array(this.capacity * 8); data.set(this.data); this.data = data;
    const nrm = new Int8Array(this.capacity * 12); nrm.set(this.nrm); this.nrm = nrm;
    const flg = new Float32Array(this.capacity * 4); flg.set(this.flg); this.flg = flg;
    const idx = new Uint32Array(this.capacity * 6); idx.set(this.idx); this.idx = idx;
    for (let q = previous; q < this.capacity; q++) {
      const v = q * 4;
      idx.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
    }
  }
  quad(c: number[], depth: number, cont: number, nx: number, ny: number, nz: number, flags = 0): void {
    this.quad4(c, [depth, depth, depth, depth], [cont, cont, cont, cont], nx, ny, nz, flags);
  }
  quad4(c: number[], depth: readonly number[], cont: readonly number[], nx: number, ny: number, nz: number, flags = 0): void {
    this.reserve();
    const q = this.quads;
    this.pos.set(c, q * 12);
    for (let v = 0; v < 4; v++) {
      const d = q * 8 + v * 2, n = q * 12 + v * 3;
      this.data[d] = depth[v]; this.data[d + 1] = cont[v];
      this.nrm[n] = nx * 127; this.nrm[n + 1] = ny * 127; this.nrm[n + 2] = nz * 127;
      this.flg[q * 4 + v] = flags;
    }
    this.quads++;
  }
  finish(): WaterMeshData {
    const n = this.quads, falls = new Float32Array(this.falls);
    // Each answer owns its bytes; subsequent chunks cannot change retained geometry.
    return { positions: this.pos.slice(0, n * 12), data: this.data.slice(0, n * 8),
      flags: this.flg.slice(0, n * 4), normals: this.nrm.slice(0, n * 12),
      indices: this.idx.slice(0, n * 6), quads: n, falls, fallCount: falls.length / FALL_STRIDE };
  }
}

// Meshing is synchronous and does not call back into meshWaterChunk.
const waterScratch = new WaterBuffer();
`;
export function adopt(code){
 const text=code.replaceAll('\r\n','\n'),start=text.indexOf('class WaterBuffer {'),end=text.indexOf('/** Lower than this',start);
 if(start<0||end<0||!text.includes('const b = new WaterBuffer();'))throw Error('WaterBuffer adoption anchor changed');
 return (text.slice(0,start)+replacement+'\n'+text.slice(end)).replace('const b = new WaterBuffer();','const b = waterScratch;\n  b.reset();');
}
export function transform(code,id){if(!id.endsWith('/'+file))return;const result=adopt(code);return {code:result,map:{version:3,sources:[id],sourcesContent:[result],names:[],mappings:result.split('\n').map((_,i)=>i?'AACA':'AAAA').join(';')}};}
export function patch(){
 const dir=resolve(import.meta.dirname,'local/round3/patch');mkdirSync(dir,{recursive:true});
 const a=resolve(dir,'before.ts'),b=resolve(dir,'after.ts');writeFileSync(a,readFileSync(resolve(root,file),'utf8').replaceAll('\r\n','\n'));writeFileSync(b,adopt(readFileSync(a,'utf8')));
 const p=spawnSync('git',['diff','--no-index','--no-prefix','--',a,b],{encoding:'utf8'});if(p.status!==1)throw Error(p.error?.message??p.stderr);
 writeFileSync(resolve(import.meta.dirname,'brush-adoption.patch'),p.stdout.split('\n').map(l=>l.startsWith('diff --git ')?'diff --git a/'+file+' b/'+file:l.startsWith('--- ')?'--- a/'+file:l.startsWith('+++ ')?'+++ b/'+file:l===' '?'':l).join('\n'));
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.dirname,'brush-adoption.mjs'))patch();
