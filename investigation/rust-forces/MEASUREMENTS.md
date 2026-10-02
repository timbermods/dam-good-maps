# Planning measurements

Machine: AMD Ryzen 7 9800X3D 8-Core Processor (16 logical CPUs). Three repetitions after one warm-up. Times are milliseconds, median / worst. Full Power; Auto Size for Craterize and Erupt, Lift for Quake.

Footprint rows measure the fixture objects, not all force footprints. Firefox timer quantization yields zero for some short TypeScript samples. Planning excludes Rust input decoding/output packing. Bridge includes those and copies, but excludes JS encode/decode. The native TypeScript column is Node on the same PC. CPU load covers the case and its bracketing observations. Null means no sampler observation; it does not mean an idle PC.

| Target | Force | Map | TypeScript | Rust plan | Wasm bridge | CPU mean / max % |
|---|---|---:|---:|---:|---:|---:|
| chromium | footprint | 128² | 0.20 / 0.30 | 0.50 / 0.60 | 5.20 / 8.50 | 74.03 / 74.46 |
| chromium | footprint | 256² | 0.50 / 0.60 | 2.50 / 2.80 | 23.70 / 41.70 | 66.84 / 69.42 |
| chromium | footprint | 512² | 1.30 / 1.30 | 9.70 / 11.30 | 93.70 / 275.10 | 71.38 / 80.86 |
| chromium | craterize | 128² | 7.60 / 9.60 | 13.00 / 13.00 | 16.30 / 19.90 | 54.05 / 55.41 |
| chromium | craterize | 256² | 29.10 / 34.60 | 71.30 / 77.10 | 104.90 / 123.40 | 49.26 / 53.86 |
| chromium | craterize | 512² | 160.30 / 192.50 | 437.70 / 484.00 | 696.90 / 1746.60 | 82.50 / 94.54 |
| chromium | erupt | 128² | 35.70 / 37.10 | 39.70 / 44.50 | 47.00 / 63.70 | 87.77 / 93.01 |
| chromium | erupt | 256² | 59.60 / 75.90 | 127.80 / 136.50 | 148.30 / 179.90 | 88.41 / 91.21 |
| chromium | erupt | 512² | 175.30 / 201.30 | 395.30 / 443.30 | 562.00 / 1631.60 | 81.50 / 89.36 |
| chromium | quake | 128² | 10.60 / 16.70 | 17.50 / 25.20 | 29.90 / 31.60 | 77.94 / 79.40 |
| chromium | quake | 256² | 70.80 / 76.30 | 102.80 / 142.20 | 157.20 / 230.00 | 83.60 / 94.01 |
| chromium | quake | 512² | 291.80 / 322.80 | 518.00 / 524.60 | 604.20 / 695.60 | 83.51 / 95.20 |
| firefox | footprint | 128² | 0.00 / 0.00 | 3.00 / 7.00 | 37.00 / 41.00 | 94.17 / 98.55 |
| firefox | footprint | 256² | 0.00 / 1.00 | 8.00 / 8.00 | 97.00 / 102.00 | 74.86 / 76.14 |
| firefox | footprint | 512² | 2.00 / 2.00 | 25.00 / 27.00 | 355.00 / 378.00 | 64.26 / 81.11 |
| firefox | craterize | 128² | 14.00 / 15.00 | 86.00 / 92.00 | 119.00 / 127.00 | 65.00 / 74.03 |
| firefox | craterize | 256² | 54.00 / 58.00 | 394.00 / 418.00 | 525.00 / 534.00 | 63.64 / 71.52 |
| firefox | craterize | 512² | 181.00 / 214.00 | 1520.00 / 1524.00 | 1945.00 / 2163.00 | 53.96 / 68.70 |
| firefox | erupt | 128² | 31.00 / 35.00 | 139.00 / 142.00 | 166.00 / 181.00 | 63.07 / 68.28 |
| firefox | erupt | 256² | 70.00 / 74.00 | 443.00 / 478.00 | 529.00 / 679.00 | 66.59 / 79.77 |
| firefox | erupt | 512² | 315.00 / 363.00 | 1923.00 / 1956.00 | 2220.00 / 2373.00 | 81.10 / 96.05 |
| firefox | quake | 128² | 12.00 / 18.00 | 81.00 / 90.00 | 104.00 / 106.00 | 59.96 / 63.34 |
| firefox | quake | 256² | 72.00 / 87.00 | 402.00 / 454.00 | 513.00 / 626.00 | 58.95 / 73.91 |
| firefox | quake | 512² | 632.00 / 636.00 | 3755.00 / 3984.00 | 4484.00 / 4537.00 | 93.34 / 100.00 |
| webkit | footprint | 128² | 0.00 / 1.00 | 0.00 / 0.00 | 5.00 / 65.00 | 77.64 / 84.45 |
| webkit | footprint | 256² | 1.00 / 1.00 | 3.00 / 3.00 | 35.00 / 342.00 | 68.48 / 75.16 |
| webkit | footprint | 512² | 2.00 / 2.00 | 13.00 / 15.00 | 160.00 / 6500.00 | 75.09 / 97.29 |
| webkit | craterize | 128² | 14.00 / 16.00 | 27.00 / 28.00 | 35.00 / 37.00 | 89.18 / 97.39 |
| webkit | craterize | 256² | 94.00 / 110.00 | 188.00 / 233.00 | 276.00 / 277.00 | 97.59 / 100.00 |
| webkit | craterize | 512² | 289.00 / 615.00 | 715.00 / 869.00 | 1559.00 / 56317.00 | 96.26 / 100.00 |
| webkit | erupt | 128² | 50.00 / 59.00 | 47.00 / 47.00 | 96.00 / 105.00 | 99.37 / 99.62 |
| webkit | erupt | 256² | 87.00 / 92.00 | 201.00 / 228.00 | 333.00 / 347.00 | 99.77 / 100.00 |
| webkit | erupt | 512² | 296.00 / 389.00 | 404.00 / 661.00 | 667.00 / 20974.00 | 87.81 / 100.00 |
| webkit | quake | 128² | 14.00 / 16.00 | 27.00 / 30.00 | 34.00 / 37.00 | 85.87 / 87.94 |
| webkit | quake | 256² | 73.00 / 81.00 | 113.00 / 127.00 | 146.00 / 154.00 | 70.87 / 79.75 |
| webkit | quake | 512² | 396.00 / 475.00 | 420.00 / 472.00 | 565.00 / 587.00 | 62.13 / 72.86 |
| native | footprint | 128² | 0.31 / 1.27 | 1.88 / 6.44 | — | 100.00 / 100.00 |
| native | footprint | 256² | 0.55 / 1.79 | 7.92 / 10.23 | — | 100.00 / 100.00 |
| native | footprint | 512² | 1.51 / 2.44 | 20.98 / 21.00 | — | 100.00 / 100.00 |
| native | craterize | 128² | 107.57 / 126.32 | 112.23 / 202.24 | — | 100.00 / 100.00 |
| native | craterize | 256² | 217.83 / 228.91 | 513.12 / 664.51 | — | 100.00 / 100.00 |
| native | craterize | 512² | 269.96 / 383.76 | 1376.09 / 2442.32 | — | 100.00 / 100.00 |
| native | erupt | 128² | 48.96 / 67.00 | 73.84 / 74.07 | — | 100.00 / 100.00 |
| native | erupt | 256² | 154.80 / 195.40 | 379.72 / 431.95 | — | 100.00 / 100.00 |
| native | erupt | 512² | 320.34 / 379.64 | 1596.77 / 1609.00 | — | 100.00 / 100.00 |
| native | quake | 128² | 31.90 / 50.35 | 60.99 / 65.21 | — | 100.00 / 100.00 |
| native | quake | 256² | 200.55 / 242.21 | 492.00 / 498.37 | — | 100.00 / 100.00 |
| native | quake | 512² | 832.43 / 928.94 | 1671.05 / 2153.71 | — | 100.00 / 100.00 |

Carve and Glaciate have no Rust planner or before/after measurements. These are partial investigation measurements and fail the complete-task gate. Raw samples, hashes, versions, and load are in evidence.json. Large regenerable results are ignored in local/.
