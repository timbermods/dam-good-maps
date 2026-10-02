// Actual renderer methods, with CPU camera/ray state and a fixed canvas; no GPU pixels.
import {MapRenderer} from '../../src/render3d/renderer';
import {PerspectiveCamera,OrthographicCamera,Raycaster,Vector2} from 'three';
Math.random=()=>.25;
const exact=(x:any):any=>{if(typeof x==='number'){if(!Number.isFinite(x))throw Error('Nonfinite renderer fixture');const b=new DataView(new ArrayBuffer(8));b.setFloat64(0,x,true);return b.getBigUint64(0,true).toString(16).padStart(16,'0');}if(Array.isArray(x))return x.map(exact);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,exact(v)]));return x;};
(window as any).cameraProbe=(c:any)=>{
 const r:any=Object.create(MapRenderer.prototype),size=c.size;
 r.canvas={clientWidth:901,clientHeight:607,getBoundingClientRect:()=>({left:13.25,top:17.75,right:914.25,bottom:624.75,width:901,height:607})};
 r.persp=new PerspectiveCamera(40,1,.5,4000);r.ortho=new OrthographicCamera(-1,1,1,-1,.1,4000);r.raycaster=new Raycaster();
 r.view={mode:c.mode,yaw:c.yaw,pitch:c.pitch,distance:size*1.6,target:[size/2,5.375,-size/2]};
 r.uniforms={viewHeight:{value:0},hazeAmount:{value:0},hazeRange:{value:new Vector2()},slice:{value:99}};
 r.map={W:size,H:size,heights:Uint8Array.from({length:size*size},(_,i)=>4+((i%size+Math.floor(i/size))%4))};
 r.map.surface={depth:new Float64Array(size*size).fill(1.25),surface:Float64Array.from(r.map.heights,(h:number)=>h+1.25)};
 r.placeCamera();r.camera().updateMatrixWorld(true);
 const x=13.25+c.x*901,y=17.75+c.y*607;
 const value={ray:r.rayAt(x,y),hit:r.pick(x,y),surface:typeof r.pickSurface==='function'?r.pickSurface(x,y):null,plane:r.pickAtLevel(x,y,5.375),project:r.project(size*.375,5.375,-size*.625),footprint:r.groundFootprint(),matrix:r.camera().matrixWorld.elements,projection:r.camera().projectionMatrix.elements};
 return JSON.stringify(exact(value));
};
