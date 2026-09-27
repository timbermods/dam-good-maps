import { DataTexture, NearestFilter, RGBAFormat, UnsignedByteType, Vector2, type ShaderMaterial } from 'three';
import { surfaceWater, type MapView } from '../../src/render3d/model';
import { replace } from './lighting';

/** R = actually dry, G = actual concentration, B = wet, A = formerly living grass.
 * Nearest filtering is deliberate: cosmetic drying must never cross a moist tile. */
export function climateData(map:MapView,initial:MapView){
 const sw=surfaceWater(map.W,map.H,map.water),bytes=new Uint8Array(map.W*map.H*4);
 let dry=0,wet=0,contaminated=0;
 for(let i=0;i<map.W*map.H;i++){
  const water=sw.depth[i]>.001,dried=!!map.soil&&map.soil.moisture[i]===0&&!water;
  bytes[i*4]=dried?255:0;bytes[i*4+1]=Math.round(sw.contamination[i]*255);bytes[i*4+2]=water?255:0;bytes[i*4+3]=(initial.soil?.moisture[i]??0)>0?255:0;
  if(dried)dry++;if(water)wet++;if(water&&sw.contamination[i]>0)contaminated++;
 }
 return {bytes,dry,wet,contaminated};
}
export class Seasons {
 dry={value:0};sky={value:0};state={value:null as DataTexture|null};size={value:new Vector2(1,1)};
 stats={dry:0,wet:0,contaminated:0,bytes:0,buildMs:0};
 constructor(terrain:ShaderMaterial,water:ShaderMaterial,sky:ShaderMaterial){
  Object.assign(terrain.uniforms,{ffDry:this.dry,ffClimate:this.state,ffClimateSize:this.size});
  terrain.fragmentShader='uniform float ffDry;uniform sampler2D ffClimate;uniform vec2 ffClimateSize;\n'+terrain.fragmentShader;
  terrain.fragmentShader=replace(terrain.fragmentShader,'          if (groundMode > 0.5) {',/* glsl */`
          if(ffDry>.5){
            vec4 climate=texture2D(ffClimate,(floor(g)+.5)/ffClimateSize);
            if(climate.r>.5 && climate.b<.5){
              float wear=vnoise(g*.61+vec2(7.7,19.3));
              float splits=cracks(g*1.41+29.3).x;
              vec3 earth=mix(vec3(.51,.37,.23),vec3(.65,.50,.31),wear);
              earth*=1.0-splits*.25*detail;
              // Formerly moist grass becomes straw only on a genuinely dry tile.
              float blades=smoothstep(.69,.86,vnoise(g*vec2(29.1,8.7)+vec2(4.7,9.2)));
              earth=mix(earth,vec3(.72,.63,.33),climate.a*(.22+blades*.35));
              ground=mix(ground,earth,.66*(1.0-soil.z*.50));
            }
          }
          if (groundMode > 0.5) {`);
  terrain.needsUpdate=true;
  // Badtide follows the actual contaminated water mask. The inherited High
  // concentration blend must not paint a clean tile across a front or barrier.
  Object.assign(water.uniforms,{ffClimate:this.state,ffClimateSize:this.size});
  water.fragmentShader='uniform sampler2D ffClimate;uniform vec2 ffClimateSize;\n'+water.fragmentShader;
  water.fragmentShader=replace(water.fragmentShader,'    bad=texture2D(mlFlow,g/mlFlowSize).b;',`
    bad=texture2D(mlFlow,g/mlFlowSize).b;
    vec4 actual=texture2D(ffClimate,(floor(g)+.5)/ffClimateSize);
    if(actual.g<.001)bad=0.0;`);
  water.needsUpdate=true;
  sky.uniforms.ffSickly=this.sky;sky.fragmentShader='uniform float ffSickly;\n'+sky.fragmentShader;
  sky.fragmentShader=replace(sky.fragmentShader,'      gl_FragColor = vec4(c, 1.0);','      c=mix(c,vec3(.66,.72,.46),ffSickly);\n      gl_FragColor = vec4(c, 1.0);');sky.needsUpdate=true;
 }
 setMap(map:MapView,initial:MapView){
  const start=performance.now(),data=climateData(map,initial);this.state.value?.dispose();
  const texture=new DataTexture(data.bytes,map.W,map.H,RGBAFormat,UnsignedByteType);texture.minFilter=texture.magFilter=NearestFilter;texture.needsUpdate=true;
  this.state.value=texture;this.size.value.set(map.W,map.H);
  this.stats={dry:data.dry,wet:data.wet,contaminated:data.contaminated,bytes:data.bytes.byteLength,buildMs:performance.now()-start};
 }
 dispose(){this.state.value?.dispose();}
}
