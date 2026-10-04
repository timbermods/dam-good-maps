// Reproduce in a plain ignored export of THIS clone. No other checkout, benchmark or matrix.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync, openSync, closeSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const study=dirname(fileURLToPath(import.meta.url)), root=join(study,"../.."), work=join(study,"local/workspace");
const env={...process.env,DGM_CARGO_JOBS:"8"};
mkdirSync(join(study,"local"),{recursive:true});
function run(label,exe,args,cwd=work){
 console.log(label);const file=join(study,`local/${label}.txt`),fd=openSync(file,"w");
 try{const r=spawnSync(exe,args,{cwd,env,windowsHide:true,stdio:["ignore",fd,fd]});if(r.error)throw r.error;if(r.status!==0)throw Error(`${label} failed; see ${file}`);}finally{closeSync(fd);}
}
run("prepare","python",[join(study,"prepare.py")],root);
run("adopt","python",[join(study,"adopt.py")],root);
if(!existsSync(join(work,"node_modules/tsx/dist/cli.mjs"))){
 // npm.cmd needs cmd on Windows; no interpolated user input or filesystem operations.
 if(process.platform==="win32")run("dependencies",process.env.ComSpec??"cmd.exe",["/d","/s","/c","npm ci --ignore-scripts --no-audit --no-fund"]);
 else run("dependencies","npm",["ci","--ignore-scripts","--no-audit","--no-fund"]);
}
const node=process.execPath,tsx="node_modules/tsx/dist/cli.mjs";
run("build",node,[tsx,"tools/rust/build.ts","--native"]);
run("typecheck",node,["node_modules/typescript/bin/tsc","--noEmit"]);
const files=["tests/contract","tests/unit"].flatMap(dir=>readdirSync(join(work,dir)).filter(f=>/^(force|carve|carves).*\.test\.ts$/.test(f)&&!f.includes(".heavy.")).map(f=>`${dir}/${f}`));
run("force-suites",node,["node_modules/vitest/vitest.mjs","run","--project","quick","--maxWorkers","8",...files]);
env.PW_CHANNEL??="chrome";
run("rust-check",node,[tsx,"tools/rust/check.ts","--engines","--jobs","8"]);
run("determinism",node,[tsx,"tools/determinism/run.ts","--smoke","--only","/maturity/","--serial","--no-timings","--out-dir",join(study,"local/determinism")]);
run("emit","python",[join(study,"emit_patch.py")],root);
run("patch-check","git",["apply","--check","--whitespace=error-all",join(study,"adoption.patch")],root);
if(process.argv.includes("--captures"))run("captures",node,[join(study,"make-captures.mjs")],root);
console.log("Passed. Full logs, native/Wasm builds and browser manifests remain under local/.");
