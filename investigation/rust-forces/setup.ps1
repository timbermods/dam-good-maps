$ErrorActionPreference = 'Stop'
$waterToolchain = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../rust-water/local/toolchain'))
if (!(Test-Path -LiteralPath "$waterToolchain/cargo/bin/cargo.exe")) { throw 'Run the pinned rust-water setup first, or supply an installed Rust 1.90.0 toolchain.' }
$env:CARGO_HOME = Join-Path $PSScriptRoot 'local/cargo'
$env:RUSTUP_HOME = Join-Path $waterToolchain 'rustup'
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = (Join-Path $waterToolchain 'llvm-mingw-20250910-msvcrt-x86_64/bin/x86_64-w64-mingw32-clang.exe').Replace('\','/')
$env:RUST_FORCES_CARGO = Join-Path $waterToolchain 'cargo/bin/cargo.exe'
$env:RUST_FORCES_RUSTC = Join-Path $waterToolchain 'cargo/bin/rustc.exe'
$env:LIBRARY_PATH = Join-Path $env:RUSTUP_HOME 'toolchains/1.90.0-x86_64-pc-windows-gnu/lib/rustlib/x86_64-pc-windows-gnu/lib/self-contained'
$env:PATH = (Join-Path $waterToolchain 'cargo/bin') + ';' + $env:PATH
