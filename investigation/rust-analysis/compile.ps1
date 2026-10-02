$ErrorActionPreference = 'Stop'
$studyRoot = $PSScriptRoot
$repositoryRoot = Split-Path (Split-Path $studyRoot)
$investigationRoot = (Resolve-Path (Join-Path $repositoryRoot '../../..')).Path
$toolchainRoot = Join-Path $investigationRoot 'rust-water/local/toolchain'
$env:CARGO_HOME = Join-Path $toolchainRoot 'cargo'
$env:RUSTUP_HOME = Join-Path $toolchainRoot 'rustup'
$rustCompiler = Join-Path $env:CARGO_HOME 'bin/rustc.exe'
$nativeLinker = (Join-Path $toolchainRoot 'llvm-mingw-20250910-msvcrt-x86_64/bin/x86_64-w64-mingw32-clang.exe').Replace('\','/')
New-Item -ItemType Directory -Force (Join-Path $studyRoot 'local') | Out-Null
$pinnedWater = & git -C $repositoryRoot show 'd18a6f4d890d3f2e3f7b480e308242375c100e10:investigation/rust-water/src/lib.rs'
[IO.File]::WriteAllText((Join-Path $studyRoot 'local/rust-water.rs'), ($pinnedWater -join "`n") + "`n")
$importNames = @('napi_get_cb_info','napi_get_buffer_info','napi_create_buffer_copy','napi_create_function','napi_set_named_property','napi_create_external','napi_get_value_external','napi_get_undefined')
[IO.File]::WriteAllText((Join-Path $studyRoot 'local/node.def'), "LIBRARY node.exe`nEXPORTS`n" + ($importNames -join "`n") + "`n")
& (Join-Path $toolchainRoot 'llvm-mingw-20250910-msvcrt-x86_64/bin/llvm-dlltool.exe') -m i386:x86-64 -d (Join-Path $studyRoot 'local/node.def') -l (Join-Path $studyRoot 'local/node.lib')
& $rustCompiler (Join-Path $studyRoot 'analysis.rs') --edition=2021 --crate-type cdylib --target wasm32-unknown-unknown -O -C panic=abort -o (Join-Path $studyRoot 'local/analysis.wasm')
if ($LASTEXITCODE) { throw 'Wasm compile failed' }
& $rustCompiler (Join-Path $studyRoot 'analysis.rs') --edition=2021 -O -C panic=abort -C target-feature=-fma -C link-self-contained=yes -C "linker=$nativeLinker" -o (Join-Path $studyRoot 'local/analysis.exe')
if ($LASTEXITCODE) { throw 'Native compile failed' }
& $rustCompiler (Join-Path $studyRoot 'analysis.rs') --edition=2021 --crate-type cdylib --cfg addon -O -C panic=abort -C target-feature=-fma -C link-self-contained=yes -C "linker=$nativeLinker" -C "link-arg=$(Join-Path $studyRoot 'local/node.lib')" -o (Join-Path $studyRoot 'local/analysis.node')
if ($LASTEXITCODE) { throw 'Node native addon compile failed' }
& (Join-Path $env:CARGO_HOME 'bin/rustfmt.exe') (Join-Path $studyRoot 'analysis.rs')
