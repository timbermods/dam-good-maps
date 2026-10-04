$ErrorActionPreference = 'Stop'
$studyRoot = $PSScriptRoot
$repositoryRoot = Split-Path (Split-Path $studyRoot)
$investigationRoot = (Resolve-Path (Join-Path $repositoryRoot '../../..')).Path
$toolchainRoot = Join-Path $investigationRoot 'rust-water/local/toolchain'
$env:CARGO_HOME = Join-Path $toolchainRoot 'cargo'
$env:RUSTUP_HOME = Join-Path $toolchainRoot 'rustup'
$profileRoot = Join-Path $studyRoot 'local/followup'
New-Item -ItemType Directory -Force $profileRoot | Out-Null
$baseline = & git -C $repositoryRoot show 'c336b37e:investigation/rust-analysis/analysis.rs'
if ($LASTEXITCODE) { throw 'Original Rust analysis commit is unavailable' }
[IO.File]::WriteAllText((Join-Path $profileRoot 'before-analysis.rs'), ($baseline -join "`n") + "`n")
& (Join-Path $env:CARGO_HOME 'bin/rustc.exe') (Join-Path $profileRoot 'before-analysis.rs') --edition=2021 --crate-name analysis --crate-type cdylib --target wasm32-unknown-unknown -O -C panic=abort -o (Join-Path $profileRoot 'before-analysis.wasm')
if ($LASTEXITCODE) { throw 'Baseline Wasm compile failed' }
