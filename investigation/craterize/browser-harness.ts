import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { resolve } from 'node:path';
export async function browserHarness(width=1440,height=1000){
  const server=await createServer({configFile:resolve('vite.config.ts'),server:{port:0,host:'127.0.0.1'}});
  await server.listen();const url=server.resolvedUrls!.local[0];
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url);
  const idle=()=>page.waitForFunction(()=>{const s=(window as any).craterize?.state;return s&&!s.busy&&!s.active&&!s.queued;},undefined,{timeout:180000});
  await idle();
  return {server,browser,page,errors,idle,close:async()=>{await browser.close();await server.close();}};
}
