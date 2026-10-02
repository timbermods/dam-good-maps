// Reuse Rust-water's isolated debugger repair; never alter the shared browser.
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {WATER,deps,hash} from './common.mjs';
export function firefoxRuntime(){
 const executablePath=process.env.DGM_FIREFOX_EXECUTABLE??resolve(WATER,'local/profiles/firefox-diagnostic/firefox.exe');
 if(!existsSync(executablePath))throw Error('Corrected Firefox copy missing; follow INTEGRATION.md regeneration instructions.');
 const archivePath=resolve(executablePath,'../omni.ja');
 const archive=readFileSync(archivePath),entries=deps('fflate').unzipSync(archive);
 const runtime=entries['chrome/juggler/content/content/Runtime.js'];
 const text=new TextDecoder().decode(runtime);
 if(!text.includes('this._debugger.allowUnobservedWasm = true')||!text.includes('this._debugger.allowUnobservedAsmJS = true'))throw Error('Firefox debugger still pins Wasm to baseline.');
 const firefoxUserPrefs={'javascript.options.wasm_baselinejit':false,'javascript.options.wasm_optimizingjit':true,'javascript.options.wasm_lazy_tiering':false};
 const evidence={executablePath,executableSha256:hash(readFileSync(executablePath)),archiveSha256:hash(archive),runtimeSha256:hash(runtime),firefoxUserPrefs,upstream:'https://github.com/microsoft/playwright/blob/v1.63.0/browser_patches/firefox/juggler/content/Runtime.js'};
 return {options:{executablePath,firefoxUserPrefs},evidence,fingerprint:hash(JSON.stringify(evidence))};
}
