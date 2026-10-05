# Dam sketch 3

All code, small evidence and adoption material lives here. Everything generated is under ignored
local/ (D195); there are no game-derived assets. Requires Node 24+, Rust 1.90.0 and the installed
wasm32-unknown-unknown target. These are finite correctness scenes; no timings are collected.

From this folder:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run prepare:kernel
npm run typecheck
npm test -- --test-reporter=dot
npm run predictions
node make-adoption.mjs
```

prepare copies this clone's rust/ sources into local/kernel/, applies kernel.patch to that copy,
and builds rust/water with -j 4. It does not replace any product source or embedded Wasm.
CARGO may point to a cargo executable; otherwise the helper uses ~/.cargo/bin/cargo.
The five scene recipes and full column predictions go to local/calibration/. To explicitly update
the compact committed evidence after an intentional change: `node predictions.ts --summary`.
The source code and inputs are original work under the repository's AGPL-3.0-or-later licence;
raster traversal is carried forward from investigation/dam-sketch/wall.ts under that same licence.

Before pushing, the root typecheck can also keep its dependencies here. From the repository root:

```powershell
New-Item -ItemType Directory investigation/dam-sketch-3/local/product-deps -Force
Copy-Item package.json,package-lock.json investigation/dam-sketch-3/local/product-deps
npm ci --prefix investigation/dam-sketch-3/local/product-deps --ignore-scripts --no-audit --no-fund
node investigation/dam-sketch-3/root-typecheck.mjs
git apply --check investigation/dam-sketch-3/adoption.patch
git diff --check
```

root-typecheck.mjs reads the unchanged root tsconfig.json; its compiler host redirects only root
node_modules reads to local/product-deps/node_modules. No root files or check settings are changed.
INTEGRATION.md describes the API, adoption steps and meanings. CALIBRATION.md is the dedicated-machine
batch specification, not a game run. REPORT.md is the short result and predictions-summary.json the
compact exact-clock evidence. kernel.patch is the small Rust prerequisite; adoption.patch includes it
plus the headless core and ported Node-runtime tests. No page or renderer wiring is included.
