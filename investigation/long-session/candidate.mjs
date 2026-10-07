// The same minimal change supplied in adoption/milestone.patch, applied only in test compiler memory.
export const oldBlock=`    const run = s.canonicalRun();
    const w = await settleInSlices(run.model, current, onProgress);
    if (!w) return null;
    s.adoptWater(run.model, w);`;
export const newBlock=`    const model = s.built.waterModel;
    const w = await settleInSlices(model, current, onProgress);
    if (!w) return null;
    s.adoptWater(model, w);`;
export function applyCandidate(source){
 const code=source.replaceAll('\r\n','\n');
 if(code.split(oldBlock).length!==2)throw new Error('Expected exactly one background-check allocation block');
 return code.replace(oldBlock,newBlock);
}
