# Repeated planning measurements

Milliseconds: **median / worst**, five repetitions after five warm-ups. Two full-Power modes per force; Auto Size for Craterize and Erupt. Footprints use 256 calls per browser sample to avoid Firefox clock quantization. All samples, CPU load and pinned source/binary hashes are in `measurement-evidence.json`; raw logs remain ignored.

Native boundary includes the retained operation and numeric record packaging. Browser boundary additionally configures the command and reacquires its complete typed-view result. Nested object/map reconstruction in typedResult is a cold fixture diagnostic and is not timed. Both exclude one-time arena creation/import, fixture reset and diagnostic serialization. Compute includes the before-map clone, planner, finalization, water and literal computation. TypeScript performs the corresponding complete computation without diagnostic step snapshots.

This PC is shared. The first three gate uses paired warmed medians: no regression at any size and strict improvement at 256²/512². Worst values remain visible; a passed timing cohort is not an adoption approval.

## native

| Force | Size | Mode | TypeScript | Rust compute | Rust + boundary | CPU mean / max % | Gate |
|---|---:|---|---:|---:|---:|---:|---|
| footprint | 128 | Lake objects | 0.14 / 0.35 | 0.03 / 0.06 | 0.03 / 0.06 | 70.17 / 82.17 | pass |
| footprint | 128 | Slide objects | 0.09 / 0.15 | 0.05 / 0.06 | 0.05 / 0.06 | 77.76 / 88.15 | pass |
| footprint | 256 | Lake objects | 0.26 / 0.35 | 0.17 / 0.18 | 0.18 / 0.20 | 74.16 / 74.81 | pass |
| footprint | 256 | Slide objects | 0.32 / 0.38 | 0.11 / 0.13 | 0.11 / 0.14 | 65.83 / 69.65 | pass |
| footprint | 512 | Lake objects | 1.24 / 1.77 | 0.54 / 0.66 | 0.57 / 0.69 | 71.13 / 80.27 | pass |
| footprint | 512 | Slide objects | 1.38 / 1.59 | 0.44 / 0.65 | 0.46 / 0.67 | 49.09 / 53.64 | pass |
| craterize | 128 | Strike | 9.49 / 11.68 | 3.36 / 3.59 | 3.37 / 3.61 | 44.18 / 45.99 | pass |
| craterize | 128 | Aim | 10.21 / 11.39 | 2.84 / 3.01 | 2.87 / 3.04 | 42.80 / 43.14 | pass |
| craterize | 256 | Strike | 42.62 / 44.34 | 12.85 / 12.97 | 12.99 / 13.13 | 47.66 / 49.98 | pass |
| craterize | 256 | Aim | 81.03 / 83.19 | 19.58 / 22.41 | 19.68 / 22.52 | 58.45 / 66.65 | pass |
| craterize | 512 | Strike | 168.25 / 176.47 | 55.34 / 59.19 | 55.88 / 59.72 | 61.51 / 65.27 | pass |
| craterize | 512 | Aim | 272.57 / 281.98 | 82.11 / 92.12 | 82.68 / 92.74 | 59.44 / 71.44 | pass |
| erupt | 128 | Vent | 23.23 / 29.76 | 8.85 / 9.08 | 8.91 / 9.15 | 77.29 / 83.56 | pass |
| erupt | 128 | Fissure | 19.87 / 19.97 | 7.52 / 7.67 | 7.57 / 7.71 | 75.61 / 84.00 | pass |
| erupt | 256 | Vent | 55.36 / 61.70 | 21.84 / 22.69 | 21.98 / 22.84 | 79.28 / 82.48 | pass |
| erupt | 256 | Fissure | 67.37 / 70.97 | 17.63 / 18.13 | 17.77 / 18.26 | 71.19 / 78.50 | pass |
| erupt | 512 | Vent | 161.40 / 168.20 | 47.71 / 48.58 | 48.37 / 49.20 | 70.47 / 84.74 | pass |
| erupt | 512 | Fissure | 272.26 / 275.90 | 80.05 / 81.17 | 80.73 / 81.81 | 55.71 / 67.76 | pass |
| quake | 128 | Lift | 13.24 / 13.53 | 1.94 / 2.46 | 1.99 / 2.50 | 58.06 / 58.11 | pass |
| quake | 128 | Slide | 18.40 / 19.93 | 3.16 / 4.83 | 3.22 / 4.88 | 59.04 / 60.95 | pass |
| quake | 256 | Lift | 58.04 / 65.67 | 10.28 / 10.70 | 10.44 / 10.84 | 49.94 / 53.83 | pass |
| quake | 256 | Slide | 71.82 / 83.16 | 16.20 / 17.53 | 16.36 / 17.71 | 53.21 / 56.19 | pass |
| quake | 512 | Lift | 411.00 / 450.61 | 73.36 / 91.68 | 73.95 / 92.59 | 73.34 / 86.81 | pass |
| quake | 512 | Slide | 422.68 / 433.29 | 81.46 / 85.05 | 82.11 / 85.62 | 54.01 / 62.97 | pass |
| carve | 128 | Unleash | 11.08 / 11.61 | 2.99 / 3.63 | 3.07 / 3.72 | 43.89 / 45.34 | pass |
| carve | 128 | Aim | 9.17 / 9.65 | 2.54 / 2.65 | 2.70 / 2.82 | 54.89 / 59.18 | pass |
| carve | 256 | Unleash | 36.32 / 37.14 | 9.99 / 10.70 | 10.31 / 10.98 | 59.98 / 60.00 | pass |
| carve | 256 | Aim | 41.73 / 43.67 | 7.20 / 7.78 | 7.38 / 7.97 | 61.42 / 62.10 | pass |
| carve | 512 | Unleash | 162.29 / 168.34 | 42.75 / 46.96 | 43.51 / 47.76 | 55.94 / 63.86 | pass |
| carve | 512 | Aim | 234.63 / 251.47 | 30.83 / 31.70 | 31.71 / 32.60 | 67.90 / 77.34 | pass |
| glaciate | 128 | Flow | 122.57 / 149.74 | 45.61 / 47.23 | 45.71 / 47.31 | 78.97 / 86.49 | pass |
| glaciate | 128 | Aim | 110.06 / 149.83 | 25.19 / 27.78 | 25.25 / 27.84 | 79.50 / 92.97 | pass |
| glaciate | 256 | Flow | 449.13 / 506.14 | 130.84 / 132.89 | 131.03 / 133.11 | 65.27 / 83.59 | pass |
| glaciate | 256 | Aim | 278.28 / 287.94 | 85.44 / 98.63 | 85.67 / 98.86 | 49.43 / 53.88 | pass |
| glaciate | 512 | Flow | 1662.46 / 1709.27 | 608.96 / 625.08 | 609.92 / 625.78 | 56.07 / 83.50 | pass |
| glaciate | 512 | Aim | 1805.70 / 1822.59 | 371.79 / 380.57 | 372.52 / 381.42 | 49.24 / 83.19 | pass |

