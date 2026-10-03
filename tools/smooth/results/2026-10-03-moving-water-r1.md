# Smoothness: moving-water-r1 (2026-10-03)

- before: b4b8af66 b4b8af6696
- after: a4686402 a4686402b1
- machine: AMD Ryzen 7 9800X3D 8-Core Processor, 16 threads, 62 GB, Windows 10.0.26200; GPUs: NVIDIA GeForce RTX 4080 SUPER, AMD Radeon(TM) Graphics
- window 1440x900, DPR 1, headed; map seed 4242, River Valley, normal difficulty
- Chrome, native: chromium 154.0.8037.92, WebGL "ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 SUPER (0x00002702) Direct3D11 vs_5_0 ps_5_0, D3D11)", 133 Hz, DPR 1
- Chrome, CPU 4x slower: chromium 154.0.8037.92, WebGL "ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 SUPER (0x00002702) Direct3D11 vs_5_0 ps_5_0, D3D11)", 131 Hz, DPR 1
- Chrome, integrated GPU, CPU 4x slower: chromium 154.0.8037.92, WebGL "ANGLE (AMD, AMD Radeon(TM) Graphics (0x000013C0) Direct3D11 vs_5_0 ps_5_0, D3D11)", 130 Hz, DPR 1
- Firefox: firefox 155.0, WebGL "ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar", 165 Hz, DPR 1
- WebKit: webkit 26.6, WebGL "Apple GPU", 83 Hz, DPR 1
- Firefox setup: prefs {"javascript.options.wasm_baselinejit":false,"javascript.options.wasm_optimizingjit":true,"javascript.options.wasm_lazy_tiering":false}; debugger unpinned from baseline: checked (Runtime.js allowUnobservedWasm and allowUnobservedAsmJS); omni.ja sha256 b98ceacd96e9, Runtime.js d450bf10b432
- **PC idle: NO (outside CPU min/median/max 0.1/1.2/26.7%; above 5% in 396 of 6836 samples; busy: node 12%, chrome-headless-shell 11%, ChatGPT 10%, chrome 10%, WebKitWebProcess 9%, firefox 7%)**

Each metric is median [min-max] over the runs of that build. A round passes when after's median p99, worst frame and hitch count are each no higher than before's highest run; a cell that fails runs again, up to twice more, and fails for real when two rounds fail (it passes after a failure only with two passing rounds and every run together passing; verdict.ts cellOutcome, tools/smooth/README.md).

