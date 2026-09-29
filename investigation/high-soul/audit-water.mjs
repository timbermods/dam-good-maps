import {createServer} from './local/node_modules/vite/dist/node/index.js';import {proposalPlugin} from './proposal.mjs';import {writeFileSync} from 'node:fs';import {resolve} from 'node:path';
const root=resolve('investigation/high-soul/local/site');
const server=await createServer({root,configFile:false,plugins:[proposalPlugin()],server:{middlewareMode:true},cacheDir:resolve('investigation/high-soul/local/audit-cache')});
try{const {HIGH_WATER:H,WATER:W}=await server.ssrLoadModule('/src/render3d/waterPalette.ts');
const sim={normal:[1,0,0,0,1,0,0,0,1],deuteranopia:[.367322,.860646,-.227968,.280085,.672501,.047413,-.01182,.04294,.968881],protanopia:[.152286,1.052583,-.204868,.114503,.786281,.099216,-.003882,-.048116,1.051998],tritanopia:[1.255528,-.076749,-.178779,-.078411,.930809,.147602,.004733,.691367,.3039]};
const lum=c=>.2126*c[0]+.7152*c[1]+.0722*c[2];const dec=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
const ls=(c,m)=>{let a=c.map(dec);let v=[0,1,2].map(i=>Math.max(0,m[i*3]*a[0]+m[i*3+1]*a[1]+m[i*3+2]*a[2]));let y=lum(v);return y>.008856?116*Math.cbrt(y)-16:903.3*y};
let out={note:'High body inputs before ripple lighting, grade, transparency and caustics. Existing repository palette tests measure Standard; these expose the High coverage gap.',input:H,raw:{shallowOverBad:lum(H.shallow)-lum(H.bad),deepOverBad:lum(H.deep)-lum(H.bad.map(v=>v*.88))},simulations:{}};
for(const[n,m]of Object.entries(sim))out.simulations[n]={shallowOverBadLstar:ls(H.shallow,m)-ls(H.bad,m),deepOverBadLstar:ls(H.deep,m)-ls(H.bad.map(v=>v*.88),m),cleanDepthSpan:ls(H.shallow,m)-ls(H.deep,m)};
writeFileSync(resolve('investigation/high-soul/high-water-audit.json'),JSON.stringify(out,null,2)+'\n');console.log(out.raw,out.simulations);
}finally{await server.close();}
