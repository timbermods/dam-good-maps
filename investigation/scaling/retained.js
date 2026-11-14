function retained(root) {
  const seen=new Set(),buffers=new Set(),strings=new Set();let arrayBuffers=0,stringCharacters=0,objects=0;
  const visit=(v)=>{
    if(typeof v==='string'){if(!strings.has(v)){strings.add(v);stringCharacters+=v.length;}return;}
    if(v===null||typeof v!=='object'||seen.has(v))return;seen.add(v);objects++;
    if(ArrayBuffer.isView(v)){if(!buffers.has(v.buffer)){buffers.add(v.buffer);arrayBuffers+=v.buffer.byteLength;}return;}
    if(v instanceof ArrayBuffer){if(!buffers.has(v)){buffers.add(v);arrayBuffers+=v.byteLength;}return;}
    if(v instanceof Map){for(const [k,x]of v){visit(k);visit(x);}return;}
    if(v instanceof Set){for(const x of v)visit(x);return;}
    for(const x of Object.values(v))visit(x);
  };visit(root);
  return {arrayBuffers,stringCharacters,objects,snapshots:root?.snaps?.size,history:root?.undoStack?.length,operations:root?.log?.length};
}
