import {performance} from 'node:perf_hooks';
export function trace() {
  let phase='preland',last=performance.now();const stack=[],totals={},categories={};
  function category(label){
    if(/makeField|deltaField/.test(label))return 'shaping';
    if(/planLandStage|islandStage/.test(label))return 'planning';
    if(/pickStart|prepareStart|settlerView|droughtStorage/.test(label))return 'start';
    if(/minePads|roomMap/.test(label))return 'mines';
    if(/damWalls|straightness|outcomesOf/.test(label))return 'checks';
    if(/canonicalSettle|:settle$/.test(label))return 'settle';
    if(/buildMap|prefill/.test(label))return 'build-prefill';
    if(/planBadwater/.test(label))return 'hazards';
    if(/validateMap/.test(label))return 'validation';
    return null;
  }
  function charge(){const now=performance.now(),dt=now-last;last=now;if(!stack.length)return;const f=stack.at(-1);const k=phase+':'+f.label;const t=totals[k]??={calls:0,self:0};t.self+=dt;const c=phase+':'+f.category;categories[c]=(categories[c]??0)+dt;}
  return {totals,categories,enter(label){charge();const f={label,category:category(label)??stack.at(-1)?.category??'other'};stack.push(f);const k=phase+':'+label;(totals[k]??={calls:0,self:0}).calls++;return f;},leave(f){if(!f)return;charge();if(stack.pop()!==f)throw Error('trace imbalance');},land(){charge();phase='postland';},finish(){charge();if(stack.length)throw Error('unfinished trace');}};
}
