import * as THREE from "three";
import { View } from "../../erode/demo/view";
import { Terrain } from "../../erode/core/terrain";
import type { ErodeMap, Thing } from "../../erode/core/map";
import type { Pool } from "../../erode/core/water";
import { cell, type Plan } from "../core/block";

/** Thin adapter: Erode owns the mesher, materials, picking and camera. */
export class BlockView extends View {
  private ghosts = new THREE.Group();
  private boxes = new THREE.BoxGeometry(1.012,1.012,1.012);
  private edges = new THREE.EdgesGeometry(this.boxes);
  private mats = [0x8ed9d1,0xffc375,0xff4548].map(color => new THREE.MeshBasicMaterial({ color, transparent:true, opacity:.25, depthWrite:false, depthTest:false }));
  private lines = [0x9ffff0,0xffcc80,0xff4548].map(color => new THREE.LineBasicMaterial({color, transparent:true, opacity:.95,depthTest:false}));
  private slicePlane = new THREE.Plane(new THREE.Vector3(0,-1,0),22);
  layer = 22;
  constructor(canvas: HTMLCanvasElement) { super(canvas); this.scene.add(this.ghosts); this.renderer.localClippingEnabled=true; }
  open(t: Terrain, map: ErodeMap) { this.setLand(t.clone(),map.rock,map.moist); }
  sync(t: Terrain, things: Thing[], pools: Pool[], relight = false) {
    const visible = this.terrain!, mask = (1 << this.layer)-1;
    const box = {x0:t.W,y0:t.H,x1:-1,y1:-1};
    for (let i=0;i<t.N;i++) {
      const c = t.cols[i]&mask;
      if (visible.cols[i]===c) continue;
      visible.cols[i]=c; const x=i%t.W,y=Math.floor(i/t.W);
      box.x0=Math.min(box.x0,x);box.y0=Math.min(box.y0,y);box.x1=Math.max(box.x1,x);box.y1=Math.max(box.y1,y);
    }
    if (box.x1>=0) {
      this.update(box,relight);
      // Erode's update assumes stable surface heights. Refresh its public shader texture here.
      this.scene.traverse(o => {
        const m = (o as THREE.Mesh).material as THREE.ShaderMaterial;
        const texture = m?.uniforms?.tileTex?.value as THREE.DataTexture | undefined;
        if (texture) { const data=texture.image.data as Uint8Array; for(let i=0;i<t.N;i++) data[i*4]=visible.surface(i)*10; texture.needsUpdate=true; }
      });
    }
    this.setWater(pools.filter(p=>p.level<=this.layer));
    const shown=things.filter(th=>th.z<this.layer);
    const key=JSON.stringify(shown);
    if (key!==this.thingsKey) { this.setThings(shown); this.thingsKey=key; }
    this.slicePlane.constant=this.layer;
    this.scene.traverse(o=>{
      const material=(o as THREE.Mesh).material;
      if(material instanceof THREE.MeshLambertMaterial&&!material.clippingPlanes){material.clippingPlanes=[this.slicePlane];material.needsUpdate=true;}
    });
  }
  private thingsKey="";
  ghost(p: Plan | null) {
    for(const o of [...this.ghosts.children]) { this.ghosts.remove(o); if(o instanceof THREE.InstancedMesh)o.dispose(); }
    if(!p) return;
    const red=new Set(p.unsupported), matrix=new THREE.Matrix4();
    const groups: number[][]=[[],[],[]];
    for(const v of p.voxels) groups[p.reason ? 2 : p.stamp.mode==="add"?0:1].push(v);
    for(const v of red) if(!p.voxels.includes(v)) groups[2].push(v);
    groups.forEach((voxels,k)=>{
      if(!voxels.length)return;
      const mesh=new THREE.InstancedMesh(this.boxes,this.mats[k],voxels.length);mesh.renderOrder=10;
      voxels.forEach((v,i)=>{
        const [x,y,z]=cell(v,p.result);matrix.makeTranslation(x+.5,z+.5,-y-.5);mesh.setMatrixAt(i,matrix);
        const edge=new THREE.LineSegments(this.edges,this.lines[k]);edge.position.set(x+.5,z+.5,-y-.5);edge.renderOrder=11;this.ghosts.add(edge);
      });
      mesh.instanceMatrix.needsUpdate=true;this.ghosts.add(mesh);
    });
  }
}
