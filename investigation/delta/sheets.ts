import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {shadeTiles} from '../../src/core/render/shade';
import {encodePng} from '../../tools/png';
// Compact labelled own-map sheets, not screenshots of somebody else's maps.
const glyph=['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001001001001','111101111101111','111101111001111'];
const letters:Record<string,string>={D:'110101101101110',E:'111100110100111',L:'100100100100111',T:'111010010010010',A:'010101111101101',B:'110101110101110',F:'111100110100100',O:'111101101101111',R:'110101110101101',X:'101101010101101'};
const mode=process.argv[2]||'after', size=Number(process.argv[3]||96);
const tile=192, gap=8, label=18,header=24, w=5*(tile+gap)+gap,h=4*(tile+label+gap)+gap+header;
const rgb=new Uint8Array(w*h*3).fill(25);
const dot=(x:number,y:number,c:number[])=>{const i=(y*w+x)*3;rgb.set(c,i);};
const title=`DELTA ${mode.startsWith('after')?'AFTER':'BEFORE'} ${size} X ${size}`;
for(const [a,c] of Array.from(title).entries()){const g=letters[c]??glyph[Number(c)];if(c===' '||!g)continue;for(let gy=0;gy<5;gy++)for(let gx=0;gx<3;gx++)if(g[gy*3+gx]==='1')for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++)dot(gap+a*8+gx*2+xx,6+gy*2+yy,[230,230,230]);}
for(let seed=1;seed<=20;seed++) {
 const f=resolve(__dirname,`local/${mode}/${size}-${seed}.json`);if(!existsSync(f))continue;
 const m=JSON.parse(readFileSync(f,'utf8')), colors=shadeTiles(Uint8Array.from(m.heights),m.W,m.H,m.water);
 const ox=gap+((seed-1)%5)*(tile+gap),oy=header+gap+Math.floor((seed-1)/5)*(tile+label+gap);
 for(let y=0;y<tile;y++)for(let x=0;x<tile;x++){
   const mx=Math.min(m.W-1,Math.floor(x*m.W/tile)),my=m.H-1-Math.min(m.H-1,Math.floor(y*m.H/tile)),i=my*m.W+mx;
   let c=Array.from(colors.subarray(i*3,i*3+3));
   if(m.water[i]>.05 && m.contamination[i]>=.5)c=[131,58,57];
   dot(ox+x,oy+y,c);
 }
 if(m.start){const x=ox+Math.floor(m.start.x*tile/m.W),y=oy+Math.floor((m.H-1-m.start.y)*tile/m.H);for(let d=-3;d<=3;d++){dot(x+d,y,[255,225,130]);dot(x,y+d,[255,225,130]);}}
 for(const [a,n] of Array.from(String(seed)).entries())for(let gy=0;gy<5;gy++)for(let gx=0;gx<3;gx++)if(glyph[Number(n)][gy*3+gx]==='1')for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++)dot(ox+a*8+gx*2+xx,oy+tile+3+gy*2+yy,[230,230,230]);
}
const file=resolve(__dirname,`${mode.startsWith('after')?'after':mode}-${size}.png`);writeFileSync(file,encodePng(rgb,w,h));console.log(file);
