// Cumulative, exact source transformations applied only to the ignored candidate tree.
import fs from 'node:fs';
import path from 'node:path';
const local=path.join(import.meta.dirname,'local'), stage=process.argv[2];
const base=path.join(local,'control'), candidate=path.join(local,'candidate');
const read=f=>fs.readFileSync(path.join(base,f),'utf8').replaceAll('\r\n','\n');
const write=(f,s)=>fs.writeFileSync(path.join(candidate,f),s);
let build=read('tools/rust/build.ts');
build=build.replace('CARGO_ENCODED_RUSTFLAGS: remaps.join("\\x1f")','CARGO_ENCODED_RUSTFLAGS: [...remaps, ...(pkg === "water" ? ["-C", "target-feature=+simd128,-relaxed-simd"] : [])].join("\\x1f")');
if(!build.includes('target-feature=+simd128')) throw Error('build anchor missing');
write('tools/rust/build.ts',build);
let sim=read('rust/water/src/sim.rs');
if(['layout','sync'].includes(stage)) {
  sim=sim.replace('nb: [Vec<u32>; 4],','// Directions stay N/W/S/E, but one tile\'s four neighbours share a cache line.\n    nb: Vec<[u32; 4]>,').replace('f: Vec<f64>,','// A checked tile access proves all four direction accesses are in bounds.\n    f: Vec<[f64; 4]>,');
  sim=sim.replace('let mut nb = [vec![NONE; n], vec![NONE; n], vec![NONE; n], vec![NONE; n]];','let mut nb = vec![[NONE; 4]; n];');
  sim=sim.replace(/nb\[(\d)\]\[i\]/g,'nb[i][$1]').replace(/self\.nb\[k\]\[i\]/g,'self.nb[i][k]').replace(/self\.nb\[(\d)\]\[c\]/g,'self.nb[c][$1]');
  sim=sim.replace('f: vec![0.0; 4 * n],','f: vec![[0.0; 4]; n],');
  sim=sim.replace(/self\.f\[4 \* n([0-3]) as usize \+ ([0-3])\]/g,'self.f[n$1 as usize][$2]').replace('self.f[4 * n2 as usize]','self.f[n2 as usize][0]');
  // This helper is private scratch; the public outflow vector and ABI stay flat.
  sim=sim.replace(/self\.f\[b \+ ([123])\]/g,'self.f[c][$1]').replace(/self\.f\[b\]/g,'self.f[c][0]');
  sim=sim.replace(/            let b = 4 \* c;\n            self\.f\[c\]\[0\] = 0\.0;\n            self\.f\[c\]\[1\] = 0\.0;\n            self\.f\[c\]\[2\] = 0\.0;\n            self\.f\[c\]\[3\] = 0\.0;/g,'            self.f[c] = [0.0; 4];');
  sim=sim.replace(/                let b = 4 \* c;\n                self\.f\[c\]\[0\] = 0\.0;\n                self\.f\[c\]\[1\] = 0\.0;\n                self\.f\[c\]\[2\] = 0\.0;\n                self\.f\[c\]\[3\] = 0\.0;/g,'                self.f[c] = [0.0; 4];');
  const from=sim.indexOf('            let wc = self.wall[c];'), to=sim.indexOf('\n        // 2. depth',from);
  if(from<0||to<0) throw Error('flow anchors');
  sim=sim.slice(0,from)+`            let wc = self.wall[c];
            let nb = self.nb[c];
            let out = &self.out[b..b + 4];
            let f0 = self.outflow(c, nb[0], wc & 1 != 0, fc, hc, out[0]);
            let f1 = self.outflow(c, nb[1], wc & 2 != 0, fc, hc, out[1]);
            let f2 = self.outflow(c, nb[2], wc & 4 != 0, fc, hc, out[2]);
            let f3 = self.outflow(c, nb[3], wc & 8 != 0, fc, hc, out[3]);
            let mut flows = [f0, f1, f2, f3];
            // The reduction is still left-to-right, never a SIMD horizontal sum.
            let s = f0 + f1 + f2 + f3;
            if game {
                let sd = s * DT;
                if s > 0.0 && dc < sd {
                    let r = dc / sd;
                    for f in &mut flows { *f *= r; }
                }
            } else if s * DT > dc {
                let r = dc / max(s * DT, 1e-12);
                for f in &mut flows { *f *= r; }
            }
            self.f[c] = flows;
        }
`+sim.slice(to);
  sim=sim.replace('let (n0, n1, n2, n3) = (self.nb[c][0], self.nb[c][1], self.nb[c][2], self.nb[c][3]);','let [n0, n1, n2, n3] = self.nb[c];');
  sim=sim.replace('            let f0 = self.f[c][0];\n            let f1 = self.f[c][1];\n            let f2 = self.f[c][2];\n            let f3 = self.f[c][3];','            let [f0, f1, f2, f3] = self.f[c];');
  sim=sim.replace('                self.out[b] = 0.0;\n                self.out[b + 1] = 0.0;\n                self.out[b + 2] = 0.0;\n                self.out[b + 3] = 0.0;','                self.out[b..b + 4].fill(0.0);');
  sim=sim.replace('            self.out[b] = max(0.0, f0 - BAL * in0);\n            self.out[b + 1] = max(0.0, f1 - BAL * in1);\n            self.out[b + 2] = max(0.0, f2 - BAL * in2);\n            self.out[b + 3] = max(0.0, f3 - BAL * in3);',`            self.out[b..b + 4].copy_from_slice(&[
                max(0.0, f0 - BAL * in0),
                max(0.0, f1 - BAL * in1),
                max(0.0, f2 - BAL * in2),
                max(0.0, f3 - BAL * in3),
            ]);`);
}
if(stage==='sync') {
 const from=sim.indexOf('    pub fn sync_rows'), at=sim.indexOf('        for k in 0..n_turned {',from);
 if(from<0||at<0) throw Error('sync anchor');
 sim=sim.slice(0,at)+`        // If occupancy did not change, the active and wet memberships are already exact.
        // Depth/contamination/momentum were copied by the caller before this call;
        // their magnitudes cannot invalidate the occupancy-only bookkeeping.
        if n_turned == 0 {
            return;
        }
`+sim.slice(at);
}
write('rust/water/src/sim.rs',sim);
console.log(stage,'candidate prepared; product files unchanged');
