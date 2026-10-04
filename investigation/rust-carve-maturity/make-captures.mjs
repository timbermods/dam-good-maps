// Run after run.mjs. No TypeScript Meander planner is imported or executed.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import http from "node:http";
const study=dirname(fileURLToPath(import.meta.url)), root=resolve(study,"../.."), work=join(study,"local/workspace");
const base="59483c63eb3e687944cbea585fb4f51c2019e7ca";
const p=join(work,"investigation/meander/view.ts");const source=execFileSync("git",["show",`${base}:investigation/meander/view.ts`],{cwd:root,windowsHide:true,encoding:"utf8"});
writeFileSync(p,source.replace('import { hash, clamp, smooth } from "../../src/core/forces/random";', 'import { hash, clamp } from "../../src/core/forces/random";\nimport { smoothstep as smooth } from "../../src/core/math/clamp";'));
const { build }=await import(pathToFileURL(join(work,"node_modules/esbuild/lib/main.js")).href);
const bundle=join(study,"local/capture-bundle.js");
await build({entryPoints:[join(study,"capture-page.ts")],outfile:bundle,bundle:true,platform:"browser",format:"esm",target:"es2022",nodePaths:[join(work,"node_modules")]});
const html='<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#edf0e7;color:#25392f;font:18px Arial}h1{font-size:22px;margin:16px}section{display:flex}article{width:900px}h2{font-size:18px;text-align:center;margin:0}canvas{width:900px;height:620px;display:block}</style><h1></h1><section><article><h2>Before</h2><canvas></canvas></article><article><h2>Carve: Mature (Rust)</h2><canvas></canvas></article></section><script type="module" src="/bundle.js"></script>';
const server=http.createServer((req,res)=>{
  try{if(req.url==="/bundle.js"){res.setHeader("content-type","text/javascript");res.end(readFileSync(bundle));}
  else if(req.url?.startsWith("/maps/")){const [,map]=/^\/maps\/(young|narrow|long)$/.exec(req.url)??[];if(!map)throw Error("Unknown map");res.setHeader("content-type","application/json");res.end(gunzipSync(execFileSync("git",["show",`${base}:investigation/meander/maps/${map}.json.gz`],{cwd:root,windowsHide:true,maxBuffer:32*1024*1024})));}
  else {res.setHeader("content-type","text/html");res.end(html);}}catch(e){res.writeHead(500);res.end(String(e));}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const { chromium }=await import(pathToFileURL(join(work,"node_modules/@playwright/test/index.mjs")).href);
const browser=await chromium.launch({headless:true,channel:process.env.PW_CHANNEL??"chrome"});const evidence={};
try{
 for(const id of ["young","narrow","long","existing"]){
  const page=await browser.newPage({viewport:{width:1800,height:700},deviceScaleFactor:1});await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.capture);
  evidence[id]=await page.evaluate(id=>window.capture(id),id);await page.screenshot({path:join(study,`local/${id}.jpg`),type:"jpeg",quality:86});await page.close();console.log(id,JSON.stringify(evidence[id]));
 }
 writeFileSync(join(study,"local/demo-stats.json"),JSON.stringify(evidence,null,2)+"\n");
}finally{await browser.close();server.close();}
