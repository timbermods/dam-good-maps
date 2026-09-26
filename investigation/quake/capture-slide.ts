// Encode only the real canvas frames produced by browser-slide.html.
import { createCanvas,loadImage } from '@napi-rs/canvas';
import { GIFEncoder,quantize,applyPalette } from 'gifenc';
import { readFileSync,writeFileSync } from 'node:fs';
const r=JSON.parse(readFileSync('local/browser-metrics.json','utf8'));
if(r.kind!=='slide'||r.passed?.length!==5)throw Error('Run browser-slide.html first.');
const frames=r.captures as {label:string;jpeg:string;delay:number}[],gif=GIFEncoder(),panels=[];
for(const f of frames){
 const img=await loadImage(Buffer.from(f.jpeg.split(',')[1],'base64')),c=createCanvas(640,355),ctx=c.getContext('2d');
 ctx.fillStyle='#f6f4ec';ctx.fillRect(0,0,640,355);ctx.drawImage(img,0,26,640,329);ctx.fillStyle='#263e38';ctx.font='14px sans-serif';ctx.fillText(f.label,12,18);
 const rgba=ctx.getImageData(0,0,640,355).data,palette=quantize(rgba,128);gif.writeFrame(applyPalette(rgba,palette),640,355,{palette,repeat:0,delay:f.delay});panels.push(c);
}
gif.finish();writeFileSync('captures/slide-glide.gif',gif.bytes());
const comparison=createCanvas(1280,355),ctx=comparison.getContext('2d');ctx.drawImage(panels[0],0,0);ctx.drawImage(panels.at(-1)!,640,0);
writeFileSync('captures/slide-glide.png',comparison.toBuffer('image/png'));
writeFileSync('captures/clean-slide.jpg',Buffer.from(frames.at(-1)!.jpeg.split(',')[1],'base64'));
writeFileSync('captures/browser-slide.json',JSON.stringify({passed:r.passed,metrics:r.metrics},null,2)+'\n');
console.log(JSON.stringify({frames:frames.length,metrics:r.metrics},null,2));
