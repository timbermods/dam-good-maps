import * as THREE from 'three';
import type { Anatomy } from './engine';
/** Like Carve's Surge: fixed pools, no timers or particle allocation in the frame loop. */
export class ImpactEffects {
  readonly group=new THREE.Group();
  private dust=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshBasicMaterial({color:0xc7b295,transparent:true,opacity:.3,depthWrite:false}),64);
  private chunks=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshLambertMaterial({color:0x73634d}),32);
  private shock=new THREE.Mesh(new THREE.RingGeometry(.97,1,96),new THREE.MeshBasicMaterial({color:0xffe7be,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}));
  private flash=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({color:0xfff5d5,transparent:true,opacity:.8,depthWrite:false}));
  private streak=new THREE.Mesh(new THREE.CylinderGeometry(.1,.5,1,6),new THREE.MeshBasicMaterial({color:0xffdb87}));
  private dummy=new THREE.Object3D();private a:Anatomy|null=null;
  constructor(){this.shock.rotation.x=-Math.PI/2;this.dust.frustumCulled=this.chunks.frustumCulled=false;
    this.group.add(this.dust,this.chunks,this.shock,this.flash,this.streak);this.group.visible=false;}
  set(a:Anatomy){this.a=a;}
  update(t:number,on:boolean){
    const a=this.a;this.group.visible=on&&!!a&&t>=0&&t<1.85;if(!this.group.visible||!a)return;
    const d=this.dummy,x=a.x+.5,z=-a.y-.5,ground=a.datum,arrival=.24,age=Math.max(0,t-arrival);
    const dx=Math.cos(a.angle)*a.glance,dy=Math.sin(a.angle)*a.glance;
    this.streak.visible=t<arrival;
    const from=new THREE.Vector3(x-dx*70,ground+85,z+dy*70),to=new THREE.Vector3(x,ground,z);
    this.streak.position.copy(from).lerp(to,t/arrival);this.streak.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),from.clone().sub(to).normalize());this.streak.scale.set(1,19,1);
    this.flash.position.set(x,ground+1,z);this.flash.visible=t>=arrival&&age<.16;this.flash.scale.setScalar(a.radius*.52*(1-age/.16));
    this.shock.visible=t>=arrival;this.shock.position.set(x,ground+.5,z);this.shock.scale.setScalar(a.radius*(.2+age*2.5));
    this.shock.material.opacity=Math.max(0,.65-age*.5);
    for(let k=0;k<64;k++){
      const theta=k*2.399,rad=a.radius*(.12+age*(.7+(k%7)/12));
      d.position.set(x+Math.cos(theta)*rad,ground+1+Math.sin(Math.min(1,age)*Math.PI)*(1+k%5),z+Math.sin(theta)*rad);
      d.scale.setScalar(Math.max(0,(1.7-age))*(.4+a.radius*.055)*(1+(k%3)*.3));d.rotation.set(k,0,k);d.updateMatrix();this.dust.setMatrixAt(k,d.matrix);
    }
    this.dust.visible=t>=arrival;this.dust.instanceMatrix.needsUpdate=true;this.dust.material.opacity=Math.max(0,.32-age*.18);
    for(let k=0;k<32;k++){
      const theta=k*2.4,vel=a.radius*(.4+(k%5)*.15),flight=Math.min(age,1.2);
      d.position.set(x+Math.cos(theta)*vel*flight+dx*vel*flight,ground+3+18*flight-17*flight*flight,z+Math.sin(theta)*vel*flight-dy*vel*flight);
      d.scale.setScalar(age<1.25?.2+(k%4)*.12:0);d.rotation.set(age*4,k,age*3);d.updateMatrix();this.chunks.setMatrixAt(k,d.matrix);
    }this.chunks.visible=t>=arrival;this.chunks.instanceMatrix.needsUpdate=true;
  }
}
