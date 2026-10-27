# Smoothness: six-cell-check-185 (2026-10-03)

- before: 284f5d7e03d64814eae1d9673acd5dce3dbef550 284f5d7e03
- after: fe223ef635cd6cc331a050813a9d37cb6aaa6bb1 fe223ef635
- machine: AMD Ryzen 7 9800X3D 8-Core Processor, 16 threads, 62 GB, Windows 10.0.26200; GPUs: n/a
- window 1440x900, DPR 1, headed; map seed 4242, River Valley, normal difficulty
- Chrome, native: chromium 154.0.8037.95, WebGL "ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 SUPER (0x00002702) Direct3D11 vs_5_0 ps_5_0, D3D11)", 165 Hz, DPR 1
- **PC idle: NO (outside CPU min/median/max 0.8/3.0/11.1%; above 5% in 20 of 282 samples; busy: claude 6%, chrome 3%, SystemSettings 1%, Discord 1%, Spotify 1%, explorer 0%)**

Each metric is median [min-max] over the runs of that build. A cell fails only on a clear regression: the branch's median p99 more than 20% above dev's median, or its median hitch count above dev's highest run; the worst frame is shown, not judged (Kyler, 2026-10-03; tools/smooth/README.md).

| size | look | configuration | scenario | p99 ms before | p99 ms after | worst ms before | worst ms after | hitches before | hitches after | CPU outside / total % (min/med/max) | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 256 | standard | Chrome, native | orbit | 6.3 [6.3-6.3] | 6.3 [6.3-6.3] | 6.5 [6.4-6.5] | 6.4 [6.4-12.1] | 0 [0-0] | 0 [0-0] | 1/3/9 / 8/22/40 | pass |
| 256 | standard | Chrome, native | brush | 6.3 [6.3-12.1] | 6.3 [6.3-6.3] | 42.4 [42.3-54.7] | 42.5 [42.4-48.4] | 0 [0-1] | 0 [0-0] | 1/3/5 / 9/36/84 | pass |
| 256 | standard | Chrome, native | force | 6.3 [6.3-12.2] | 6.3 [6.3-6.3] | 42.4 [30.3-48.5] | 30.5 [30.3-48.6] | 0 [0-0] | 0 [0-0] | 1/2/6 / 6/25/59 | pass |
| 256 | high | Chrome, native | orbit | 6.2 [6.2-12.0] | 6.2 [6.2-6.3] | 18.2 [6.3-18.2] | 6.4 [6.4-24.4] | 0 [0-0] | 0 [0-0] | 1/4/8 / 14/40/67 | pass |
| 256 | high | Chrome, native | brush | 6.3 [6.3-6.3] | 6.3 [6.3-6.3] | 54.7 [48.5-60.8] | 42.5 [42.4-48.5] | 2 [0-3] | 0 [0-0] | 2/3/6 / 11/50/82 | pass |
| 256 | high | Chrome, native | force | 6.3 [6.2-6.3] | 6.2 [6.2-6.3] | 42.6 [36.4-60.7] | 54.5 [36.4-60.6] | 0 [0-1] | 1 [0-1] | 2/4/6 / 13/35/82 | pass |

6 cells: 6 pass, 0 SLOWER, 0 incomplete; 36 runs kept, 1 discarded, 1 round attempts voided and measured again
