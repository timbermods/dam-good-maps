import * as T from 'three';
import {terrainMaterial,waterMaterial,sceneUniforms,overlayTexture,drawPatterns,type ShaderHooks} from '../../src/render3d/materials';
import {terrainHooks,waterHooks,SWITCHES} from '../../src/render3d/high/shaders';
import {LIGHT_LEVELS} from './geometry';
const replace=(s:string,from:string,to:string)=>{if(!s.includes(from))throw Error('High source changed: '+from.slice(0,70));return s.replace(from,to);};
export function volume(data:Uint8Array,W:number,H:number,rg=false){const t=new T.Data3DTexture(data,W,H,LIGHT_LEVELS);t.format=rg?T.RGFormat:T.RGBAFormat;t.type=T.UnsignedByteType;t.minFilter=t.magFilter=rg?T.LinearFilter:T.NearestFilter;t.unpackAlignment=1;t.needsUpdate=true;return t;}
const decl=`
 uniform highp sampler3D caveLight;
 uniform highp sampler3D runSoil;
 uniform vec3 volumeSize;
 uniform float volumeEnabled;
 vec2 spaceLight(vec3 p,vec3 n){return texture(caveLight,clamp(vec3(p.x,-p.z,p.y)+vec3(n.x,-n.z,n.y)*0.52,vec3(0.5),volumeSize-0.5)/volumeSize).rg;}
`;
export function makeMaterials(gl:T.WebGLRenderer,W:number,H:number,high:boolean,light:T.Data3DTexture,soil:T.Data3DTexture){
 const blank=overlayTexture(W,H),u=sceneUniforms(W,H,blank,blank,blank,blank),patterns=drawPatterns(gl);u.patternTex.value=patterns.texture;u.hazeAmount.value=0;
 if(high){u.sunColor.value.multiply(new T.Color(1.48,1.3,1.1));u.skyColor.value.multiplyScalar(.97);}
 const extras:Record<string,{value:unknown}>={caveLight:{value:light},runSoil:{value:soil},volumeSize:{value:new T.Vector3(W,H,LIGHT_LEVELS)},volumeEnabled:{value:1},hlFlow:{value:blank},hlFlowSize:{value:new T.Vector2(W,H)},hlRough:{value:blank}};
 for(const k of SWITCHES)extras[k]={value:1};extras.hlRiver={value:0};
 const hooks=(h:ShaderHooks):ShaderHooks=>({...h,decl:(h.decl??'')+decl,sunLit:'float sunLit(vec2 g,float z){return spaceLight(vWorld,normalize(vNormal)).g;}',skyLight:''});
 const terrain=terrainMaterial(u,0,22,false,hooks(high?terrainHooks():{}));
 const water=waterMaterial(u,false,hooks(high?waterHooks():{}));
 for(const m of [terrain,water]){
  Object.assign(m.uniforms,extras);
  m.fragmentShader=replace(m.fragmentShader,'return skyColor * 1.0 * (0.7 + 0.3 * n.y) * ao * sky + sunColor * 0.55 * ndl * lit * mix(1.0, ao, 0.35);',`vec2 field=spaceLight(vWorld,normalize(vNormal));
    float ambient=mix(1.0,max(0.30,field.r),volumeEnabled);
    return skyColor * (0.78 + 0.22*n.y) * ambient + sunColor * 0.55*ndl*mix(1.0,field.g,volumeEnabled);`);
 }
 terrain.vertexShader=replace(terrain.vertexShader,'w.y = min(w.y, slice);','// True capped geometry; no folded heightfield vertices.');
 terrain.fragmentShader=replace(terrain.fragmentShader,'return texture2D(tileTex, (t + 0.5) / mapSize);',`vec3 q=vec3(t+0.5,floor(vWorld.y-vNormal.y*0.01)+0.5);
        vec4 d=texture(runSoil,clamp(q,vec3(0.5),volumeSize-0.5)/volumeSize);return vec4(d.rgb,0.0);`);
 // Use the existing cliff flagstones on the ceiling, projected onto x/z, with its real downward normal.
 terrain.fragmentShader=replace(terrain.fragmentShader,`} else if (n.y < -0.5) {\n          c =`, `} else if (false) {\n          c =`);
 terrain.fragmentShader=replace(terrain.fragmentShader,'float y = vWorld.y;','float y = n.y < -0.5 ? g.y : vWorld.y;');
 terrain.fragmentShader=replace(terrain.fragmentShader,'float lip = 1.0 - smoothstep(0.07, 0.13, h0 - y);','float lip = n.y < -0.5 ? 0.0 : 1.0 - smoothstep(0.07, 0.13, h0 - y);');
 terrain.fragmentShader=replace(terrain.fragmentShader,'if (slice < 90.0 && h0 > slice + 0.5) {',`if (slice < 23.0 && abs(vWorld.y-slice)<0.001 && texture(runSoil,vec3(clamp(floor(g)+0.5,vec2(0.5),mapSize-0.5),slice+0.5)/volumeSize).a>0.5) {`);
 terrain.fragmentShader=replace(terrain.fragmentShader,'c = mix(c, vec3(0.5, 0.47, 0.43), 0.6) * (0.86 + 0.14 * hs);',`float stone=cobble(g*1.5);c=mix(vec3(0.23,0.225,0.18),vec3(0.43,0.41,0.31),smoothstep(0.08,0.65,stone))*(0.85+0.15*hs);`);
 // All reflected sky/foam/glints dim with the same volume, after every water effect.
 water.fragmentShader=replace(water.fragmentShader,'gl_FragColor = vec4(finish(c, vWorld), alpha);',`c*=mix(1.0,max(0.30,spaceLight(vWorld,vec3(0,1,0)).r),volumeEnabled);gl_FragColor=vec4(finish(c,vWorld),alpha);`);
 return {terrain,water,u,dispose(){terrain.dispose();water.dispose();blank.dispose();patterns.dispose();}};
}
