import {expect,it} from 'vitest';
import {generate} from '../../src/core/gen/generate';
import {makeSpec} from '../../src/core/spec/mapspec';
import {outcomesOf} from '../../src/core/gen/outcomes';
import {checkIntention} from '../../src/core/land/intentions';
const map=(seed:number)=>generate(makeSpec({seed,theme:'riverValley',size:{x:128,y:128},designedFor:'normal'}));
it('12 keeps its valley and readable water, with contamination outside the default start distance',()=>{
 const r=map(12),o=outcomesOf(r);expect(r.report.passed).toBe(true);expect(o.promise).toBe(true);expect(o.story.readable).toBe(true);
 expect(o.story.reach).toBeGreaterThanOrEqual(.45);
 const start=r.built.start!;let bad=Infinity;
 for(let i=0;i<128*128;i++)if(r.built.water[i]>.05&&r.built.contamination[i]>=.05)bad=Math.min(bad,Math.hypot(i%128-start.x,Math.floor(i/128)-start.y));
 expect(bad).toBeGreaterThanOrEqual(r.spec.settings.start.rules.badwaterWithin);
 expect(r.report.checks.find(c=>c.id==='start.water')?.ok).toBe(true);
});
it('6 uses an entering trunk rather than the spring-only pond plan',()=>{
 const r=map(6);expect(r.report.passed).toBe(true);expect(outcomesOf(r).story.readable).toBe(true);
 const main=r.features.find(f=>f.kind==='river'&&!f.params.badwater&&'edge' in f.params.entry);expect(main).toBeDefined();
});
for(const [seed,span] of [[5,88],[27,99]])it(`${seed} preserves dev's cliff split`,()=>{
 const r=map(seed);expect(r.report.passed).toBe(true);
 const cliff=checkIntention('upper-lower',{W:128,H:128,h:r.built.heights,start:r.built.start} as any);
 expect(cliff.ok).toBe(true);expect(cliff.note).toContain(`spans ${span}%`);
});