## chromium

| Force | Size | Mode | TypeScript | Rust compute | Rust + boundary | CPU mean / max % | Gate |
|---|---:|---|---:|---:|---:|---:|---|
| footprint | 128 | Lake objects | 0.04 / 0.04 | 0.02 / 0.03 | 0.02 / 0.03 | 61.87 / 63.05 | pass |
| footprint | 128 | Slide objects | 0.05 / 0.08 | 0.03 / 0.03 | 0.03 / 0.03 | 43.51 / 45.37 | pass |
| footprint | 256 | Lake objects | 0.22 / 0.26 | 0.11 / 0.11 | 0.12 / 0.12 | 68.76 / 70.43 | pass |
| footprint | 256 | Slide objects | 0.24 / 0.38 | 0.12 / 0.12 | 0.13 / 0.13 | 56.89 / 61.21 | pass |
| footprint | 512 | Lake objects | 0.95 / 0.97 | 0.48 / 0.49 | 0.51 / 0.52 | 73.43 / 83.36 | pass |
| footprint | 512 | Slide objects | 1.04 / 1.08 | 0.53 / 0.60 | 0.57 / 0.65 | 61.60 / 73.92 | pass |
| craterize | 128 | Strike | 7.80 / 13.30 | 3.60 / 4.00 | 3.70 / 4.10 | 51.86 / 54.23 | pass |
| craterize | 128 | Aim | 9.70 / 15.60 | 3.50 / 3.50 | 3.60 / 3.60 | 39.52 / 48.54 | pass |
| craterize | 256 | Strike | 37.90 / 38.20 | 14.20 / 14.50 | 14.30 / 14.60 | 33.27 / 40.85 | pass |
| craterize | 256 | Aim | 62.70 / 74.00 | 22.30 / 23.30 | 22.50 / 23.40 | 35.20 / 39.80 | pass |
| craterize | 512 | Strike | 159.40 / 218.60 | 56.90 / 57.30 | 57.60 / 57.90 | 38.25 / 47.04 | pass |
| craterize | 512 | Aim | 260.40 / 334.60 | 84.70 / 86.20 | 85.40 / 86.60 | 47.10 / 63.24 | pass |
| erupt | 128 | Vent | 20.30 / 20.90 | 8.10 / 8.40 | 8.20 / 8.50 | 59.63 / 65.11 | pass |
| erupt | 128 | Fissure | 17.50 / 18.40 | 6.80 / 7.30 | 6.90 / 7.30 | 67.60 / 74.92 | pass |
| erupt | 256 | Vent | 49.60 / 53.50 | 19.10 / 21.40 | 19.20 / 21.50 | 60.33 / 65.21 | pass |
| erupt | 256 | Fissure | 69.60 / 73.70 | 21.10 / 21.80 | 21.30 / 22.00 | 38.65 / 45.42 | pass |
| erupt | 512 | Vent | 151.00 / 222.40 | 48.00 / 49.20 | 48.90 / 49.80 | 39.38 / 53.46 | pass |
| erupt | 512 | Fissure | 311.90 / 381.50 | 86.80 / 87.60 | 87.70 / 88.30 | 46.63 / 64.42 | pass |
| quake | 128 | Lift | 11.40 / 12.00 | 2.40 / 2.80 | 2.60 / 2.90 | 63.08 / 64.79 | pass |
| quake | 128 | Slide | 16.50 / 17.60 | 3.80 / 4.00 | 3.80 / 4.00 | 69.52 / 82.60 | pass |
| quake | 256 | Lift | 57.10 / 57.60 | 16.10 / 16.30 | 16.30 / 16.60 | 62.29 / 75.50 | pass |
| quake | 256 | Slide | 68.40 / 70.70 | 19.10 / 20.10 | 19.40 / 20.30 | 56.81 / 72.86 | pass |
| quake | 512 | Lift | 310.40 / 380.80 | 103.00 / 109.50 | 103.50 / 110.30 | 45.97 / 57.73 | pass |
| quake | 512 | Slide | 415.70 / 488.70 | 128.30 / 133.80 | 129.10 / 134.50 | 62.23 / 89.47 | pass |
| carve | 128 | Unleash | 11.20 / 15.80 | 3.70 / 4.00 | 3.80 / 4.10 | 83.63 / 88.56 | pass |
| carve | 128 | Aim | 11.60 / 14.10 | 3.20 / 4.00 | 3.30 / 4.20 | 78.92 / 87.83 | pass |
| carve | 256 | Unleash | 33.60 / 36.90 | 15.00 / 15.80 | 15.30 / 16.10 | 67.62 / 78.06 | pass |
| carve | 256 | Aim | 35.10 / 37.90 | 9.50 / 9.90 | 9.70 / 10.20 | 43.83 / 55.03 | pass |
| carve | 512 | Unleash | 136.10 / 146.80 | 59.10 / 66.60 | 59.70 / 67.60 | 50.24 / 71.52 | pass |
| carve | 512 | Aim | 204.40 / 226.60 | 58.60 / 59.50 | 59.80 / 60.50 | 66.01 / 84.91 | pass |
| glaciate | 128 | Flow | 135.90 / 154.30 | 51.70 / 53.90 | 51.80 / 54.00 | 69.79 / 82.82 | pass |
| glaciate | 128 | Aim | 102.80 / 132.30 | 35.00 / 35.90 | 35.00 / 35.90 | 47.79 / 53.58 | pass |
| glaciate | 256 | Flow | 541.10 / 550.50 | 182.20 / 186.20 | 182.20 / 186.50 | 48.43 / 58.65 | pass |
| glaciate | 256 | Aim | 351.20 / 360.20 | 101.40 / 105.60 | 101.60 / 105.90 | 40.90 / 51.06 | pass |
| glaciate | 512 | Flow | 1932.60 / 1976.50 | 699.00 / 781.60 | 700.00 / 782.20 | 51.73 / 73.75 | pass |
| glaciate | 512 | Aim | 1762.40 / 1774.20 | 360.60 / 377.70 | 361.50 / 378.50 | 52.04 / 67.42 | pass |

