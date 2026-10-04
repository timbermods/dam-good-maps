import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {require,dir} from './build.mjs';
const {chromium}=require('playwright');
const browser=await chromium.launch({executablePath:process.env.DGM_CHROME??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const page=await browser.newPage();
 const renderer=await page.evaluate(()=>{const gl=document.createElement('canvas').getContext('webgl2');if(!gl)return{available:false};const ext=gl.getExtension('WEBGL_debug_renderer_info');return{available:true,vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION)};});
 const data={browser:browser.version(),headless:true,...renderer};
 writeFileSync(resolve(dir,'BROWSER-GPU.json'),JSON.stringify(data,null,2)+'\n');console.log(data);
}finally{await browser.close();}
