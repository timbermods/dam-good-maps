import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../src/platform/isolation',()=>({}));
vi.mock('comlink',()=>({ wrap:()=>({waterHelpers:()=>Promise.resolve(),connectChecks:()=>Promise.resolve()}),transfer:(x:unknown)=>x }));
import { createGenerator } from '../../src/platform/index';
afterEach(()=>vi.unstubAllGlobals());
it('F4: a denied second helper must leave a working one-thread generator and release partial helpers',()=>{
  vi.stubGlobal('crossOriginIsolated',true);vi.stubGlobal('navigator',{userAgent:'Chrome/150',hardwareConcurrency:8});vi.stubGlobal('document',{});
  let helpers=0,terminated=0;
  vi.stubGlobal('Worker',class { helper:boolean;constructor(url:URL) {this.helper=url.href.includes('waterStrip');if(this.helper&&++helpers===2)throw new DOMException('worker denied','SecurityError');}postMessage(){}terminate(){if(this.helper)terminated++;} });
  let threw=false;try{createGenerator();}catch{threw=true;}
  expect(threw).toBe(process.env.MERGE_REVIEW_EXPECT_BUGS === '1');
  expect(terminated).toBe(process.env.MERGE_REVIEW_EXPECT_BUGS !== '1'?1:0);
});