## firefox

| Force | Size | Mode | TypeScript | Rust compute | Rust + boundary | CPU mean / max % | Gate |
|---|---:|---|---:|---:|---:|---:|---|
| footprint | 128 | Lake objects | 0.04 / 0.05 | 0.02 / 0.03 | 0.02 / 0.03 | 50.84 / 62.13 | pass |
| footprint | 128 | Slide objects | 0.04 / 0.06 | 0.02 / 0.02 | 0.02 / 0.02 | 34.33 / 34.66 | pass |
| footprint | 256 | Lake objects | 0.17 / 0.20 | 0.07 / 0.07 | 0.07 / 0.07 | 41.78 / 44.65 | pass |
| footprint | 256 | Slide objects | 0.18 / 0.20 | 0.07 / 0.08 | 0.07 / 0.08 | 36.11 / 36.72 | pass |
| footprint | 512 | Lake objects | 0.64 / 0.79 | 0.29 / 0.29 | 0.31 / 0.31 | 41.96 / 44.87 | pass |
| footprint | 512 | Slide objects | 0.91 / 1.19 | 0.42 / 0.51 | 0.48 / 0.55 | 56.55 / 70.94 | pass |
| craterize | 128 | Strike | 10.00 / 12.00 | 3.00 / 4.00 | 4.00 / 4.00 | 52.46 / 55.77 | pass |
| craterize | 128 | Aim | 10.00 / 11.00 | 3.00 / 4.00 | 3.00 / 4.00 | 55.37 / 57.62 | pass |
| craterize | 256 | Strike | 39.00 / 43.00 | 12.00 / 13.00 | 12.00 / 13.00 | 49.23 / 49.63 | pass |
| craterize | 256 | Aim | 69.00 / 96.00 | 20.00 / 20.00 | 20.00 / 21.00 | 51.35 / 63.05 | pass |
| craterize | 512 | Strike | 180.00 / 186.00 | 48.00 / 49.00 | 49.00 / 50.00 | 53.62 / 63.62 | pass |
| craterize | 512 | Aim | 296.00 / 302.00 | 71.00 / 78.00 | 72.00 / 78.00 | 55.04 / 64.21 | pass |
| erupt | 128 | Vent | 24.00 / 26.00 | 8.00 / 9.00 | 8.00 / 9.00 | 52.63 / 53.80 | pass |
| erupt | 128 | Fissure | 24.00 / 29.00 | 6.00 / 6.00 | 6.00 / 6.00 | 42.76 / 47.67 | pass |
| erupt | 256 | Vent | 55.00 / 63.00 | 15.00 / 17.00 | 15.00 / 17.00 | 38.72 / 49.30 | pass |
| erupt | 256 | Fissure | 104.00 / 107.00 | 17.00 / 17.00 | 17.00 / 17.00 | 39.75 / 42.53 | pass |
| erupt | 512 | Vent | 167.00 / 182.00 | 37.00 / 39.00 | 37.00 / 40.00 | 40.56 / 49.43 | pass |
| erupt | 512 | Fissure | 545.00 / 639.00 | 77.00 / 92.00 | 78.00 / 93.00 | 55.87 / 74.96 | pass |
| quake | 128 | Lift | 14.00 / 16.00 | 3.00 / 4.00 | 3.00 / 4.00 | 57.46 / 63.73 | pass |
| quake | 128 | Slide | 16.00 / 17.00 | 2.00 / 3.00 | 2.00 / 3.00 | 52.57 / 55.96 | pass |
| quake | 256 | Lift | 67.00 / 76.00 | 11.00 / 12.00 | 11.00 / 12.00 | 52.22 / 59.08 | pass |
| quake | 256 | Slide | 81.00 / 111.00 | 14.00 / 14.00 | 14.00 / 15.00 | 53.08 / 56.69 | pass |
| quake | 512 | Lift | 442.00 / 499.00 | 76.00 / 87.00 | 78.00 / 87.00 | 58.34 / 71.03 | pass |
| quake | 512 | Slide | 499.00 / 546.00 | 88.00 / 104.00 | 88.00 / 104.00 | 52.92 / 62.95 | pass |
| carve | 128 | Unleash | 12.00 / 12.00 | 2.00 / 3.00 | 2.00 / 4.00 | 49.11 / 50.14 | pass |
| carve | 128 | Aim | 10.00 / 15.00 | 3.00 / 3.00 | 3.00 / 3.00 | 47.79 / 52.12 | pass |
| carve | 256 | Unleash | 39.00 / 41.00 | 10.00 / 13.00 | 11.00 / 13.00 | 55.97 / 60.61 | pass |
| carve | 256 | Aim | 68.00 / 77.00 | 9.00 / 10.00 | 10.00 / 10.00 | 61.94 / 70.03 | pass |
| carve | 512 | Unleash | 159.00 / 167.00 | 49.00 / 52.00 | 50.00 / 52.00 | 51.42 / 54.57 | pass |
| carve | 512 | Aim | 203.00 / 219.00 | 42.00 / 45.00 | 42.00 / 47.00 | 58.16 / 69.31 | pass |
| glaciate | 128 | Flow | 144.00 / 151.00 | 37.00 / 42.00 | 37.00 / 42.00 | 53.58 / 60.49 | pass |
| glaciate | 128 | Aim | 106.00 / 134.00 | 27.00 / 42.00 | 28.00 / 42.00 | 49.66 / 53.31 | pass |
| glaciate | 256 | Flow | 537.00 / 563.00 | 130.00 / 163.00 | 132.00 / 163.00 | 50.42 / 68.07 | pass |
| glaciate | 256 | Aim | 329.00 / 371.00 | 78.00 / 83.00 | 78.00 / 84.00 | 43.74 / 55.24 | pass |
| glaciate | 512 | Flow | 2076.00 / 2188.00 | 516.00 / 580.00 | 517.00 / 580.00 | 47.09 / 71.59 | pass |
| glaciate | 512 | Aim | 1162.00 / 1245.00 | 291.00 / 305.00 | 291.00 / 305.00 | 55.43 / 67.76 | pass |

