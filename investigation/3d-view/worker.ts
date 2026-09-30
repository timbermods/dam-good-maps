import {Terrain,meshes,fields,dirtyChunks} from './geometry';
let old:Terrain|undefined,light:Uint8Array|undefined,oldLevel=23;
self.onmessage=e=>{
 const {id,W,H,mask,moist,level}=e.data,t=new Terrain(W,H,mask),start=performance.now();
 const same=old&&old.W===W&&old.H===H,keys=same?dirtyChunks(t,old!.cols):undefined;
 let box: {x0:number;y0:number;x1:number;y1:number}|undefined;
 if(same&&keys?.length){box={x0:W,y0:H,x1:0,y1:0};for(let i=0;i<t.N;i++)if(t.cols[i]!==old!.cols[i]){box.x0=Math.min(box.x0,i%W);box.x1=Math.max(box.x1,i%W);box.y0=Math.min(box.y0,Math.floor(i/W));box.y1=Math.max(box.y1,Math.floor(i/W));}}
 const f=fields(t,moist,same?light:undefined,box);light=f.light;
 const geometry=meshes(t,level,same&&oldLevel===level?keys:undefined);old=t;oldLevel=level;
 // Retain the worker's light field. One coherent revision is transferred to the renderer.
 const upload=f.light.slice();
 self.postMessage({id,geometry,light:upload,soil:f.soil,ms:performance.now()-start}, {transfer:[upload.buffer,f.soil.buffer,...geometry.flatMap(m=>[m.positions.buffer,m.normals.buffer,m.indices.buffer,m.cap.buffer])]});
};
