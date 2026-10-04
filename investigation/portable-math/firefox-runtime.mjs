// The rust-analysis PROFILE_REPORT.md setup; reuse its corrected executable read-only.
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {deps,ROOT,hash} from './common.mjs';
export function firefoxRuntime(){
 const executablePath=process.env.DGM_FIREFOX_EXECUTABLE??resolve(ROOT,'../../../../investigation/rust-water/local/checkout/investigation/rust-water/local/profiles/firefox-diagnostic/firefox.exe');
 if(!existsSync(executablePath))throw Error('Set DGM_FIREFOX_EXECUTABLE to the isolated corrected Firefox copy from rust-analysis PROFILE_REPORT.md');
 const archive=readFileSync(resolve(executablePath,'../omni.ja')),entries=deps('fflate').unzipSync(archive),runtime=entries['chrome/juggler/content/content/Runtime.js'],text=new TextDecoder().decode(runtime);
 if(!text.includes('this._debugger.allowUnobservedWasm = true')||!text.includes('this._debugger.allowUnobservedAsmJS = true'))throw Error('Debugger still pins Wasm to baseline');
 const firefoxUserPrefs={'javascript.options.wasm_baselinejit':false,'javascript.options.wasm_optimizingjit':true,'javascript.options.wasm_lazy_tiering':false};
 return {options:{executablePath,firefoxUserPrefs},evidence:{executablePath,executableSha256:hash(readFileSync(executablePath)),archiveSha256:hash(archive),runtimeSha256:hash(runtime),firefoxUserPrefs,upstream:'https://github.com/microsoft/playwright/blob/v1.63.0/browser_patches/firefox/juggler/content/Runtime.js'}};
}
