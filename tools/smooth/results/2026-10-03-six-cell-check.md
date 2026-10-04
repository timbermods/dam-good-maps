# Smoothness: six-cell-check (2026-10-03)

- before: 13028f762e500ec34eda35a75f117e25a12dd2e8 13028f762e
- after: 4c4458af39f6157b74f2c0ed7be698f2a192b316 4c4458af39
- machine: AMD Ryzen 7 9800X3D 8-Core Processor, 16 threads, 62 GB, Windows 10.0.26200; GPUs: n/a
- window 1440x900, DPR 1, headed; map seed 4242, River Valley, normal difficulty
- Chrome, native: chromium 154.0.8037.95, WebGL "ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 SUPER (0x00002702) Direct3D11 vs_5_0 ps_5_0, D3D11)", 165 Hz, DPR 1
- **PC idle: yes (outside CPU min/median/max 0.5/2.8/11.7%; above 5% in 4 of 281 samples; busy: claude 3%, ChatGPT 2%, Spotify 0%, iCUE 0%, SystemSettings 0%)**

Each metric is median [min-max] over the runs of that build. A cell fails only on a clear regression: the branch's median p99 more than 20% above dev's median, or its median hitch count above dev's highest run; the worst frame is shown, not judged (Kyler, 2026-10-03; tools/smooth/README.md).

| size | look | configuration | scenario | p99 ms before | p99 ms after | worst ms before | worst ms after | hitches before | hitches after | CPU outside / total % (min/med/max) | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 256 | standard | Chrome, native | orbit | 6.2 [6.2-6.2] | 6.3 [6.2-12.1] | 6.4 [6.4-6.5] | 6.4 [6.3-12.2] | 0 [0-0] | 0 [0-0] | 2/3/4 / 10/19/28 | pass |
| 256 | standard | Chrome, native | brush | 6.3 [6.3-6.3] | 6.3 [6.3-6.3] | 97.0 [91.1-121.3] | 42.4 [42.4-48.6] | 2 [1-2] | 0 [0-0] | 2/3/4 / 12/36/77 | pass |
| 256 | standard | Chrome, native | force | 6.3 [6.2-6.3] | 6.3 [6.3-6.3] | 36.4 [36.3-36.5] | 30.3 [30.3-36.3] | 0 [0-0] | 0 [0-0] | 2/3/4 / 13/26/58 | pass |
| 256 | high | Chrome, native | orbit | 6.2 [6.2-6.3] | 6.2 [6.2-6.2] | 12.2 [6.4-18.2] | 6.4 [6.3-18.2] | 0 [0-0] | 0 [0-0] | 2/3/7 / 7/26/67 | pass |
| 256 | high | Chrome, native | brush | 6.4 [6.3-6.4] | 6.3 [6.3-6.7] | 103.2 [103.1-103.2] | 48.6 [48.5-48.6] | 15 [14-15] | 0 [0-0] | 1/1/2 / 5/26/73 | pass |
| 256 | high | Chrome, native | force | 6.3 [6.3-6.3] | 6.3 [6.2-6.3] | 66.7 [66.6-66.8] | 42.5 [36.3-48.5] | 1 [1-1] | 0 [0-0] | 1/3/6 / 11/28/62 | pass |

6 cells: 6 pass, 0 SLOWER, 0 incomplete; 36 runs kept, 2 discarded, 2 round attempts voided and measured again