| size | look | configuration | scenario | p99 ms before | p99 ms after | worst ms before | worst ms after | hitches before | hitches after | CPU outside / total % (min/med/max) | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 128 | standard | Chrome, native | orbit | 6.3 [6.3-6.4] | 6.3 [6.3-6.4] | 12.2 [6.4-36.5] | 12.3 [12.1-12.3] | 0 [0-0] | 0 [0-0] | 2/9/17 / 7/21/55 | pass |
| 128 | standard | Chrome, native | brush | 6.3 [6.3-6.6] | 6.3 [6.2-12.1] | 24.3 [24.2-30.4] | 24.3 [24.3-36.4] | 0 [0-0] | 0 [0-0] | 2/9/19 / 5/28/62 | pass (rounds: SLOWER, pass, pass) |
| 128 | standard | Chrome, native | force | 8.6 [6.3-8.7] | 8.6 [6.3-8.7] | 30.6 [23.1-31.2] | 30.0 [23.0-37.2] | 0 [0-0] | 0 [0-0] | 1/9/17 / 4/44/81 | pass |
| 128 | high | Chrome, native | orbit | 8.6 [8.5-8.6] | 8.6 [8.6-8.6] | 8.8 [8.7-8.9] | 8.9 [8.6-9.1] | 0 [0-0] | 0 [0-0] | 0/8/16 / 0/36/74 | **SLOWER** (rounds: SLOWER, SLOWER) |
| 128 | high | Chrome, native | brush | 15.5 [15.1-16.0] | 8.6 [8.6-8.8] | 30.2 [23.1-31.5] | 30.3 [23.2-32.1] | 0 [0-0] | 0 [0-0] | 0/1/8 / 2/24/68 | pass (rounds: SLOWER, pass, pass) |
| 128 | high | Chrome, native | force | 8.7 [8.6-8.8] | 8.6 [8.6-8.6] | 46.6 [45.2-53.3] | 30.2 [29.2-30.5] | 0 [0-1] | 0 [0-0] | 0/1/2 / 3/26/50 | pass |
| 256 | standard | Chrome, native | orbit | 8.5 [8.5-8.6] | 8.5 [8.5-8.6] | 8.8 [8.7-8.8] | 8.8 [8.7-8.9] | 0 [0-0] | 0 [0-0] | 0/1/3 / 1/20/50 | pass |
| 256 | standard | Chrome, native | brush | 15.0 [15.0-15.5] | 8.8 [8.7-8.9] | 91.6 [47.1-305.8] | 38.9 [37.6-39.8] | 2 [0-2] | 0 [0-0] | 0/1/3 / 4/39/74 | pass |
| 256 | standard | Chrome, native | force | 8.6 [8.6-8.6] | 8.6 [8.6-8.6] | 39.6 [38.0-44.8] | 30.3 [29.8-38.1] | 0 [0-0] | 0 [0-0] | 0/1/3 / 3/29/83 | pass |
| 256 | high | Chrome, native | orbit | 8.6 [8.5-8.6] | 8.6 [8.5-8.6] | 8.7 [8.7-8.8] | 8.7 [8.6-8.9] | 0 [0-0] | 0 [0-0] | 0/1/5 / 3/21/41 | pass |
| 256 | high | Chrome, native | brush | 22.2 [21.6-23.1] | 8.8 [8.7-15.0] | 101.4 [98.1-107.9] | 45.5 [39.2-54.1] | 14 [13-16] | 0 [0-1] | 0/2/5 / 5/42/82 | pass |
| 256 | high | Chrome, native | force | 8.7 [8.6-8.7] | 8.6 [8.6-8.6] | 61.1 [60.1-63.1] | 38.8 [37.4-46.3] | 1 [1-2] | 0 [0-0] | 1/2/3 / 5/31/74 | pass |
| 128 | standard | Chrome, CPU 4x slower | orbit | 8.6 [8.5-8.6] | 8.6 [8.5-8.6] | 8.7 [8.6-8.7] | 8.7 [8.6-9.0] | 0 [0-0] | 0 [0-0] | 1/2/4 / 5/53/79 | pass |
| 128 | standard | Chrome, CPU 4x slower | brush | 60.6 [46.7-62.0] | 46.0 [38.6-48.1] | 160.2 [137.9-183.3] | 147.0 [138.6-161.9] | 10 [9-11] | 8 [7-8] | 1/2/5 / 15/44/77 | pass |
| 128 | standard | Chrome, CPU 4x slower | force | 46.0 [38.6-46.5] | 37.7 [30.8-38.5] | 190.3 [149.2-193.9] | 161.3 [159.9-195.2] | 7 [6-7] | 6 [5-6] | 1/2/4 / 8/26/68 | pass |
| 128 | high | Chrome, CPU 4x slower | orbit | 8.5 [8.5-8.6] | 8.6 [8.5-8.6] | 8.7 [8.7-8.8] | 8.8 [8.7-8.9] | 0 [0-0] | 0 [0-0] | 1/2/8 / 8/36/88 | pass |
| 128 | high | Chrome, CPU 4x slower | brush | 85.4 [77.6-86.8] | 54.0 [46.6-77.7] | 175.9 [152.5-183.2] | 178.6 [160.8-191.1] | 26 [25-26] | 9 [8-10] | 1/2/3 / 3/47/82 | pass |
| 128 | high | Chrome, CPU 4x slower | force | 59.0 [46.0-61.6] | 53.1 [53.1-60.1] | 251.1 [249.9-292.9] | 200.4 [183.4-247.4] | 8 [7-9] | 8 [8-9] | 0/1/6 / 6/29/76 | pass |
| 256 | standard | Chrome, CPU 4x slower | orbit | 8.6 [8.5-8.6] | 8.6 [8.5-8.6] | 15.0 [8.7-15.6] | 15.1 [8.6-16.5] | 0 [0-0] | 0 [0-0] | 0/1/3 / 2/31/90 | **SLOWER** (p99) (rounds: SLOWER, pass, SLOWER) |
| 256 | standard | Chrome, CPU 4x slower | brush | 99.6 [92.7-99.9] | 53.6 [46.8-61.5] | 252.9 [244.0-353.8] | 238.2 [236.9-246.3] | 32 [31-33] | 26 [24-26] | 0/1/11 / 4/40/88 | pass |
| 256 | standard | Chrome, CPU 4x slower | force | 23.0 [16.5-24.1] | 23.7 [23.0-30.6] | 182.2 [159.3-205.2] | 176.3 [161.8-197.1] | 11 [9-11] | 7 [6-8] | 0/2/24 / 7/37/87 | pass (rounds: SLOWER, pass, pass) |
| 256 | high | Chrome, CPU 4x slower | orbit | 8.6 [8.6-8.6] | 8.6 [8.5-15.0] | 15.5 [8.9-15.9] | 16.1 [15.1-17.0] | 0 [0-0] | 0 [0-0] | 1/2/8 / 4/39/87 | **SLOWER** (p99, worst) (rounds: SLOWER, SLOWER) |
| 256 | high | Chrome, CPU 4x slower | brush | 169.9 [153.3-176.3] | 69.2 [61.8-76.2] | 527.9 [489.3-534.9] | 260.2 [255.6-263.0] | 34 [34-34] | 27 [26-27] | 1/2/4 / 8/42/87 | pass |
| 256 | high | Chrome, CPU 4x slower | force | 23.0 [16.1-24.0] | 23.8 [23.5-30.5] | 336.7 [314.6-355.9] | 210.3 [189.5-220.9] | 10 [9-10] | 8 [8-8] | 0/1/3 / 4/35/85 | **SLOWER** (rounds: SLOWER, pass, SLOWER) |
| 128 | standard | Chrome, integrated GPU, CPU 4x slower | orbit | 8.6 [8.5-8.6] | 15.8 [15.6-16.0] | 8.7 [8.6-8.8] | 22.5 [16.5-23.1] | 0 [0-0] | 0 [0-0] | 0/1/3 / 6/42/85 | **SLOWER** (p99, worst) (rounds: SLOWER, SLOWER) |
| 128 | standard | Chrome, integrated GPU, CPU 4x slower | brush | 61.6 [52.6-68.2] | 60.6 [38.1-69.0] | 142.6 [138.8-170.4] | 145.0 [139.1-181.6] | 10 [9-10] | 8 [7-9] | 0/1/3 / 9/45/80 | pass |
| 128 | standard | Chrome, integrated GPU, CPU 4x slower | force | 47.1 [44.3-61.5] | 39.2 [31.2-53.1] | 167.9 [150.8-200.5] | 190.2 [153.4-199.4] | 6 [5-8] | 6 [5-7] | 0/1/11 / 3/31/79 | pass (rounds: SLOWER, pass, pass) |
| 128 | high | Chrome, integrated GPU, CPU 4x slower | orbit | 31.1 [30.6-31.4] | 30.1 [23.7-31.1] | 32.6 [31.6-46.3] | 37.6 [30.6-39.1] | 0 [0-0] | 0 [0-0] | 1/2/4 / 2/32/87 | pass (rounds: SLOWER, pass, pass) |
| 128 | high | Chrome, integrated GPU, CPU 4x slower | brush | 105.5 [99.1-108.8] | 85.3 [58.8-99.7] | 168.6 [160.9-191.6] | 183.0 [153.7-199.6] | 27 [26-28] | 14 [10-20] | 0/2/4 / 5/46/82 | pass |
| 128 | high | Chrome, integrated GPU, CPU 4x slower | force | 90.8 [77.2-114.0] | 68.0 [60.8-76.9] | 292.8 [253.5-305.1] | 210.2 [199.0-216.7] | 8 [7-8] | 7 [6-11] | 1/2/15 / 5/44/82 | pass |
| 256 | standard | Chrome, integrated GPU, CPU 4x slower | orbit | 23.0 [23.0-23.6] | 23.1 [23.0-23.1] | 24.2 [23.7-24.5] | 24.0 [23.6-24.6] | 0 [0-0] | 0 [0-0] | 1/2/4 / 9/31/87 | pass |
| 256 | standard | Chrome, integrated GPU, CPU 4x slower | brush | 108.9 [105.7-128.4] | 83.6 [76.3-98.8] | 244.0 [238.1-261.8] | 244.7 [238.4-251.5] | 32 [32-33] | 27 [25-28] | 0/2/4 / 8/42/82 | pass |
| 256 | standard | Chrome, integrated GPU, CPU 4x slower | force | 30.3 [22.9-46.2] | 29.4 [24.1-32.1] | 186.5 [159.5-200.5] | 169.0 [163.1-189.6] | 11 [9-11] | 7 [7-8] | 0/1/5 / 5/42/88 | pass |
| 256 | high | Chrome, integrated GPU, CPU 4x slower | orbit | 23.8 [23.7-24.0] | 24.0 [23.8-24.1] | 24.7 [24.2-31.5] | 24.5 [24.1-24.6] | 0 [0-0] | 0 [0-0] | 0/1/3 / 6/37/85 | pass |
| 256 | high | Chrome, integrated GPU, CPU 4x slower | brush | 199.0 [182.6-236.8] | 116.5 [107.8-137.0] | 524.5 [478.9-531.8] | 246.6 [222.0-281.6] | 34 [34-34] | 35 [31-42] | 0/1/4 / 4/42/90 | **SLOWER** (hitches) (rounds: SLOWER, SLOWER) |
| 256 | high | Chrome, integrated GPU, CPU 4x slower | force | 30.5 [24.0-77.2] | 54.9 [46.2-61.4] | 339.7 [312.9-356.4] | 199.2 [192.0-220.6] | 10 [9-10] | 11 [8-15] | 0/1/4 / 5/33/87 | **SLOWER** (hitches) (rounds: SLOWER, pass, SLOWER) |
| 128 | standard | Firefox | orbit | 16.6 [16.5-16.6] | 16.5 [16.5-16.6] | 16.7 [16.6-16.8] | 16.7 [16.7-16.8] | 0 [0-0] | 0 [0-0] | 0/1/7 / 0/20/63 | pass |
| 128 | standard | Firefox | brush | 16.6 [16.6-30.4] | 16.6 [16.6-16.8] | 46.2 [32.1-79.5] | 32.6 [32.1-77.3] | 0 [0-1] | 0 [0-1] | 0/1/2 / 6/39/74 | pass |
| 128 | standard | Firefox | force | 16.6 [16.5-16.6] | 16.6 [16.6-16.6] | 31.6 [31.6-46.9] | 31.6 [31.5-32.2] | 0 [0-0] | 0 [0-0] | 0/1/4 / 2/22/87 | pass |
| 128 | high | Firefox | orbit | 16.5 [16.5-16.6] | 16.6 [16.6-16.6] | 16.8 [16.6-16.8] | 16.7 [16.6-16.8] | 0 [0-0] | 0 [0-0] | 0/1/3 / 1/16/54 | pass |
| 128 | high | Firefox | brush | 31.1 [16.6-31.6] | 30.7 [16.6-31.0] | 46.8 [31.3-63.3] | 47.1 [31.9-48.2] | 0 [0-1] | 0 [0-0] | 0/1/4 / 3/30/78 | pass |
| 128 | high | Firefox | force | 16.6 [16.6-31.2] | 16.6 [16.6-16.6] | 47.8 [46.8-62.7] | 46.8 [31.1-47.5] | 0 [0-1] | 0 [0-0] | 0/1/3 / 7/34/88 | pass |
| 256 | standard | Firefox | orbit | 16.6 [16.5-16.6] | 16.6 [16.6-16.6] | 16.7 [16.6-16.8] | 16.7 [16.6-16.9] | 0 [0-0] | 0 [0-0] | 0/1/3 / 2/21/53 | pass |
| 256 | standard | Firefox | brush | 16.9 [16.6-31.1] | 16.7 [16.6-31.8] | 65.0 [63.6-78.1] | 126.3 [110.4-204.1] | 8 [7-12] | 8 [6-9] | 0/1/6 / 3/36/90 | **SLOWER** (worst) (rounds: SLOWER, SLOWER) |
| 256 | standard | Firefox | force | 16.6 [16.6-16.6] | 16.6 [16.6-16.6] | 62.3 [48.1-63.2] | 62.6 [46.8-78.1] | 1 [0-1] | 1 [0-1] | 0/1/4 / 1/35/85 | pass |
| 256 | high | Firefox | orbit | 16.6 [16.5-16.6] | 16.6 [16.5-16.6] | 16.6 [16.6-16.8] | 16.7 [16.6-16.8] | 0 [0-0] | 0 [0-0] | 0/1/3 / 2/19/48 | pass |
| 256 | high | Firefox | brush | 30.8 [16.6-46.8] | 16.9 [16.6-30.7] | 94.9 [79.1-109.2] | 126.4 [110.5-339.7] | 16 [13-20] | 11 [9-14] | 0/1/5 / 2/37/88 | **SLOWER** (worst) (rounds: SLOWER, SLOWER) |
| 256 | high | Firefox | force | 6.1 [6.1-12.1] | 12.1 [12.1-12.1] | 72.8 [72.7-84.9] | 66.7 [60.6-64000.1] | 1 [1-2] | 1 [1-5] | 0/1/16 / 2/36/88 | **SLOWER** (p99) (rounds: SLOWER, SLOWER) |
| 128 | standard | WebKit | orbit | 17.0 [17.0-17.0] | 17.0 [17.0-19.0] | 22.0 [18.0-32.0] | 32.0 [17.0-47.0] | 0 [0-0] | 0 [0-0] | 0/1/3 / 7/26/76 | pass |
| 128 | standard | WebKit | brush | 94.0 [47.0-100.0] | 92.0 [88.0-100.0] | 109.0 [59.0-126.0] | 110.0 [93.0-111.0] | 11 [2-12] | 10 [5-17] | 0/1/4 / 9/33/73 | pass |
| 128 | standard | WebKit | force | 93.0 [91.0-94.0] | 92.0 [77.0-94.0] | 106.0 [96.0-125.0] | 108.0 [94.0-110.0] | 7 [6-11] | 7 [5-11] | 0/1/5 / 11/25/71 | pass |
| 128 | high | WebKit | orbit | 17.0 [17.0-30.0] | 17.0 [17.0-18.0] | 32.0 [18.0-61.0] | 19.0 [18.0-32.0] | 0 [0-1] | 0 [0-0] | 0/1/3 / 9/29/71 | pass |
| 128 | high | WebKit | brush | 93.0 [83.0-94.0] | 87.0 [62.0-90.0] | 106.0 [97.0-128.0] | 99.0 [92.0-127.0] | 8 [6-11] | 7 [6-10] | 0/1/3 / 10/33/71 | pass |
| 128 | high | WebKit | force | 78.0 [60.0-91.0] | 80.0 [50.0-96.0] | 95.0 [92.0-122.0] | 99.0 [93.0-107.0] | 6 [4-6] | 6 [3-8] | 0/1/2 / 6/28/67 | pass |
| 256 | standard | WebKit | orbit | 17.0 [17.0-19.0] | 18.0 [17.0-19.0] | 30.0 [19.0-32.0] | 32.0 [19.0-33.0] | 0 [0-0] | 0 [0-0] | 0/1/3 / 10/28/45 | pass |
| 256 | standard | WebKit | brush | 66.0 [63.0-77.0] | 73.0 [72.0-86.0] | 687.0 [108.0-1440.0] | 436.0 [203.0-575.0] | 25 [20-29] | 24 [16-31] | 0/1/4 / 8/36/88 | pass |
| 256 | standard | WebKit | force | 90.0 [61.0-92.0] | 49.0 [47.0-94.0] | 246.0 [130.0-482.0] | 154.0 [90.0-309.0] | 9 [7-12] | 5 [3-13] | 0/1/4 / 11/38/74 | pass |
| 256 | high | WebKit | orbit | 18.0 [17.0-20.0] | 19.0 [17.0-27.0] | 30.0 [17.0-32.0] | 31.0 [28.0-32.0] | 0 [0-0] | 0 [0-0] | 0/1/8 / 7/25/56 | pass (rounds: SLOWER, pass, pass) |
| 256 | high | WebKit | brush | 90.0 [87.0-94.0] | 86.0 [70.0-88.0] | 363.0 [142.0-748.0] | 153.0 [110.0-711.0] | 41 [34-44] | 33 [23-37] | 0/1/4 / 5/35/82 | pass |
| 256 | high | WebKit | force | 82.0 [77.0-94.0] | 78.0 [74.0-122.0] | 417.0 [328.0-423.0] | 328.0 [310.0-339.0] | 14 [11-18] | 13 [9-16] | 0/1/3 / 7/34/77 | pass |

60 cells: 50 pass, 10 SLOWER, 0 incomplete; 850 runs kept, 3 discarded
