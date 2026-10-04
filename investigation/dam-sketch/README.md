# Dam sketch investigation — round 2

Work stays in this folder. REPORT.md has the decision numbers; INTEGRATION.md has
the engine contract; CALIBRATION.md has the unrun Probe batch. The first-round Node
measurements are preserved separately. No command below launches Timberborn.
All large output belongs in ignored local/.

Use Node 24 and an existing dependency directory through DGM_DEPS (read-only),
or install into a fresh local directory:

```powershell
npm install --prefix local --cache local/npm-cache --no-audit --no-fund esbuild@0.28.2 typescript@5.9.3 fflate@0.8.3 ajv@8.20.0 @types/node@26.6.4 playwright@1.58.0
$env:DGM_DEPS = "$PWD/local"
$env:DGM_BROWSER_DEPS = "$PWD/local"
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/local/browsers"
node local/node_modules/playwright/cli.js install chromium firefox webkit
```

Existing installations can be reused without changing them. DGM_PLAYWRIGHT can
name an absolute compatible Playwright package directory. This host reused 1.58.0,
Chromium 145 / Firefox 146.0.1 / Windows WebKit 26. Firefox must be the corrected
private copy: the harness checks both upstream debugger properties and explicitly
disables baseline Wasm. To create that copy:

```powershell
python prepare-firefox.py '<installed Firefox 1509 directory containing firefox.exe>' local/firefox-diagnostic
$env:DGM_FIREFOX_EXECUTABLE = "$PWD/local/firefox-diagnostic/firefox.exe"
```

Prepare Rust from 2ebeea87c55d5f728c735d79a6d24bde78999db7. prepare.mjs builds the
pinned crate/toolchain/wasm32 target if needed, or DGM_RUST_WASM can name an existing
pinned artifact. Its hash is recorded and the original Rust/TS checks must pass.

Regenerate the exact round-one maps with the original generator at bb5723f8,
keeping its generated source/maps and refreshed Node measurements under local/:

```powershell
node prepare.mjs
$env:DGM_RUST_WASM = "$PWD/local/water.wasm"
git archive --format=zip --output=local/round1-source.zip bb5723f8
Expand-Archive -LiteralPath local/round1-source.zip -DestinationPath local/round1-source -Force
Push-Location local/round1-source/investigation/dam-sketch
node prepare.mjs
node local/demo.cjs
Pop-Location
New-Item local/maps -ItemType Directory -Force | Out-Null
Copy-Item local/round1-source/investigation/dam-sketch/local/maps/*.timber local/maps/
```

Map hashes must match benchmarks.json; build-round2.mjs refuses different bytes.
It reads the original engine into local/before-engine.ts, bundles the harness,
records source/binary hashes, and links dependency types into local/ when DGM_DEPS
is external. The committed baseline measurement files stay unchanged.

Run the final evidence pipeline sequentially, from this folder on Windows:

```powershell
node build-round2.mjs
node local/check.cjs
node local/node_modules/typescript/bin/tsc -p tsconfig.json
node local/round2-contracts.cjs
Remove-Item Env:DGM_PROFILE_SIZE -ErrorAction SilentlyContinue
node profile-run.mjs
Copy-Item profile-timings.json local/identity-all.json
$env:DGM_PROFILE_SIZE = '256'
node profile-run.mjs
Remove-Item Env:DGM_PROFILE_SIZE
node local/calibration.cjs
node browser-round2.mjs
node controls.mjs
node summarize-round2.mjs
node write-round2-report.mjs
```

CPU is sampled with Windows PDH every second. Each timing row has its own span,
mean, peak and sample count; mean above 20% is provisional. Missing samples or
startup failure are reported, never silently treated as idle. Firefox/WebKit
clocks can be quantized. First-visible markers are rAF canvas uploads, not
compositor timestamps. Twelve changes at least 100 ms apart give matched input
cadence across browser refresh rates. Three repetitions × three walls × two sizes
× three browsers produce 54 rows and 648 change records; references last two
seconds. Raw logs/profiles remain local and their hashes bind compact evidence.
Superseded exploratory measurements stay local and are excluded.

For the optional original static demo, node local/demo.cjs and node serve.mjs
produce/serve local/demo.html at 127.0.0.1:8943; that command refreshes its Node
measurements. The round-two driver uses its own ephemeral localhost server.
Probe scenes, full column predictions and the job template regenerate under
local/calibration. Scene staging by the dedicated-machine session is required,
as CALIBRATION.md explains. Commit only code, compact evidence and a few captures;
no profiles, browser binaries, dependency trees, maps or game files enter git.
