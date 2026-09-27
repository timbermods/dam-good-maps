import {View as CoreView} from '../forces-core/demo/view';
import type {Chunk} from '../forces-core/core/meshes';
import {FALL_STRIDE,fallTemplate} from '../../src/render3d/falls';
import {fallMaterial} from '../../src/render3d/materials';
import {BufferAttribute,InstancedBufferGeometry,InstancedInterleavedBuffer,InterleavedBufferAttribute,Mesh} from 'three';
export type {ViewState,Lighting} from '../forces-core/demo/view';
/** The core study viewer predates the editor's D201 fall pass. Reuse that exact
 * template/material and the fall records already emitted by meshWaterChunk.
 * Falls live inside the chunk group, so snapshots, undo and disposal include them. */
export class View extends CoreView {
 private fallShape=fallTemplate();private fallMat=fallMaterial(this.uniforms);
 private preserveCamera=false;
 override reset(W:number,H:number,layers:number[]){this.preserveCamera=this.W>0;super.reset(W,H,layers);this.preserveCamera=false;}
 override resetView(){if(this.preserveCamera)return;this.camera.fov=42;this.camera.updateProjectionMatrix();this.controls.maxPolarAngle=Math.PI*.49;this.controls.enableDamping=false;super.resetView();this.camera.position.sub(this.controls.target).multiplyScalar(1.2).add(this.controls.target);this.controls.update();}
 override hit(clientX:number,clientY:number){this.camera.updateMatrixWorld(true);return super.hit(clientX,clientY);}
 override upload(c:Chunk){
  super.upload(c);const water=c.water as Chunk['water']&{falls:Float32Array;fallCount:number};if(!water.fallCount)return;
  const g=new InstancedBufferGeometry(),buf=new InstancedInterleavedBuffer(water.falls,FALL_STRIDE);
  g.setAttribute('rib',new BufferAttribute(this.fallShape.rib,4));g.setIndex(new BufferAttribute(this.fallShape.index,1));
  for(const [name,offset]of [['fA',0],['fTop',4],['fShape',8],['fMore',12]] as [string,number][])g.setAttribute(name,new InterleavedBufferAttribute(buf,4,offset));
  g.instanceCount=water.fallCount;for(const [start,count]of this.fallShape.layers)g.addGroup(start,count,0);
  const mesh=new Mesh(g,[this.fallMat]);mesh.name='editor-waterfalls';mesh.frustumCulled=false;mesh.matrixAutoUpdate=false;mesh.renderOrder=3;this.stage!.get(c.key)!.add(mesh);
 }
 get fallCount(){let n=0;for(const g of this.groups.values()){const m=g.getObjectByName('editor-waterfalls') as Mesh|undefined;if(m)n+=(m.geometry as InstancedBufferGeometry).instanceCount;}return n;}
}
