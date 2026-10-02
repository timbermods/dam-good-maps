# Dam sketch engine investigation

Standalone D383 prototype, based on dev `4aab909e`. Product code is read, never changed.
No wall, object or simulation result is written back to a map.

From this folder:

```powershell
npm install --prefix local --cache local/npm-cache --no-audit --no-fund esbuild@0.28.2 typescript@5.9.3 fflate@0.8.3 ajv@8.20.0 @types/node@26.6.4
# Optional: reuse an existing compiled rust-water artifact.
$env:DGM_RUST_WASM = '<absolute path to the pinned water.wasm>'
node prepare.mjs
node local/check.cjs
node local/node_modules/typescript/bin/tsc -p tsconfig.json
node local/demo.cjs
node local/live.cjs
node serve.mjs
```

Without DGM_RUST_WASM, prepare builds the pinned dependency with Cargo and the
wasm32-unknown-unknown target. The Rust investigation's commit must be available:
`2ebeea87c55d5f728c735d79a6d24bde78999db7` (fetch that commit if needed).
Everything generated, including dependencies, binaries, real maps and the HTML demo,
stays in ignored `local/`. Only compact checks and measurements enter git.

Open `local/demo.html` after the demo run, or serve it at http://127.0.0.1:8943.
It draws three explicit walls on River Valley
and Lake Basin maps, seed 4242, at both sizes. No site is searched for or recommended.
The maps' source water, contamination and momentum are read from their actual files.
The displayed drought is an explicit nine-day Normal scenario; future weather is not
stored in those map files.

Read [INTEGRATION.md](INTEGRATION.md) before adopting. [REPORT.md](REPORT.md) records
the outcome and limitations. This is a headless engine and static demonstration, not
the editor interface.
