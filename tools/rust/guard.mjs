// The Rust maths guard (PLAN §20 D366, D401; from investigation/portable-math, #171). Rejects what could make a
// Rust port compute different bits on different machines or engines: native transcendental maths and mul_add
// in the source; libm calls, transcendental LLVM intrinsics, FMA/fmuladd, floating frem and relaxed
// arithmetic flags in the optimized IR; fused instructions and libm calls in the assembly; libm imports,
// statically linked libm and relaxed SIMD in the Wasm (audit it unstripped). Re-run it for any compiler,
// target or flag change. Used by tools/rust/check.ts; `node tools/rust/guard.mjs <kind> <file>` checks one file.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const approximate='sin_cos|exp_m1|ln_1p|sin|cos|tan|asin|acos|atan|atan2|exp|exp2|expm1|ln|log|log2|log10|log1p|pow|powf|powi|hypot|sqrt|cbrt|sinh|cosh|tanh|asinh|acosh|atanh|mul_add';
const libm='exp10|sinpi|cospi|tanpi|erf|erfc|tgamma|lgamma|j0|j1|jn|y0|y1|yn|fabs|fmax|fmin|fdim|fmod|remainder|remquo|copysign|nextafter|nexttoward|frexp|ldexp|scalbn|scalbln|ilogb|logb|nearbyint|roundeven|sin|cos|tan|asin|acos|atan|atan2|exp|exp2|expm1|log|log2|log10|log1p|pow|hypot|sqrt|cbrt|sinh|cosh|tanh|asinh|acosh|atanh|fma|floor|ceil|trunc|round|rint';
export function sourceViolations(text){
 const code=text.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
 return code.split('\n').flatMap((line,i)=>new RegExp(`(?:\\.|\\bf(?:32|64)::)(?:${approximate})\\b|\\b(?:libm|core::intrinsics|std::intrinsics)\\b`).test(line)||/%\s*\d+\.\d+/.test(line)?[{line:i+1,text:line.trim()}]:[]);
}
export function irViolations(text){return text.split('\n').filter(line=>
 /\bfrem\s+(?:double|float|<)/.test(line)||
 /\bf(?:add|sub|mul|div|rem|cmp)\s+(?:fast|reassoc|nnan|ninf|nsz|arcp|contract|afn)\b/.test(line)||
 /@llvm\.(?:(?:experimental\.constrained\.)?(?:sin|cos|tan|asin|acos|atan|atan2|exp|exp2|expm1|log|log2|log10|log1p|pow|powi|sqrt|cbrt|sinh|cosh|tanh|asinh|acosh|atanh|exp10|sinpi|cospi|tanpi|erf|erfc|tgamma|lgamma|fma|fmuladd))\./.test(line)||
 new RegExp(`\\b(?:call|invoke)\\b.*@(?:_?)(?:${libm})(?:f|l)?\\b`).test(line)||
 /@llvm\.wasm\.relaxed\.(?:madd|nmadd)/.test(line)||
 /(?:call|invoke|define|declare).*@[^\s(]*libm/i.test(line)||
 /"(?:unsafe-fp-math|no-infs-fp-math|no-nans-fp-math|approx-func-fp-math)"="true"/.test(line));}
export function assemblyViolations(text){return text.split('\n').filter(line=>
 /\b(?:fmla|fmls|fmadd|fmsub|fnmadd|fnmsub)\b/i.test(line)||
 /\b(?:call|jmp|bl)\w*\s+[^\n]*libm/i.test(line)||
 /\bv(?:f[mpn]*add|f[mpn]*sub|fmadd|fmsub|fnmadd|fnmsub)\d*/i.test(line)||
 new RegExp(`\\b(?:call|jmp|bl)\\w*\\s+[^\\n]*\\b_?(?:${libm})(?:f|l)?(?:@|$|\\s)`).test(line));}
export function wasmViolations(bytes){
 const module=new WebAssembly.Module(bytes),bad=WebAssembly.Module.imports(module).filter(i=>new RegExp(`(?:^|_)(?:${libm})(?:f|l)?$`).test(i.name)||/libm|math/i.test(i.module));
 for(const feature of WebAssembly.Module.customSections(module,'target_features'))if(new TextDecoder().decode(feature).includes('relaxed-simd'))bad.push({reason:'relaxed SIMD can fuse arithmetic'});
 const sections=WebAssembly.Module.customSections(module,'name');
 if(!sections.length)return [...bad,{reason:'Audit the unstripped Wasm: function names are required to detect statically linked libm'}];
 for(const section of sections){const b=new Uint8Array(section);let at=0;
  const uleb=()=>{let n=0,shift=0,byte;do{byte=b[at++];n|=(byte&127)<<shift;shift+=7;}while(byte&128);return n;};
  while(at<b.length){const id=b[at++],size=uleb(),end=at+size;if(id===1){const count=uleb();for(let i=0;i<count;i++){const index=uleb(),length=uleb(),name=new TextDecoder().decode(b.slice(at,at+length));at+=length;if(/libm/i.test(name)||new RegExp(`^_?(?:${libm})(?:f|l)?$`).test(name))bad.push({index,name});}}at=end;}
 }return bad;
}
export function assertClean(kind,input){const bad=({source:sourceViolations,ir:irViolations,assembly:assemblyViolations,wasm:wasmViolations})[kind](input);if(bad.length)throw Error(kind+' forbidden maths: '+JSON.stringify(bad.slice(0,5)));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [kind,path]=process.argv.slice(2);assertClean(kind,readFileSync(path,kind==='wasm'?undefined:'utf8'));console.log(kind+' guard PASS');}
