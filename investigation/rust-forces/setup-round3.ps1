. "$PSScriptRoot/setup.ps1"
$env:DGM_RUN_DIR='round3-dev256'
$env:CARGO_TARGET_DIR=Join-Path $PSScriptRoot 'local/round3-dev256/target'
$env:CARGO_BUILD_JOBS='2'
$env:DGM_PORTABLE_MATH=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../portable-math/local/checkout/investigation/portable-math/portable.rs'))
$env:DGM_ROOT=Join-Path $PSScriptRoot 'local/round3-dev256/oracle'
$env:DGM_DEPS=$env:DGM_ROOT
$env:DGM_BROWSER_DEPS=$env:DGM_ROOT
$env:PLAYWRIGHT_BROWSERS_PATH=Join-Path $PSScriptRoot 'local/round3-dev256/browsers'
$env:DGM_FIREFOX=Join-Path $env:PLAYWRIGHT_BROWSERS_PATH 'firefox-1543/firefox/firefox.exe'
$env:DGM_SUITE_NATIVE='1'
$env:DGM_SUITE_CAPTURE='1'
$env:DGM_TEST_REPORT='existing-final.json'
$env:DGM_IDENTITY_ONLY='1'
$env:DGM_BENCH_FORCES=''
$env:DGM_CHROMIUM=Join-Path $env:PLAYWRIGHT_BROWSERS_PATH 'chromium-1208/chrome-win64/chrome.exe'