## webkit

| Force | Size | Mode | TypeScript | Rust compute | Rust + boundary | CPU mean / max % | Gate |
|---|---:|---|---:|---:|---:|---:|---|
| footprint | 128 | Lake objects | 0.04 / 0.05 | 0.02 / 0.03 | 0.03 / 0.03 | 43.42 / 46.40 | pass |
| footprint | 128 | Slide objects | 0.04 / 0.04 | 0.03 / 0.04 | 0.04 / 0.04 | 39.53 / 45.06 | pass |
| footprint | 256 | Lake objects | 0.21 / 0.34 | 0.14 / 0.15 | 0.15 / 0.16 | 40.66 / 46.48 | pass |
| footprint | 256 | Slide objects | 0.24 / 0.30 | 0.15 / 0.17 | 0.16 / 0.18 | 35.74 / 37.01 | pass |
| footprint | 512 | Lake objects | 0.72 / 1.16 | 0.59 / 0.62 | 0.63 / 0.68 | 58.90 / 76.84 | pass |
| footprint | 512 | Slide objects | 0.88 / 1.30 | 0.65 / 0.69 | 0.71 / 0.73 | 49.48 / 67.88 | pass |
| craterize | 128 | Strike | 8.00 / 9.00 | 4.00 / 4.00 | 4.00 / 4.00 | 60.25 / 61.45 | pass |
| craterize | 128 | Aim | 18.00 / 19.00 | 3.00 / 4.00 | 4.00 / 4.00 | 62.50 / 71.29 | pass |
| craterize | 256 | Strike | 39.00 / 41.00 | 14.00 / 15.00 | 14.00 / 15.00 | 58.86 / 68.34 | pass |
| craterize | 256 | Aim | 118.00 / 137.00 | 24.00 / 25.00 | 24.00 / 25.00 | 48.94 / 51.04 | pass |
| craterize | 512 | Strike | 167.00 / 176.00 | 59.00 / 61.00 | 60.00 / 62.00 | 51.01 / 67.31 | pass |
| craterize | 512 | Aim | 549.00 / 626.00 | 106.00 / 110.00 | 107.00 / 112.00 | 58.26 / 78.61 | pass |
| erupt | 128 | Vent | 26.00 / 27.00 | 9.00 / 9.00 | 9.00 / 9.00 | 45.86 / 56.73 | pass |
| erupt | 128 | Fissure | 40.00 / 41.00 | 8.00 / 8.00 | 8.00 / 8.00 | 37.31 / 40.72 | pass |
| erupt | 256 | Vent | 65.00 / 65.00 | 21.00 / 21.00 | 21.00 / 21.00 | 46.25 / 49.02 | pass |
| erupt | 256 | Fissure | 134.00 / 145.00 | 23.00 / 24.00 | 23.00 / 24.00 | 48.97 / 56.60 | pass |
| erupt | 512 | Vent | 196.00 / 209.00 | 55.00 / 56.00 | 56.00 / 57.00 | 57.27 / 64.15 | pass |
| erupt | 512 | Fissure | 383.00 / 441.00 | 102.00 / 105.00 | 103.00 / 106.00 | 55.19 / 68.79 | pass |
| quake | 128 | Lift | 13.00 / 14.00 | 3.00 / 4.00 | 3.00 / 4.00 | 43.89 / 50.92 | pass |
| quake | 128 | Slide | 24.00 / 34.00 | 5.00 / 5.00 | 5.00 / 5.00 | 43.97 / 53.54 | pass |
| quake | 256 | Lift | 61.00 / 64.00 | 13.00 / 16.00 | 13.00 / 16.00 | 46.29 / 48.38 | pass |
| quake | 256 | Slide | 78.00 / 81.00 | 25.00 / 26.00 | 26.00 / 26.00 | 39.43 / 46.42 | pass |
| quake | 512 | Lift | 341.00 / 433.00 | 122.00 / 138.00 | 122.00 / 139.00 | 66.20 / 79.39 | pass |
| quake | 512 | Slide | 413.00 / 442.00 | 145.00 / 157.00 | 146.00 / 158.00 | 58.24 / 71.85 | pass |
| carve | 128 | Unleash | 20.00 / 24.00 | 4.00 / 5.00 | 4.00 / 5.00 | 49.52 / 52.66 | pass |
| carve | 128 | Aim | 15.00 / 27.00 | 4.00 / 4.00 | 4.00 / 4.00 | 68.30 / 72.92 | pass |
| carve | 256 | Unleash | 76.00 / 88.00 | 16.00 / 18.00 | 16.00 / 18.00 | 59.96 / 70.67 | pass |
| carve | 256 | Aim | 81.00 / 88.00 | 12.00 / 13.00 | 12.00 / 14.00 | 51.48 / 53.56 | pass |
| carve | 512 | Unleash | 390.00 / 400.00 | 93.00 / 93.00 | 94.00 / 94.00 | 61.14 / 80.22 | pass |
| carve | 512 | Aim | 298.00 / 310.00 | 66.00 / 70.00 | 67.00 / 71.00 | 56.67 / 68.30 | pass |
| glaciate | 128 | Flow | 254.00 / 268.00 | 65.00 / 66.00 | 65.00 / 66.00 | 65.17 / 84.89 | pass |
| glaciate | 128 | Aim | 183.00 / 190.00 | 41.00 / 43.00 | 41.00 / 43.00 | 38.51 / 43.49 | pass |
| glaciate | 256 | Flow | 761.00 / 848.00 | 238.00 / 253.00 | 238.00 / 253.00 | 51.36 / 73.43 | pass |
| glaciate | 256 | Aim | 663.00 / 699.00 | 130.00 / 131.00 | 130.00 / 132.00 | 42.01 / 50.25 | pass |
| glaciate | 512 | Flow | 2478.00 / 2540.00 | 857.00 / 907.00 | 858.00 / 908.00 | 51.27 / 92.12 | pass |
| glaciate | 512 | Aim | 1639.00 / 1779.00 | 412.00 / 452.00 | 413.00 / 454.00 | 41.93 / 64.94 | pass |
