// Local engine selection only; product sources and check commands stay unchanged.
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../package.json',import.meta.url));
const pw=require('playwright');
for(const [name,key] of [['chromium','DGM_CHROMIUM'],['firefox','DGM_FIREFOX'],['webkit','DGM_WEBKIT']]) {
 const executablePath=process.env[key];if(!executablePath)continue;
 const launch=pw[name].launch.bind(pw[name]);
 pw[name].launch=(options={})=>launch({...options,channel:undefined,executablePath});
}
