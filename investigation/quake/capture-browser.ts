// Package the real canvas frames recorded by browser-check.html. No re-rendering
// or invented frames: only labels, sizing, and GIF palette encoding.
import { createCanvas,loadImage } from '@napi-rs/canvas';
import { GIFEncoder,quantize,applyPalette } from 'gifenc';
import { readFileSync,writeFileSync } from 'node:fs';
const result=JSON.parse(readFileSync('local/browser-metrics.json','utf8'));
if(!result.captures?.length||result.passed?.length!==9)throw Error('Run browser-check.html first.');
const frames=result.captures as {label:string;jpeg:string}[],gif=GIFEncoder();
for(const [k,f]of frames.slice(0,-1).entries()){
 const img=await loadImage(Buffer.from(f.jpeg.split(',')[1],'base64')),c=createCanvas(800,440),ctx=c.getContext('2d');
 ctx.fillStyle='#f6f4ec';ctx.fillRect(0,0,800,440);ctx.drawImage(img,0,28,800,412);ctx.fillStyle='#263e38';ctx.font='15px sans-serif';ctx.fillText(f.label+' · actual 256² browser stroke',14,20);
 const rgba=ctx.getImageData(0,0,800,440).data,palette=quantize(rgba,128);gif.writeFrame(applyPalette(rgba,palette),800,440,{palette,repeat:0,delay:k===0?650:k===frames.length-2?1300:150});
}
gif.finish();writeFileSync('captures/brush-paint.gif',gif.bytes());
writeFileSync('captures/brush-paint.jpg',Buffer.from(frames[7].jpeg.split(',')[1],'base64'));
writeFileSync('captures/clean-slide.jpg',Buffer.from(frames.at(-1)!.jpeg.split(',')[1],'base64'));
writeFileSync('captures/browser-brush.json',JSON.stringify({passed:result.passed,metrics:result.metrics},null,2)+'\n');
writeFileSync('captures/browser-256.json',JSON.stringify(result.metrics.paint,null,2)+'\n');
console.log('Recorded browser brush GIF, stills and measurements saved.');
