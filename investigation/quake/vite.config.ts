import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { mkdirSync,writeFileSync } from 'node:fs';
const here = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  plugins:[{name:'quake-local-capture',configureServer(server){
    server.middlewares.use('/__quake_capture',(req,res)=>{
      if(req.method!=='POST'||req.headers.origin!=='http://'+req.headers.host){res.statusCode=403;res.end();return;}
      let body='';req.on('data',part=>{body+=part;if(body.length>5_000_000)req.destroy();});
      req.on('end',()=>{try{
        const data=JSON.parse(body);if(typeof data.jpeg!=='string'||!data.jpeg.startsWith('data:image/jpeg;base64,'))throw Error('Invalid image');
        mkdirSync(here+'local',{recursive:true});writeFileSync(here+'local/clean-view.jpg',Buffer.from(data.jpeg.slice(23),'base64'));
        writeFileSync(here+'local/browser-metrics.json',JSON.stringify(data.metrics,null,2)+'\n');res.end('Saved');
      }catch{res.statusCode=400;res.end('Invalid capture');}});
    });
  }}],
  root: here,
  publicDir: '../../public',
  resolve: { alias: {
    'three/addons': fileURLToPath(new URL('./node_modules/three/examples/jsm', import.meta.url)),
    three: fileURLToPath(new URL('./node_modules/three', import.meta.url)),
    fflate: fileURLToPath(new URL('./node_modules/fflate/esm/browser.js', import.meta.url))
  }},
  server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { allow: [fileURLToPath(new URL('../../', import.meta.url))] } },
  build: { outDir: 'dist', emptyOutDir: true, copyPublicDir: false },
  worker: { format: 'es' }
});
