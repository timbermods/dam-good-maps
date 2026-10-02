import {readFileSync,existsSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {require,root,dir} from './build.mjs';
const {build}=await import(pathToFileURL(require.resolve('vite')));
const preactModule=await import(pathToFileURL(require.resolve('@preact/preset-vite')));
const preact=typeof preactModule.default==='function'?preactModule.default:preactModule.default.default;
const deps=process.env.DGM_DEPS??resolve(root,'../../../startup/local/checkout');
const original=file=>readFileSync(file,'utf8');
for(const variant of process.argv.includes('--round2')?['after','round2']:['before','after']){
  const dependencyPlugin=()=>({name:'investigation-dependencies',enforce:'pre',async resolveId(id,importer,opts){if(!id.startsWith('.')&&!id.startsWith('/')&&!id.includes(':')&&!id.startsWith('\0'))return this.resolve(id,resolve(deps,'package.json'),{...opts,skipSelf:true});}});
  const sourcePlugin=()=>({name:'investigation-candidate-and-marks',enforce:'pre',resolveId(id,importer){if(variant==='round2'&&id.endsWith('/portable')&&importer)return resolve(importer.replace(/[\\/][^\\/]*$/,''),id+'.ts');},load(id){const file=id.split('?')[0].replaceAll('\\','/'),rr=root.replaceAll('\\','/');if(!file.startsWith(rr+'/src/'))return null;let text=existsSync(file)?original(file):'';
    if((variant==='after'||variant==='round2')&&file.startsWith(rr+'/src/core/')){const p=resolve(dir,'candidate',relative(resolve(root,'src/core'),file));if(existsSync(p))text=original(p);if(variant==='round2'){const p2=resolve(dir,'round2/candidate',relative(resolve(root,'src/core'),file));if(existsSync(p2))text=original(p2);}}
    if(file.endsWith('/src/ui/App.tsx')){
      text=text.replace('  const init = useMemo(initialSpec, []);',`  (window as any).__gsGenerate = (fragment: string) => run(decodeSpecFragment(fragment)!.spec);\n  const init = useMemo(initialSpec, []);`);
      text=text.replace('    let made: GenerateResponse | null = null;',`    (window as any).__gsMark?.('generate', s);\n    let made: GenerateResponse | null = null;`);
      text=text.replace('      setResult(r);\n      made = r;',`      (window as any).__gsMark?.('response', {sha256:r.sha256,passed:r.passed});\n      setResult(r);\n      made = r;`);
    }
    if(file.endsWith('/src/ui/FirstLook.tsx'))text=text.replace('  ctx.putImageData(img, 0, 0);',`  ctx.putImageData(img, 0, 0);\n  (window as any).__gsMark?.((l as any).kind === 'candidate' ? 'candidatePaint' : 'landPaint', l);`);
    if(file.endsWith('/src/ui/Preview2D.tsx'))text=text.replace('  ctx.drawImage(off, 0, 0, W * scale, H * scale);',`  ctx.drawImage(off, 0, 0, W * scale, H * scale);\n  (window as any).__gsMark?.('settledPaint', {sha256:r.sha256});`);
    return text;
  }});
  await build({configFile:false,root,base:'/',cacheDir:resolve(dir,'local/vite-cache'),publicDir:false,plugins:[dependencyPlugin(),sourcePlugin(),preact()],worker:{format:'es',plugins:()=>[dependencyPlugin(),sourcePlugin()]},build:{outDir:resolve(dir,`local/web-${variant}`),emptyOutDir:false,sourcemap:false,target:'es2022',rollupOptions:{input:resolve(root,'index.html')}}});
}
