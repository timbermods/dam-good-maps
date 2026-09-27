import { BoxGeometry, BufferGeometry, CylinderGeometry, ConeGeometry, IcosahedronGeometry, TorusGeometry, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Group, Matrix4, Quaternion, Vector3, ShaderMaterial, type BufferAttribute } from 'three';
import type { MapView } from '../../src/render3d/model';
import { START, RUIN, MINE, RELIC_STONE, GEOTHERMAL_ROCK, GEOTHERMAL, THORNS, type Rgb } from '../../src/render3d/palette';
import { replace } from './lighting';

const shade=(c:Rgb,k:number):Rgb=>[c[0]*k,c[1]*k,c[2]*k];
const hash=(i:number)=>{const x=Math.sin(i*73.17+9.31)*4173.91;return x-Math.floor(x);};
class Parts {
 pos:number[]=[];norm:number[]=[];col:number[]=[];lod:number[]=[];
 add(g:BufferGeometry,c:Rgb,x=0,y=0,z=0,rx=0,ry=0,rz=0,lod=0){
   const source=g.index?g.toNonIndexed():g;source.rotateX(rx).rotateY(ry).rotateZ(rz).translate(x,y,z);
   const p=source.getAttribute('position'),n=source.getAttribute('normal');
   for(let i=0;i<p.count;i++){this.pos.push(p.getX(i),p.getY(i),p.getZ(i));this.norm.push(n.getX(i),n.getY(i),n.getZ(i));this.col.push(...c);this.lod.push(lod);}
   source.dispose();if(source!==g)g.dispose();return this;
 }
 copy(g:BufferGeometry){
   const src=g.index?g.toNonIndexed():g,p=src.getAttribute('position'),n=src.getAttribute('normal'),c=src.getAttribute('pcolor'),l=src.getAttribute('lod');
   for(let i=0;i<p.count;i++){this.pos.push(p.getX(i),p.getY(i),p.getZ(i));this.norm.push(n.getX(i),n.getY(i),n.getZ(i));this.col.push(c.getX(i),c.getY(i),c.getZ(i));this.lod.push(l.getX(i));}
   if(src!==g)src.dispose();return this;
 }
 beam(a:number[],b:number[],r:number,c:Rgb,lod=0){
   const A=new Vector3(...a as [number,number,number]),B=new Vector3(...b as [number,number,number]),d=B.clone().sub(A),q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.clone().normalize());
   const g=new CylinderGeometry(r*.85,r,d.length(),6).applyQuaternion(q);const center=A.add(B).multiplyScalar(.5);return this.add(g,c,center.x,center.y,center.z,0,0,0,lod);
 }
 box(w:number,h:number,d:number,c:Rgb,x=0,y=0,z=0,rx=0,ry=0,rz=0,lod=0){return this.add(new BoxGeometry(w,h,d),c,x,y,z,rx,ry,rz,lod);}
 geometry(){const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(this.pos,3));g.setAttribute('normal',new Float32BufferAttribute(this.norm,3));g.setAttribute('pcolor',new Float32BufferAttribute(this.col,3));g.setAttribute('lod',new Float32BufferAttribute(this.lod,1));g.computeBoundingSphere();return g;}
}
function rock(m:Parts,x:number,y:number,z:number,r:number,c:Rgb,seed:number,lod=0){
 const g=new IcosahedronGeometry(r,0);g.scale(.82+hash(seed)*.35,.63+hash(seed+1)*.35,.82+hash(seed+2)*.35);m.add(g,c,x,y,z,0,seed,seed*.31,lod);
}
function district(){
 const m=new Parts(),wood=START.walls,roof=START.roof;
 m.box(3,.10,3,shade(START.deck,.72),0,.05);
 for(let k=0;k<15;k++)m.box(.18,.11,2.94,shade(START.deck,.90+hash(k)*.16),-1.4+k*.2,.15);
 m.box(1.75,.96,1.35,wood,0,.72);
 for(let y=.35;y<1.18;y+=.16)for(const z of [-.7,.7])m.beam([-1,y,z],[1,y,z],.073,shade(wood,.75+hash(y)*.16));
 for(const x of [-.84,.84])for(const z of [-.65,.65])m.box(.11,1.1,.11,shade(wood,.67),x,.74,z);
 // Separate shingle courses follow the A roof; strong red roof remains legible.
 for(const side of [-1,1])for(let row=0;row<5;row++)for(let col=0;col<8;col++){
   const z=side*(.09+row*.168),y=1.98-Math.abs(z)*.9;
   m.box(.27,.07,.25,shade(roof,.82+hash(row*31+col*7+side)*.36),-.96+col*.275,y,z,side*.73,0,0);
 }
 m.beam([-1.12,2.01,0],[1.12,2.01,0],.055,shade(roof,1.18));
 m.box(.43,.63,.055,[.24,.16,.095],0,.55,.705);m.box(.55,.06,.08,shade(wood,.68),0,.89,.74);
 for(const x of [-.60,.60]){m.box(.32,.32,.05,[.20,.32,.31],x,.84,.715);for(const dx of [-.18,.18])m.box(.035,.39,.08,START.deck,x+dx,.84,.74);m.box(.39,.035,.08,START.deck,x,.65,.74);m.box(.39,.035,.08,START.deck,x,1.03,.74);m.box(.028,.33,.08,START.deck,x,.84,.74);}
 m.box(.73,.08,.49,roof,0,1.02,.94,.20);
 for(const x of [-.9,.9]){m.beam([x,.2,1.15],[x,.73,1.15],.06,shade(wood,.66));m.beam([x,.72,1.15],[x,.72,1.48],.035,START.deck);}
 m.box(.31,.66,.32,[.49,.48,.42],.57,1.86,-.26);m.box(.39,.10,.40,[.30,.31,.28],.57,2.20,-.26);
 m.beam([-1.17,.2,-1.1],[-1.17,2.96,-1.1],.045,[.29,.20,.12]);
 m.box(.85,.50,.05,START.banner,-.72,2.69,-1.1);m.box(.85,.09,.057,[.36,.15,.075],-.72,2.48,-1.1);
 // Simple original crossed tools emblem; a readable start cue.
 m.beam([-.86,2.57,-1.064],[-.61,2.82,-1.064],.025,[.37,.21,.095],1);m.beam([-.61,2.57,-1.06],[-.86,2.82,-1.06],.025,[.37,.21,.095],1);
 return m.geometry();
}
function relic(type:string){
 const m=new Parts(),large=type==='LargeRelic',medium=type==='MediumRelic',w=type==='SmallRelic'?1.86:2.86,d=large?2.86:medium?1.86:.86;
 m.box(w,.16,d,shade(RELIC_STONE,.77),0,.08);m.box(w-.10,.06,d-.10,shade(RELIC_STONE,1.06),0,.19);
 const columns=large?[[-.8,-.8,1.85],[.8,-.8,1.45],[-.8,.8,1.18],[.8,.8,.62],[0,-.8,.42]]:medium?[[-.8,-.4,1.16],[0,-.4,.5],[.8,-.4,.9],[-.8,.4,.34],[.8,.4,1.37]]:[[-.4,0,.87],[.4,0,.43]];
 for(const [x,z,h]of columns){
   m.box(.48,.10,.48,shade(RELIC_STONE,.9),x,.27,z);
   m.add(new CylinderGeometry(.155,.205,h,8),RELIC_STONE,x,.32+h/2,z);
   m.add(new CylinderGeometry(.14,.17,.13,7),shade(RELIC_STONE,1.12),x+.02,.33+h,z,0,.1,.22);
   for(let k=0;k<8;k++){const a=k*Math.PI/4; m.beam([x+Math.sin(a)*.181,.35,z+Math.cos(a)*.181],[x+Math.sin(a)*.156,.26+h,z+Math.cos(a)*.156],.009,shade(RELIC_STONE,.79),1);}
   m.add(new TorusGeometry(.197,.019,3,8),shade(RELIC_STONE,1.05),x,.42,z,Math.PI/2,0,0,1);
 }
 if(medium||large)m.add(new CylinderGeometry(.18,.2,.67,8),shade(RELIC_STONE,.91),.15,.43,.42,0,.7,Math.PI/2);
 for(let k=0;k<7;k++)rock(m,(hash(k)-.5)*w,.26,(hash(k+71)-.5)*d,.05+hash(k+4)*.10,shade(RELIC_STONE,.9),k,1);
 return m.geometry();
}
function bramble(){
 const m=new Parts();
 for(let k=0;k<10;k++){const a=k*2.4,r=.22+hash(k)*.13,x=Math.sin(a)*r,z=Math.cos(a)*r;
   const end=[x*1.27,.26+hash(k+1)*.28,z*1.27];m.beam([x*.3,.04,z*.3],end,.028,shade(THORNS,.72+hash(k+7)*.52));
   m.beam(end,[end[0]*.4,end[1]*1.25,end[2]*.4],.017,shade(THORNS,1.22));
   for(let j=0;j<3;j++){const y=.15+j*.08;m.beam([x*.8,y,z*.8],[x*1.15,y+.11,z*1.15],.013,[.61,.39,.25],1);}
 }
 rock(m,0,.12,0,.22,shade(THORNS,.67),11);return m.geometry();
}
function source(bad:boolean){
 const m=new Parts(),r=bad?1.26:.43,c:Rgb=bad?[.34,.27,.25]:[.48,.49,.43];
 for(let k=0;k<(bad?11:8);k++){const a=k*Math.PI*2/(bad?11:8);rock(m,Math.cos(a)*r*.77,.12,Math.sin(a)*r*.77,r*.26,shade(c,.8+hash(k)*.4),k);}
 m.add(new CylinderGeometry(r*.65,r*.69,.08,12),bad?[.40,.12,.075]:[.22,.56,.71],0,.09);
 for(let k=0;k<3;k++)m.add(new TorusGeometry(r*(.22+k*.15),r*.02,3,17),bad?[.65,.30,.14]:[.58,.79,.85],.025,.143+k*.001,.01,Math.PI/2,0,0,1);
 if(bad)for(let k=0;k<5;k++)rock(m,Math.sin(k*7)*.68,.14,Math.cos(k*7)*.68,.11,[.67,.37,.17],k,1);
 return m.geometry();
}
function geothermal(){
 const m=new Parts();
 for(let k=0;k<15;k++)rock(m,(hash(k)-.5)*2.45,.16,(hash(k+16)-.5)*2.45,.35+hash(k+8)*.3,shade(GEOTHERMAL_ROCK,.9+hash(k)*.4),k);
 for(const[x,z,r]of [[-.72,-.58,.23],[.61,.45,.18],[.12,-.41,.16],[-.38,.68,.20]]){
   m.add(new CylinderGeometry(r,r*1.35,.16,8),shade(GEOTHERMAL_ROCK,.75),x,.36,z);
   m.add(new CylinderGeometry(r*.81,r*.81,.025,9),shade(GEOTHERMAL,1.15),x,.45,z);
   m.add(new TorusGeometry(r*1.02,.025,3,8),[.59,.42,.24],x,.46,z,Math.PI/2,0,0,1);
 }
 return m.geometry();
}
function debris(dam:boolean){
 const m=new Parts();
 for(let k=0;k<6;k++)rock(m,(hash(k)-.5)*.56,.18+(k>3?.19:0),(hash(k+12)-.5)*.56,.23+hash(k+3)*.09,dam?[.45,.40,.28]:[.53,.49,.42],k);
 if(dam)for(let k=0;k<7;k++){const z=(k-3)*.10,y=.26+(k%3)*.07;m.beam([-.44,y,z-.07],[.43,y+.04,z+.07],.055,[.39+.025*k,.27+.017*k,.14+.012*k]);}
 else for(let k=0;k<5;k++)rock(m,(hash(k+92)-.5)*.67,.05,(hash(k+55)-.5)*.67,.10,[.65,.58,.46],k,1);
 return m.geometry();
}
function augment(key:string,base:BufferGeometry){
 const m=new Parts().copy(base);
 if(key.startsWith('scaffold.')){
   // Approved scaffold/panel/ivy geometry remains. A few steel gussets and bolt
   // heads give close-up edges thickness without filling the open silhouette.
   for(const x of [-.42,.42])for(const z of [-.42,.42]){
     m.box(.14,.08,.14,shade(RUIN.rust,.77),x,.06,z,0,0,0,1);
     m.add(new CylinderGeometry(.025,.025,.012,6),[.61,.47,.31],x,.11,z,0,0,0,1);
   }
 }else if(key==='UndergroundRuins'){
   // The actual pit, roots, platforms and frame are kept.
   m.add(new TorusGeometry(.18,.032,5,12),shade(MINE.frame,.8),0,1.52,0,0,Math.PI/2,0,1);
   for(const x of [-2.37,2.37])for(const z of [-2.37,2.37])m.add(new CylinderGeometry(.065,.065,.025,6),[.62,.52,.35],x,.185,z,0,0,0,1);
   for(const z of [-2.25,2.25])for(let k=0;k<11;k++)m.box(.026,.014,.18,shade(MINE.wood,.7),-2+k*.4,.20,z,0,0,0,1);
 }else if(key==='Slope'){
   // Worn steps sit on the correct inclined face. Markers retain the old arrow.
   for(let k=0;k<6;k++){const z=-.41+k*.155;m.box(.76,.026,.034,[.60,.55,.45],0,z+.52,z,Math.PI/4,0,0,1);}
 }
 return m.geometry();
}
export function category(template:string){
 if(template.startsWith('RuinColumn'))return 'ruins';
 return ({UndergroundRuins:'mine',SmallRelic:'relics',MediumRelic:'relics',LargeRelic:'relics',StartingLocation:'start',GeothermalField:'geothermal',Thorns:'thorns',Slope:'slopes',NaturalDam:'dams',Blockage:'blocks',WaterSource:'sources',BadwaterSource:'sources'} as Record<string,string>)[template];
}
export class Landmarks {
 group=new Group();detail={value:1};private material:ShaderMaterial;private pairs:{old:InstancedMesh;fresh:InstancedMesh;category:string}[]=[];
 stats={buildMs:0,draws:0,triangles:0,instances:0};
 constructor(base:ShaderMaterial){
  this.material=new ShaderMaterial({defines:{...base.defines},uniforms:{...base.uniforms,finishObjectDetail:this.detail},vertexShader:'uniform float finishObjectDetail;varying vec3 finishLocal;\n'+base.vertexShader,fragmentShader:'uniform float finishObjectDetail;varying vec3 finishLocal;\n'+base.fragmentShader});
  this.material.vertexShader=replace(this.material.vertexShader,'        vec3 p = position;','        finishLocal=position; vec3 p = position;');
  this.material.vertexShader=replace(this.material.vertexShader,'float perUnit = 0.5 * viewHeight','float perUnit = finishObjectDetail < 0.5 ? 0.0 : 0.5 * viewHeight');
  this.material.fragmentShader=replace(this.material.fragmentShader,'        gl_FragColor = vec4(finish(vColor * light, vWorld), 1.0);',`
        vec3 color=vColor;
        if(finishObjectDetail>0.5){
          float grain=vnoise(finishLocal.xz*31.7+finishLocal.y*vec2(1.3,19.1));
          float patina=vnoise(finishLocal.xz*5.7+finishLocal.y*vec2(7.3,3.1));
          float close=1.0-smoothstep(.025,.11,max(fwidth(vWorld.x),fwidth(vWorld.y)));
          color*=1.0+(grain-.5)*.12*close+(patina-.5)*.07;
        }
        gl_FragColor=vec4(finish(color*light,vWorld),1.0);`);
 }
 setMap(map:MapView,original:Group){
   const t=performance.now();this.clear();
   for(const child of original.children){
     const old=child as InstancedMesh,objects=old.userData.objects as Int32Array|undefined;
     if(!objects?.length||!old.isInstancedMesh)continue;
     const type=map.entities.templates[map.entities.template[objects[0]]],cat=category(type);if(!cat)continue;
     // Leave the arrow and entrance cue themselves at their exact baseline size.
     if(old.name==='Slope.mark'||old.name==='start.entrance')continue;
     const kinds=old.name==='block.rubble'?new Set(Array.from(objects,i=>map.entities.templates[map.entities.template[i]])):new Set([type]);
     for(const name of kinds){
       const indices=Array.from(objects,(_,i)=>i).filter(i=>old.name!=='block.rubble'||map.entities.templates[map.entities.template[objects[i]]]===name);
       let geometry:BufferGeometry;
       if(name==='StartingLocation')geometry=district();
       else if(name.endsWith('Relic'))geometry=relic(name);
       else if(name==='Thorns')geometry=bramble();
       else if(name==='GeothermalField')geometry=geothermal();
       else if(name==='WaterSource'||name==='BadwaterSource')geometry=source(name==='BadwaterSource');
       else if(name==='Blockage'||name==='NaturalDam')geometry=debris(name==='NaturalDam');
       else geometry=augment(old.name,old.geometry);
       const fresh=new InstancedMesh(geometry,this.material,indices.length),grow=old.geometry.getAttribute('grow'),mat=new Matrix4();
       const grows:number[]=[],colors:number[]=[],baselineColors:number[]=[];
       for(const [j,i]of indices.entries()){
         old.getMatrixAt(i,mat);fresh.setMatrixAt(j,mat);
         grows.push(grow.getX(i),grow.getY(i),grow.getZ(i));
         const tint=old.instanceColor!;
         baselineColors.push(tint.getX(i),tint.getY(i),tint.getZ(i));
         colors.push(...(name==='NaturalDam'||name==='Blockage'?[1,1,1]:[tint.getX(i),tint.getY(i),tint.getZ(i)]));
       }
       geometry.setAttribute('grow',new InstancedBufferAttribute(new Float32Array(grows),3));fresh.instanceColor=new InstancedBufferAttribute(new Float32Array(colors),3);
       fresh.userData.proposalColors=fresh.instanceColor;
       fresh.userData.baselineColors=new InstancedBufferAttribute(new Float32Array(baselineColors),3);
       fresh.instanceMatrix.needsUpdate=true;fresh.frustumCulled=false;fresh.name=name;fresh.userData.objects=Int32Array.from(indices,i=>objects[i]);
       this.group.add(fresh);this.pairs.push({old,fresh,category:category(name)!});
     }
   }
   this.stats={buildMs:performance.now()-t,draws:this.pairs.length,triangles:this.pairs.reduce((n,p)=>n+p.fresh.geometry.getAttribute('position').count/3*p.fresh.count,0),instances:this.pairs.reduce((n,p)=>n+p.fresh.count,0)};
 }
 apply(enabled:boolean,details:boolean,flags:Record<string,boolean>){
  this.detail.value=+details;
  // A mixed original batch can contain dams AND blockages. Restore it only if
  // both categories are disabled; split batches below preserve partial toggles.
  const oldMeshes=new Set(this.pairs.map(p=>p.old));
  for(const old of oldMeshes){
   const entries=this.pairs.filter(p=>p.old===old),any=entries.some(p=>enabled&&flags[p.category]);
   old.visible=!any;
   for(const p of entries){p.fresh.visible=any;const chosen=enabled&&flags[p.category];p.fresh.material=chosen?this.material:old.material;
     p.fresh.instanceColor=chosen?p.fresh.userData.proposalColors:p.fresh.userData.baselineColors;
     // Category-off entries in a mixed batch use a baseline-geometry clone.
     if(!p.fresh.userData.proposal)p.fresh.userData.proposal=p.fresh.geometry;
     if(!chosen&&any){
       if(!p.fresh.userData.baseline){const g=old.geometry.clone();g.setAttribute('grow',p.fresh.geometry.getAttribute('grow'));p.fresh.userData.baseline=g;}
       p.fresh.geometry=p.fresh.userData.baseline;
     }else p.fresh.geometry=p.fresh.userData.proposal;
   }
  }
 }
 clear(){for(const p of this.pairs){p.old.visible=true;(p.fresh.userData.proposal??p.fresh.geometry).dispose();p.fresh.userData.baseline?.dispose();p.fresh.dispose();}this.group.clear();this.pairs=[];}
 dispose(){this.clear();this.material.dispose();this.group.removeFromParent();}
}
