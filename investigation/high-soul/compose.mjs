import {browser,DIR} from './harness.mjs';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {join} from 'node:path';
const b=await browser(),p=await b.newPage();mkdirSync(join(DIR,'captures'),{recursive:true});
const data=file=>'data:image/jpeg;base64,'+readFileSync(join(DIR,file)).toString('base64');
async function compose(name,files,labels,cols=3,width=640,simulations=false,crop=null){
 const url=await p.evaluate(async({files,labels,cols,width,simulations,crop})=>{
  const sims={colour:null,greyscale:[.2126,.7152,.0722,.2126,.7152,.0722,.2126,.7152,.0722],deuteranopia:[.367322,.860646,-.227968,.280085,.672501,.047413,-.01182,.04294,.968881],protanopia:[.152286,1.052583,-.204868,.114503,.786281,.099216,-.003882,-.048116,1.051998],tritanopia:[1.255528,-.076749,-.178779,-.078411,.930809,.147602,.004733,.691367,.3039]};
  const imgs=await Promise.all(files.map(async src=>{let i=new Image();i.src=src;await i.decode();return i}));
  const height=Math.round(width*670/1600),band=30,gap=5,rows=simulations?imgs.length:Math.ceil(imgs.length/cols);
  const c=document.createElement('canvas');c.width=cols*width+(cols-1)*gap;c.height=rows*(height+band+gap)+(crop?height+band:0);const g=c.getContext('2d');g.fillStyle='#1c242b';g.fillRect(0,0,c.width,c.height);g.font='14px sans-serif';
  function tile(img,x,y,label,matrix,region){g.fillStyle='#edf3f5';g.fillText(label,x+9,y+20);if(region)g.drawImage(img,...region,x,y+band,width,height);else g.drawImage(img,x,y+band,width,height);if(matrix){let d=g.getImageData(x,y+band,width,height);const lin=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4,enc=v=>v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;for(let k=0;k<d.data.length;k+=4){let a=[0,1,2].map(j=>lin(d.data[k+j]/255));for(let j=0;j<3;j++)d.data[k+j]=Math.round(255*enc(Math.min(1,Math.max(0,matrix[j*3]*a[0]+matrix[j*3+1]*a[1]+matrix[j*3+2]*a[2]))));}g.putImageData(d,x,y+band);}}
  if(simulations){imgs.forEach((img,i)=>Object.entries(sims).forEach(([n,m],j)=>tile(img,j*(width+gap),i*(height+band+gap),labels[i]+' / '+n,m)));}
  else imgs.forEach((img,i)=>tile(img,i%cols*(width+gap),Math.floor(i/cols)*(height+band+gap),labels[i],null));
  if(crop)imgs.forEach((img,i)=>tile(img,i*(width+gap),height+band+gap,'Detail / '+labels[i],null,Array.isArray(crop[0])?crop[i]:crop));
  return c.toDataURL('image/jpeg',.87);
 },{files:files.map(data),labels,cols,width,simulations,crop});
 writeFileSync(join(DIR,'captures',name+'.jpg'),Buffer.from(url.split(',')[1],'base64'));
}
try{
 for(const n of [1,2])await compose('pair-'+n,[`local/references/pair-${n}-game.jpg`,`local/captures/pair-${n}-baseline.jpg`,`local/captures/pair-${n}-proposal.jpg`],['Timberborn / reference only','Today’s High / 8c975822','Proposal / High'],3,640,false,n===1?[850,180,600,251]:[390,275,800,335]);
 for(const[id,ref]of [['highlands-fall','ref-10.jpg'],['lake-badwater','ref-6.jpg'],['delta-overview','ref-4.jpg']])await compose(id,[`local/captures/${id}-baseline.jpg`,`local/captures/${id}-proposal.jpg`,`local/references/${ref}`],['Today’s High / '+id,'Proposal / same map and camera','Closest game reference / different map']);
 for(const[id,ref]of [['broad-cascade','ref-10.jpg'],['badwater-fall','ref-7.jpg'],['ground-veins','ref-7.jpg']])await compose(id,[`local/references/${ref}`,`local/captures/${id}-baseline.jpg`,`local/captures/${id}-proposal.jpg`],['Game reference / different geometry','Baseline / original material study','Round 2 / same material study'],3,640,false,id==='ground-veins'?[[500,380,600,251],[550,110,600,251],[550,110,600,251]]:null);
 await compose('accessibility-cues',['water-comparison','ground-veins'].map(id=>`local/captures/${id}-proposal.jpg`),['Water: clean left / bad right','Soil: poisoned back / clean front'],5,384,true);
 await compose('standard',[`local/references/pair-2-game.jpg`,'local/captures/pair-2-standard.jpg','local/captures/pair-2-proposal.jpg'],['Timberborn / reference only','Proposal / Standard','Proposal / High']);
 await compose('accessibility',['pair-1','pair-2','highlands-fall','lake-badwater','delta-overview'].map(id=>`local/captures/${id}-proposal.jpg`),['Pair overview','Pair close','Highlands fall','Lake badwater','Delta overview'],5,384,true);
}finally{await b.close()}
