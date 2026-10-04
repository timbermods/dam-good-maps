import http from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {LOCAL} from './common.mjs';
export async function host(){
  const server=http.createServer((req,res)=>{
    res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
    if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><script>window.job=(file,data)=>new Promise((resolve,reject)=>{const w=new Worker(file,{type:"module"});w.onmessage=e=>{w.terminate();resolve(e.data)};w.onerror=e=>{w.terminate();reject(Error(e.message))};w.postMessage(data)});window.reusedJob=(file,data)=>new Promise((resolve,reject)=>{window.jobs??=new Map();const key=file+data.threads;let w=window.jobs.get(key);if(!w){w=new Worker(file,{type:"module"});window.jobs.set(key,w)}w.onmessage=e=>resolve(e.data);w.onerror=e=>reject(Error(e.message));w.postMessage({...data,persistent:true})})</script>');return;}
    const name=req.url.slice(1);if(!/^[a-z-]+\.js$/.test(name)){res.writeHead(404);res.end();return;}
    try{res.setHeader('Content-Type','text/javascript');res.end(readFileSync(resolve(LOCAL,name)));}catch{res.writeHead(404);res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));return {url:`http://127.0.0.1:${server.address().port}/`,close:()=>server.close()};
}
