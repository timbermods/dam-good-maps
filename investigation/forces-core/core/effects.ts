import * as THREE from 'three';
import {Surge} from '../verbs/carve/effects';
import {ImpactEffects} from '../verbs/craterize/effects';
import {EruptEffects} from '../verbs/erupt/effects';
import {Rupture} from '../verbs/quake/effects';
import type {View} from '../demo/view';
export class ForceEffects {
 readonly surge=new Surge();readonly impact=new ImpactEffects();readonly erupt=new EruptEffects();readonly quake=new Rupture();
 private configured=false;private event:any=null;private began=0;private ended:number|null=null;private head=new THREE.Vector3();
 constructor(readonly view:View){for(const e of [this.surge,this.impact,this.erupt,this.quake])view.scene.add(e.group);}
 begin(){this.began=performance.now();this.ended=null;this.configured=false;this.clear();}
 set(e:any){
  if(!e)return;this.event=e;
  const v=this.view;
  if(e.verb==='carve'){this.surge.set(e.head,e.trail,v.heights,v.W);this.head.set(e.head.x,e.head.z,-e.head.y);}
  if(e.verb==='craterize'){this.impact.set(e.anatomy);this.head.set(e.anatomy.x,e.anatomy.datum,-e.anatomy.y);}
  if(e.verb==='erupt'){if(!this.configured){v.setHeat(this.erupt.set(e.anatomy,v.heights,v.W,e.settings));this.configured=true;}this.head.set(e.anatomy.x,e.anatomy.datum,-e.anatomy.y);}
  if(e.verb==='quake'&&e.path.length){
   const p=e.path[Math.min(e.path.length-1,Math.floor(e.progress*(e.path.length-1)))],z=v.surfaceAt(p.x,p.y);
   this.quake.set({...p,z,progress:e.progress},e.path,v.heights,v.W);this.head.set(p.x,z,-p.y);
  }
 }
 finish(){this.ended=performance.now();}
 clear(){this.event=null;this.configured=false;for(const e of [this.surge,this.impact,this.erupt,this.quake])e.group.visible=false;this.view.heat(-1,0);}
 update(dt:number,motion:boolean,follow:boolean,active:boolean){
  const now=performance.now(),t=(now-this.began)/1000,cooling=this.ended===null?0:(now-this.ended)/1000,e=this.event;
  this.surge.update(t,motion&&active&&e?.verb==='carve');this.impact.update(t,motion&&e?.verb==='craterize');
  this.erupt.update(t,motion&&e?.verb==='erupt',cooling,(x,y)=>this.view.surfaceAt(x,y));
  this.quake.update(t,motion&&active&&e?.verb==='quake');
  this.view.heat(motion&&e?.verb==='erupt'?t:-1,cooling);
  if(motion&&follow&&active&&e){
   const delta=this.head.clone().sub(this.view.controls.target).multiplyScalar(1-Math.exp(-dt*1.4));
   this.view.controls.target.add(delta);this.view.camera.position.add(delta);
  }
 }
}
