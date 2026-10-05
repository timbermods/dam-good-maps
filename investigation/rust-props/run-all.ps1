$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    $env:UV_THREADPOOL_SIZE = '1'
    $taskCargo = (Get-Command cargo -ErrorAction SilentlyContinue).Source
    if (-not $taskCargo) { $taskCargo = Join-Path $env:USERPROFILE '.cargo/bin/cargo.exe' }
    New-Item -ItemType Directory -Force local | Out-Null
    & $taskCargo build --release -j 4 --target-dir target/forces
    if ($LASTEXITCODE) { throw 'Native force build failed' }
    & $taskCargo build --release -j 4 --target wasm32-unknown-unknown --lib --target-dir target/forces
    if ($LASTEXITCODE) { throw 'Wasm force build failed' }
    & $taskCargo test --release -j 4 --target-dir target/forces --test properties -- --test-threads=1
    if ($LASTEXITCODE) { throw 'Force safety/determinism property failed' }
    node --v8-pool-size=1 run.mjs > local/forces.log
    if ($LASTEXITCODE) { throw 'Force comparison runner failed' }
    & $taskCargo build --release -j 4 --no-default-features --features water --target-dir target/water
    if ($LASTEXITCODE) { throw 'Native water build failed' }
    & $taskCargo build --release -j 4 --no-default-features --features water --target wasm32-unknown-unknown --lib --target-dir target/water
    if ($LASTEXITCODE) { throw 'Wasm water build failed' }
    & $taskCargo test --release -j 4 --no-default-features --features water --target-dir target/water --test properties -- --test-threads=1
    if ($LASTEXITCODE) { throw 'Water safety/determinism property failed' }
    # Restart after known watchdogs so every remaining input still runs.
    foreach ($taskRange in @(@(0,79),@(79,80),@(80,87),@(87,88),@(88,95),@(95,96))) {
        $taskStart = $taskRange[0]; $taskEnd = $taskRange[1]
        $taskExtra = @()
        if ($taskEnd - $taskStart -eq 1) { $taskExtra = @('--once') }
        node --v8-pool-size=1 run.mjs --water "--start=$taskStart" "--end=$taskEnd" @taskExtra > "local/water-$taskStart-$taskEnd.log"
        if ($LASTEXITCODE) { throw "Water runner failed: $taskStart..$taskEnd" }
    }
    Write-Output 'Results are under local/. Known failing assertions are documented in README.md.'
} finally { Pop-Location }
