export function analysisProfile(bridge,backend){const totals={},stack=[];
 return {totals,replace(name,args){if(backend!=='typescript')return bridge.replace(name,args);},enter(name){const token={name,t:performance.now(),child:0};stack.push(token);return token;},leave(token){const ms=performance.now()-token.t;stack.pop();const row=totals[token.name]??={calls:0,total:0,self:0};row.calls++;row.total+=ms;row.self+=ms-token.child;if(stack.length)stack.at(-1).child+=ms;}};
}
export function analysisTime(totals){return Object.entries(totals).filter(([k])=>/^(math\/grid|analysis\/|validate\/)/.test(k)||k==='sim/prefill.ts:spillLevels'||k==='land/minePads.ts:roomMap'||k==='gen/outcomes.ts:outcomesOf').reduce((s,[,v])=>s+v.self,0);}
