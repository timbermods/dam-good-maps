import * as THREE from 'three';
import type { Point } from './engine';
export interface Head extends Point {z:number;progress:number}
/** Carve's fixed instanced pool, reoriented along a racing fault. No allocations per frame. */
export class Rupture {
 readonly group=new THREE.Group();
 private dust=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshLambertMaterial({color:0xd5bea0,transparent:true,opacity:.38,depthWrite:false}),64);
 private crack=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x342f28,depthTest:false}));
 private dummy=new THREE.Object3D();private head:Head|null=null;
 constructor(){this.dust.frustumCulled=false;this.crack.renderOrder=8;this.group.add(this.crack,this.dust);}
 moveHead(head:Head){this.head=head;this.crack.visible=false;}
 set(head:Head|null,path:Point[],heights:Uint8Array,W:number){
  this.head=head;this.crack.visible=true;const pts=path.slice(0,Math.ceil((head?.progress??0)*path.length)).map(p=>new THREE.Vector3(p.x+.5,heights[Math.max(0,Math.min(heights.length-1,Math.round(p.y)*W+Math.round(p.x)))]+.16,-p.y-.5));
  this.crack.geometry.dispose();this.crack.geometry=new THREE.BufferGeometry().setFromPoints(pts);
 }
 update(time:number,on:boolean){
  this.group.visible=on&&!!this.head;if(!this.group.visible)return;const h=this.head!,d=this.dummy;
  for(let k=0;k<64;k++){const phase=(time*.85+k*.381)%1,a=k*2.4,spread=.5+phase*4;
   d.position.set(h.x+Math.cos(a)*spread,h.z+.3+phase*4,-h.y+Math.sin(a)*spread);d.rotation.set(k,phase,k*.2);d.scale.setScalar((.18+(k%6)*.07)*(1-phase));d.updateMatrix();this.dust.setMatrixAt(k,d.matrix);
  }this.dust.instanceMatrix.needsUpdate=true;
 }
}
