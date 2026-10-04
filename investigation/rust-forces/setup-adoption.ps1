$ErrorActionPreference='Stop'
$env:DGM_RUN_DIR='adoption'
$ownRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$env:DGM_ROOT=$ownRoot
$env:DGM_DEPS=$ownRoot
$env:DGM_BROWSER_DEPS=$ownRoot
$env:DGM_PORTABLE_MATH=Join-Path $ownRoot 'rust/portable/src/lib.rs'
$env:DGM_RUST_GUARD=Join-Path $ownRoot 'tools/rust/guard.mjs'
# Reuse the installed compiler/linker binaries; all mutable caches/output belong to this clone.
$compilerRoot=if($env:DGM_COMPILER_ROOT){$env:DGM_COMPILER_ROOT}else{'C:/Users/Kyler/Documents/ChatGPT/dam-good-maps/investigation/rust-water/local/toolchain'}
$compilerBin=Join-Path $compilerRoot 'rustup/toolchains/1.90.0-x86_64-pc-windows-gnu/bin'
$env:CARGO_HOME=Join-Path $PSScriptRoot 'local/cargo'
$env:RUSTC=Join-Path $compilerBin 'rustc.exe'
$env:RUST_FORCES_RUSTC=$env:RUSTC
$env:RUST_FORCES_CARGO=Join-Path $compilerBin 'cargo.exe'
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=(Join-Path $compilerRoot 'llvm-mingw-20250910-msvcrt-x86_64/bin/x86_64-w64-mingw32-clang.exe').Replace('\','/')
$env:LIBRARY_PATH=Join-Path $compilerRoot 'rustup/toolchains/1.90.0-x86_64-pc-windows-gnu/lib/rustlib/x86_64-pc-windows-gnu/lib/self-contained'
$env:PATH=$compilerBin+';'+$env:PATH
$env:CARGO_TARGET_DIR=Join-Path $PSScriptRoot 'local/adoption/target'
$env:CARGO_BUILD_JOBS='4'
$env:DGM_CARGO_JOBS='4'
$env:PLAYWRIGHT_BROWSERS_PATH=Join-Path $PSScriptRoot 'local/adoption/browsers'
$env:DGM_SUITE_NATIVE='1'
$env:DGM_SUITE_CAPTURE='1'
$env:DGM_TEST_REPORT='existing-final.json'
$env:DGM_IDENTITY_ONLY='1'
$env:DGM_BENCH_FORCES=''
$env:DGM_TIMINGS=''

$env:DGM_CHROMIUM='C:/Users/Kyler/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe'
$env:DGM_FIREFOX='C:/Users/Kyler/AppData/Local/ms-playwright/firefox-1543/firefox/firefox.exe'
$env:DGM_WEBKIT='C:/Users/Kyler/AppData/Local/ms-playwright/webkit-2359/Playwright.exe'
$env:NODE_OPTIONS='--import '+([Uri](Join-Path $PSScriptRoot 'browser-runtime.mjs')).AbsoluteUri
$env:CI='1'

function Use-CoreTargets { Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue }
function Use-ForceTargets { $env:CARGO_TARGET_DIR=Join-Path $PSScriptRoot 'local/adoption/target' }
