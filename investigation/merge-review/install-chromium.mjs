// Install exactly Playwright 1.63's Chromium binaries from the official Chrome-for-Testing mirror.
// curl works on this PC; Node's external HTTPS connections time out. All archive files stay local.
import { createServer } from 'node:http';
import { createReadStream,existsSync,statSync,mkdirSync } from 'node:fs';
import { spawn,spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const version='153.0.8010.12',local=resolve(import.meta.dirname,'local');mkdirSync(local,{recursive:true});
for(const file of ['chrome-win64.zip','chrome-headless-shell-win64.zip']){
 const path=resolve(local,file);if(existsSync(path))continue;
 const p=spawnSync('curl.exe',['--silent','--show-error','--fail','--location','--retry','2','--output',path,`https://storage.googleapis.com/chrome-for-testing-public/${version}/win64/${file}`],{stdio:'inherit',windowsHide:true});if(p.status!==0)throw Error('Download failed: '+file);
}
const server=createServer((req,res)=>{
 const m=/^\/builds\/cft\/153\.0\.8010\.12\/win64\/(chrome-win64\.zip|chrome-headless-shell-win64\.zip)$/.exec(req.url??'');
 if(!m){res.writeHead(404).end();return;}const path=resolve(local,m[1]);
 res.writeHead(200,{'Content-Type':'application/zip','Content-Length':statSync(path).size});createReadStream(path).pipe(res);
});
await new Promise(r=>server.listen(4319,'127.0.0.1',r));
try{
 const child=spawn(process.execPath,[resolve('node_modules/playwright/cli.js'),'install','chromium'],{cwd:process.cwd(),env:{...process.env,PLAYWRIGHT_DOWNLOAD_HOST:'http://127.0.0.1:4319'},stdio:'inherit',windowsHide:true});
 process.exitCode=await new Promise(r=>child.on('exit',r));
}finally{await new Promise(r=>server.close(r));}
