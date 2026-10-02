param([switch]$PortableWindows)
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$toolchainRoot = Join-Path $taskRoot 'local/toolchain'
New-Item -ItemType Directory -Force $toolchainRoot | Out-Null
$env:CARGO_HOME = Join-Path $toolchainRoot 'cargo'
$env:RUSTUP_HOME = Join-Path $toolchainRoot 'rustup'
$rustupInit = Join-Path $toolchainRoot 'rustup-init.exe'
if (!(Test-Path -LiteralPath $rustupInit)) { Invoke-WebRequest 'https://win.rustup.rs/x86_64' -OutFile $rustupInit }
& $rustupInit -y --no-modify-path --profile minimal --default-host x86_64-pc-windows-gnu --default-toolchain 1.90.0
if ($LASTEXITCODE) { throw 'Rust setup failed' }
& "$env:CARGO_HOME/bin/rustup.exe" target add wasm32-unknown-unknown
if ($LASTEXITCODE) { throw 'Wasm target setup failed' }
if ($PortableWindows) {
  $linkerRoot = Join-Path $toolchainRoot 'llvm-mingw-20250910-msvcrt-x86_64'
  $archivePath = Join-Path $toolchainRoot 'llvm-mingw.zip'
  if (!(Test-Path -LiteralPath $linkerRoot)) {
    Invoke-WebRequest 'https://github.com/mstorsjo/llvm-mingw/releases/download/20250910/llvm-mingw-20250910-msvcrt-x86_64.zip' -OutFile $archivePath
    Expand-Archive -LiteralPath $archivePath -DestinationPath $toolchainRoot
  }
  $linkerExe = (Join-Path $linkerRoot 'bin/x86_64-w64-mingw32-clang.exe').Replace('\','/')
  $env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = $linkerExe
}
Write-Host "Use & '$env:CARGO_HOME/bin/cargo.exe' from this investigation directory. PATH is unchanged."
