import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { pickHeightfield } from '../../src/render3d/pick';
import { sceneUniforms,terrainMaterial,waterMaterial,objectMaterial,tileTexture,lightTexture,overlayTexture,drawPatterns } from '../../src/render3d/materials';
import type { Chunk,Geometry } from './meshes';
export interface Lighting {tiles:Uint8Array;light:Uint8Array}
export interface ViewState {groups:Map<string,THREE.Group>;heights:Uint8Array;keep:Uint8Array;lighting:Lighting|null}
export class View {
  readonly scene=new THREE.Scene();
  readonly camera=new THREE.PerspectiveCamera(42,1,.1,3000);
  readonly gl:THREE.WebGLRenderer;readonly controls:OrbitControls;
  readonly uniforms=sceneUniforms(1,1,tileTexture(1,1,new Uint8Array(4)),lightTexture(1,1,new Uint8Array(16)),overlayTexture(1,1),overlayTexture(1,1));
  readonly ground=terrainMaterial(this.uniforms,0,22);
  readonly water=waterMaterial(this.uniforms);
  readonly objects=objectMaterial(this.uniforms);
  groups=new Map<string,THREE.Group>();stage:Map<string,THREE.Group>|null=null;
  heights:Uint8Array=new Uint8Array();keep:Uint8Array=new Uint8Array();lighting:Lighting|null=null;
  W=0;H=0;top=false;progress=1;activeMorph=0;private morphCounter=0;private batchMorph=0;
  private allGroups=new Set<THREE.Group>();
  private morphLighting:{tiles:THREE.DataTexture;light:THREE.DataTexture}|null=null;
  constructor(readonly canvas:HTMLCanvasElement){
    this.scene.background=new THREE.Color('#b8cbd8');
    this.gl=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
    this.gl.setPixelRatio(Math.min(devicePixelRatio,1.5));this.gl.outputColorSpace=THREE.LinearSRGBColorSpace;
    this.controls=new OrbitControls(this.camera,canvas);this.controls.enableDamping=true;this.controls.dampingFactor=.12;this.controls.maxPolarAngle=Math.PI*.49;
    this.controls.mouseButtons={LEFT:null as unknown as THREE.MOUSE,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x687366,2));
    const sun=new THREE.DirectionalLight(0xfff4d6,2);sun.position.set(-80,160,100);this.scene.add(sun);
    this.uniforms.patternTex.value=drawPatterns(this.gl).texture;this.uniforms.markers.value=0;
    this.ground.uniforms.craterProgress={value:1};this.ground.uniforms.rockLayers={value:new Float32Array(23)};
    this.ground.uniforms.beforeTileTex={value:this.uniforms.tileTex.value};
    this.ground.uniforms.beforeLightTex={value:this.uniforms.lightTex.value};
    this.ground.vertexShader='attribute vec3 grow; uniform float craterProgress;\n'+this.ground.vertexShader;
    this.ground.vertexShader=this.ground.vertexShader.replace('vec4(position, 1.0)','vec4(position + grow * (1.0 - smoothstep(0.0, 1.0, craterProgress)), 1.0)');
    this.ground.fragmentShader='uniform float rockLayers[23]; uniform float craterProgress; uniform sampler2D beforeTileTex; uniform sampler2D beforeLightTex;\n'+this.ground.fragmentShader;
    this.ground.fragmentShader=this.ground.fragmentShader.replace('return texture2D(tileTex, (t + 0.5) / mapSize);',
      'vec4 next = texture2D(tileTex, (t + 0.5) / mapSize); vec4 prior = texture2D(beforeTileTex, (t + 0.5) / mapSize); float blend = smoothstep(0.0, 1.0, craterProgress); next.r = mix(prior.r, next.r, blend); next.b = mix(prior.b, next.b, blend); return next;');
    this.ground.fragmentShader=this.ground.fragmentShader.replace('vec4 s = texture2D(lightTex, g / mapSize);',
      'vec4 s = mix(texture2D(beforeLightTex, g / mapSize), texture2D(lightTex, g / mapSize), smoothstep(0.0, 1.0, craterProgress));');
    // Interpolated tops below their final tile texture are rising ground, not cave floors.
    this.ground.fragmentShader=this.ground.fragmentShader.replace('if (vWorld.y < h0 - 0.5)', 'if (craterProgress >= 1.0 && vWorld.y < h0 - 0.5)');
    this.ground.fragmentShader=this.ground.fragmentShader.replace('gl_FragColor = vec4(finish(c, vWorld), 1.0);',
      'if (abs(vNormal.y) < 0.5) { float bed = rockLayers[int(clamp(floor(vWorld.y), 0.0, 22.0))]; c *= mix(vec3(1.08, 1.0, 0.88), vec3(0.67, 0.72, 0.77), bed); } gl_FragColor = vec4(finish(c, vWorld), 1.0);');
    new ResizeObserver(()=>{this.gl.setSize(canvas.clientWidth,canvas.clientHeight,false);this.camera.aspect=canvas.clientWidth/canvas.clientHeight;this.camera.updateProjectionMatrix();this.uniforms.viewHeight.value=canvas.clientHeight;}).observe(canvas);
  }
  reset(W:number,H:number,layers:number[]){
    this.W=W;this.H=H;for(const g of this.groups.values())this.scene.remove(g);this.groups=new Map();this.stage=null;
    this.ground.uniforms.rockLayers.value=Float32Array.from(layers);this.resetView();
  }
  resetView(){this.controls.target.set(this.W*.5,5,-this.H*.5);this.camera.position.set(this.W*1.04,this.W*.93,this.H*.32);this.controls.update();this.top=false;}
  topView(){if(this.top){this.resetView();return;}this.camera.position.set(this.controls.target.x,Math.max(this.W,this.H)*1.53,this.controls.target.z+.001);this.controls.update();this.top=true;}
  begin(transition:boolean){
    this.stage=new Map(this.groups);this.batchMorph=transition?++this.morphCounter:0;
    if(transition){
      this.activeMorph=this.batchMorph;this.progress=0;
      this.morphLighting?.tiles.dispose();this.morphLighting?.light.dispose();
      this.morphLighting=this.lighting?{tiles:tileTexture(this.W,this.H,this.lighting.tiles),light:lightTexture(this.W,this.H,this.lighting.light)}:null;
    }
  }
  private geometry(d:Geometry){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(d.positions,3));g.setAttribute('normal',new THREE.BufferAttribute(d.normals,3,d.normals instanceof Int8Array));
    g.setAttribute('pcolor',new THREE.BufferAttribute(d.colors,3));g.setAttribute('grow',new THREE.BufferAttribute(d.grow??new Float32Array(d.positions.length),3));
    if(d.data)g.setAttribute('wdata',new THREE.BufferAttribute(d.data,2));if(d.flags)g.setAttribute('wflags',new THREE.BufferAttribute(d.flags,1));
    if(d.indices)g.setIndex(new THREE.BufferAttribute(d.indices,1));g.computeBoundingSphere();return g;
  }
  upload(c:Chunk){
    const group=new THREE.Group(),prior=this.stage?.get(c.key);
    for(const name of ['terrain','water']){
      const mesh=new THREE.Mesh(this.geometry(name==='terrain'?c.terrain:c.water),name==='terrain'?this.ground:this.water);mesh.name=name;mesh.renderOrder=name==='water'?2:0;
      if(name==='terrain'){const morph=this.batchMorph;mesh.onBeforeRender=()=>{
        const active=morph&&morph===this.activeMorph;
        this.ground.uniforms.craterProgress.value=active?this.progress:1;
        this.ground.uniforms.beforeTileTex.value=active&&this.morphLighting?this.morphLighting.tiles:this.uniforms.tileTex.value;
        this.ground.uniforms.beforeLightTex.value=active&&this.morphLighting?this.morphLighting.light:this.uniforms.lightTex.value;
      };}
      group.add(mesh);
    }
    const objects=new THREE.Group();objects.name='objects';
    if(c.objects)for(const o of c.objects){
      const mesh=new THREE.InstancedMesh(this.geometry(o.geometry),this.objects,o.count);
      mesh.instanceMatrix.array.set(o.matrices);mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor=new THREE.InstancedBufferAttribute(o.colors,3);mesh.computeBoundingSphere();objects.add(mesh);
    }else{
      const old=prior?.getObjectByName('objects');if(old)for(const obj of old.children)objects.add(obj.clone());
    }
    group.add(objects);
    if(this.batchMorph){
      const previous=prior?.getObjectByName('objects');
      if(previous){const old=previous.clone(true);old.name='previous-objects';group.add(old);}
      group.userData.morph=this.batchMorph;
    }
    this.stage?.set(c.key,group);this.allGroups.add(group);
  }
  commit(heights:Uint8Array,keep:Uint8Array,lighting:Lighting|null){
    for(const g of this.groups.values())this.scene.remove(g);this.groups=this.stage??this.groups;this.stage=null;
    for(const g of this.groups.values())this.scene.add(g);this.heights=heights;this.keep=keep;
    if(lighting)this.setLighting(lighting);
  }
  setLighting(l:Lighting){this.lighting=l;this.uniforms.tileTex.value.dispose();this.uniforms.lightTex.value.dispose();
    this.uniforms.tileTex.value=tileTexture(this.W,this.H,l.tiles);this.uniforms.lightTex.value=lightTexture(this.W,this.H,l.light);this.uniforms.mapSize.value.set(this.W,this.H);}
  capture():ViewState{return {groups:new Map(this.groups),heights:this.heights.slice(),keep:this.keep.slice(),lighting:this.lighting};}
  restore(c:ViewState){this.stage=null;this.activeMorph=0;this.progress=1;
    for(const g of this.groups.values())this.scene.remove(g);this.groups=new Map(c.groups);for(const g of this.groups.values())this.scene.add(g);
    this.heights=c.heights.slice();this.keep=c.keep.slice();if(c.lighting)this.setLighting(c.lighting);}
  collect(caches:ViewState[]){
    const keepGroups=new Set([...this.groups.values(),...(this.stage?.values()??[]),...caches.flatMap(c=>[...c.groups.values()])]);
    const keepGeo=new Set<THREE.BufferGeometry>(),keepInstances=new Set<THREE.InstancedMesh>();
    for(const g of keepGroups)g.traverse(o=>{if(o instanceof THREE.Mesh)keepGeo.add(o.geometry);if(o instanceof THREE.InstancedMesh)keepInstances.add(o);});
    const disposed=new Set<THREE.BufferGeometry>();
    for(const g of this.allGroups)if(!keepGroups.has(g)){
      g.traverse(o=>{if(o instanceof THREE.Mesh&&!keepGeo.has(o.geometry)&&!disposed.has(o.geometry)){o.geometry.dispose();disposed.add(o.geometry);}if(o instanceof THREE.InstancedMesh&&!keepInstances.has(o))o.dispose();});
      this.allGroups.delete(g);
    }
  }
  hit(clientX:number,clientY:number){
    const r=this.canvas.getBoundingClientRect(),ray=new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1),this.camera);
    return pickHeightfield({origin:ray.ray.origin.toArray(),direction:ray.ray.direction.toArray()},this.W,this.H,this.heights);
  }
  render(time:number,motion:boolean){
    for(const group of this.groups.values()){
      const previous=group.getObjectByName('previous-objects');
      if(previous){const incoming=group.userData.morph===this.activeMorph&&this.progress<=.001;
        previous.visible=incoming;group.getObjectByName('objects')!.visible=!incoming;}
    }
    this.uniforms.time.value=motion?time:0;this.controls.update();this.gl.render(this.scene,this.camera);
  }
}
