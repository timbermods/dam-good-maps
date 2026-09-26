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
  previousHeights:Uint8Array=new Uint8Array();
  private allGroups=new Set<THREE.Group>();
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
    this.ground.vertexShader='attribute vec3 grow; uniform float craterProgress;\n'+this.ground.vertexShader;
    this.ground.vertexShader=this.ground.vertexShader.replace('vec4(position, 1.0)','vec4(position + grow * (1.0 - smoothstep(0.0, 1.0, craterProgress)), 1.0)');
    // Lighting textures describe this batch's target surface. Shade in that reference
    // space while projecting the interpolated surface; otherwise tops become cave floors.
    this.ground.vertexShader=this.ground.vertexShader.replace('vWorld = w.xyz;','vWorld = (modelMatrix * vec4(position, 1.0)).xyz;');
    this.ground.uniforms.eruptionMask={value:new THREE.DataTexture(new Uint8Array(4),1,1)};
    this.ground.uniforms.eruptionAge={value:-1};this.ground.uniforms.coolingAge={value:0};
    this.ground.fragmentShader='uniform float rockLayers[23]; uniform sampler2D eruptionMask; uniform float eruptionAge; uniform float coolingAge;\n'+this.ground.fragmentShader;
    this.ground.fragmentShader=this.ground.fragmentShader.replace('gl_FragColor = vec4(finish(c, vWorld), 1.0);',
      `if (abs(vNormal.y) < 0.5) { float bed = rockLayers[int(clamp(floor(vWorld.y), 0.0, 22.0))]; c *= mix(vec3(1.08, 1.0, 0.88), vec3(0.67, 0.72, 0.77), bed); }
      if (eruptionAge >= 0.0) {
        vec4 e = texture2D(eruptionMask, vec2(vWorld.x, -vWorld.z) / mapSize);
        float arrival = smoothstep(e.a * 1.1, e.a * 1.1 + 0.55, eruptionAge);
        float cooling = smoothstep(0.0, 3.6, coolingAge);
        float crust = smoothstep(2.0, 5.8, coolingAge);
        float fade = 1.0 - smoothstep(3.3, 6.4, coolingAge);
        float cracks = pow(1.0 - abs(sin(vWorld.x * 2.8 + sin(vWorld.z * 1.2) * 2.6 + vWorld.z * 1.6)), 12.0);
        float hot = max(e.r * (0.56 + 0.44 * cracks), e.g * cracks);
        vec3 lava = mix(vec3(1.65, 0.47, 0.035), vec3(0.38, 0.028, 0.013), cooling);
        lava = mix(lava, c * vec3(0.49, 0.46, 0.43), crust);
        c = mix(c, lava, hot * arrival * fade * 0.9);
        float dust = e.b * smoothstep(0.5, 2.4, eruptionAge) * (1.0 - smoothstep(0.5, 6.0, coolingAge));
        c = mix(c, vec3(0.52, 0.49, 0.45), dust * 0.24 * max(0.0, vNormal.y));
      }
      gl_FragColor = vec4(finish(c, vWorld), 1.0);`);
    new ResizeObserver(()=>{this.gl.setSize(canvas.clientWidth,canvas.clientHeight,false);this.camera.aspect=canvas.clientWidth/canvas.clientHeight;this.camera.updateProjectionMatrix();this.uniforms.viewHeight.value=canvas.clientHeight;}).observe(canvas);
  }
  reset(W:number,H:number,layers:number[]){
    this.W=W;this.H=H;for(const g of this.groups.values())this.scene.remove(g);this.groups=new Map();this.stage=null;
    this.ground.uniforms.rockLayers.value=Float32Array.from(layers);this.resetView();
  }
  resetView(){this.controls.target.set(this.W*.5,5,-this.H*.5);this.camera.position.set(this.W*1.04,this.W*.93,this.H*.32);this.controls.update();this.top=false;}
  topView(){if(this.top){this.resetView();return;}this.camera.position.set(this.controls.target.x,Math.max(this.W,this.H)*1.53,this.controls.target.z+.001);this.controls.update();this.top=true;}
  begin(transition:boolean){this.stage=new Map(this.groups);this.batchMorph=transition?++this.morphCounter:0;}
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
      if(name==='terrain'){const morph=this.batchMorph;mesh.onBeforeRender=()=>{this.ground.uniforms.craterProgress.value=morph&&morph===this.activeMorph?this.progress:1;};}
      group.add(mesh);
    }
    const objects=new THREE.Group();objects.name='objects';
    if(c.objects)for(const o of c.objects){
      const mesh=new THREE.InstancedMesh(this.geometry(o.geometry),this.objects,o.count);
      mesh.instanceMatrix.array.set(o.matrices);mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor=new THREE.InstancedBufferAttribute(o.colors,3);mesh.computeBoundingSphere();objects.add(mesh);
    }else{
      const old=prior?.getObjectByName('objects');if(old)for(const obj of old.children)objects.add(obj.clone());
    }
    group.add(objects);this.stage?.set(c.key,group);this.allGroups.add(group);
  }
  commit(heights:Uint8Array,keep:Uint8Array,lighting:Lighting|null){
    this.previousHeights=this.heights;this.activeMorph=this.batchMorph;this.progress=this.batchMorph?0:1;
    for(const g of this.groups.values())this.scene.remove(g);this.groups=this.stage??this.groups;this.stage=null;
    for(const g of this.groups.values())this.scene.add(g);this.heights=heights;this.keep=keep;
    if(lighting)this.setLighting(lighting);
  }
  surfaceAt(x:number,y:number){const i=Math.max(0,Math.min(this.H-1,Math.floor(y)))*this.W+Math.max(0,Math.min(this.W-1,Math.floor(x))),t=this.progress*this.progress*(3-2*this.progress);return this.activeMorph?(this.previousHeights[i]??this.heights[i])*(1-t)+this.heights[i]*t:this.heights[i];}
  setHeat(mask:Uint8Array){const texture=new THREE.DataTexture(mask,this.W,this.H);texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;this.ground.uniforms.eruptionMask.value.dispose();this.ground.uniforms.eruptionMask.value=texture;}
  heat(age:number,cooling:number){this.ground.uniforms.eruptionAge.value=age;this.ground.uniforms.coolingAge.value=cooling;}
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
  render(time:number,motion:boolean){this.uniforms.time.value=motion?time:0;this.controls.update();this.gl.render(this.scene,this.camera);}
}
