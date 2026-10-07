import assert from 'node:assert/strict';
export async function verify(page,label) {
 const original=await page.evaluate(async()=>{
   const e=window.dgmEditor, r=window.dgm3d.renderer;
   const bytes=await e.worker.project(6);
   return {heights:Array.from(r.mapState().heights),project:Array.from(bytes.bytes),generated:window.dgm?.current?.()?.sha256};
 });
 // A real brush stroke and the editor's real undo; nothing is measured as a speed test.
 await page.keyboard.press('1');await page.waitForFunction(()=>window.dgm3d.renderer.tool && !('wantsAlt' in window.dgm3d.renderer.tool));
 await page.getByRole('button',{name:'Top-down',exact:true}).click();
 const tile=await page.evaluate(()=>{
   const r=window.dgm3d.renderer, m=r.mapState();
   for(let y=5;y<m.H-5;y++)for(let x=5;x<m.W-5;x++)if(m.heights[y*m.W+x]<16&&m.surface.depth[y*m.W+x]===0)return{x,y,client:r.tileToClient(x+.5,y+.5)};
   throw Error('No dry brush tile');
 });
 await page.mouse.move(tile.client.x,tile.client.y);await page.mouse.down();await page.mouse.up();
 await page.waitForFunction(()=>window.dgmEditor.pendingTerrain()===0);await page.evaluate(()=>window.dgmEditor.idle());
 const changed=await page.evaluate(()=>Array.from(window.dgm3d.renderer.mapState().heights));
 assert.notDeepEqual(changed,original.heights,'The brush must change real terrain');
 await page.keyboard.press('Control+z');await page.evaluate(()=>window.dgmEditor.idle());await page.waitForFunction(()=>window.dgmEditor.pendingTerrain()===0);
 const undone=await page.evaluate(()=>Array.from(window.dgm3d.renderer.mapState().heights));assert.deepEqual(undone,original.heights,'Undo must restore exact terrain bytes');
 // Create a kept edit and wait for the canonical water and the project's stored-map refresh.
 await page.evaluate(async()=>{const e=window.dgmEditor;await e.edit({op:'sculpt',params:{mode:'raise',cells:[[12,12,13]],amount:1}},'First-load persistence probe');await e.worker.whenWaterSettles();});
 await page.waitForFunction(()=>!window.dgmEditor.info().waterPending);
 if(label.startsWith('page'))await page.waitForFunction(()=>window.dgm?.kept?.(window.dgmEditor.info().version));
 const kept=await page.evaluate(async()=>{
   const e=window.dgmEditor;
   const version=e.info().version;
   const db=await new Promise((r,j)=>{const q=indexedDB.open('dgm-your-maps');q.onsuccess=()=>r(q.result);q.onerror=j;});
   const id=JSON.parse(localStorage.getItem('dgm.current')).id;
   const bytes=await new Promise((r,j)=>{const tx=db.transaction('projects','readonly');const q=tx.objectStore('projects').get(id);q.onsuccess=()=>r(q.result);q.onerror=j;});db.close();
   const text=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
   const doc=JSON.parse(text);return{version,stored:!!doc.stored,bytes:bytes.length};
 });
 assert.equal(kept.stored,true,'Your maps must refresh the settled project with its stored map');
 // Save/export remains the full validator, even when called before an advisory report.
 const exported=await page.evaluate(async()=>{const e=window.dgmEditor;await e.worker.deferChecks();const r=await e.worker.exportTimber(true);return {ok:r.ok,bytes:r.bytes.length,errors:r.errors};});
 assert.equal(exported.ok,true,JSON.stringify(exported.errors));assert.ok(exported.bytes>0);
 // Removing the generated start is a feature operation (deleting its object alone is refused).
 const blocked=await page.evaluate(async()=>{const e=window.dgmEditor;const start=e.info().features.find(f=>f.kind==='start');const removed=await e.worker.apply({op:'deleteFeature',params:{id:start.id}},'user','Invalid export probe');if(!removed.ok)throw Error(JSON.stringify(removed.errors));const r=await e.worker.exportTimber(true);return{ok:r.ok,bytes:r.bytes.length,errors:r.errors};});
 assert.equal(blocked.ok,false,'Removing the start must retain the export refusal');assert.equal(blocked.bytes,0);
 await page.evaluate(()=>window.dgmEditor.worker.editorReady());
 return {checksDisabledForExport:true,brushChanged:true,undoExact:true,settledAutosave:kept,exported,blocked,generated:original.generated};
}
