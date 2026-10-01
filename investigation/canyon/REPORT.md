## Shared findings for the M9b agent

- **D348 still fails.** All 60 baseline maps change terrain after `onLand`: 5,991 tiles, 46–342 per map; 5,978 lie within five tiles of badwater. `generate.ts` shapes badwater and levels starts after display. The prototype also changes all 60 (5,948 tiles). Fix this shared ordering.
- **Width-blind signature.** `analysis/signature.ts` scans 2–6 tiles from the centre, missing wider rivers' walls. At 256² seed 11, main cliff run is 1 versus 36 with a radius-12 diagnostic; seed 12 reads 31 versus 79. The wider scan is information only; genuine interruptions also occur.
- **Source removal/routing changes the story.** `dropRivers` removes the main after display on 96² 17/18, 128² 12/15 and 256² 14, leaving separate spring systems. At 128²/14 a declared tributary is only 39% wet, including 46 consecutive dry samples. Exact bypass routing needs shared tracing; the historical feature-rasterizer lake gap is not assumed for frozen generated terrain.
- **Speed misses D333.** Even M9b's CPU-share estimates for 256² land are 4.85/15.21 s before and 5.52/10.74 s after (median/p90), above 3/6 s. Failed starts, courses and exhausted screens dominate; baseline seed 14 takes 20.95 s with 15 failed attempts. Wall times below reflect a busy shared machine.

## Audit and prototype

Base: `da46492225cecc57530a7ffe21a5a30f0d89cc73`, latest `feature/m9b` fetched at start. Default Canyon, Normal, seeds 1–20, normal screening. “First map” is the first returned map, including repairs. Outcomes use M9b's readings; the sheets were checked by eye and remain for Kyler's judgment.

Each cell is **before → prototype**, out of 20. Times are median/p90 seconds to `onLand`.

| Size | All three | Promise | Standout | Readable water | Validator failures | Land time |
|---|---|---|---|---|---|---|
| 96² | 15 → 14 | 18 → 17 | 20 → 20 | 17 → 17 | 0 → 0 | 1.09/3.75 → 1.59/3.17 |
| 128² | 12 → 14 | 16 → 18 | 20 → 20 | 15 → 14 | 0 → 0 | 2.19/5.95 → 2.07/5.84 |
| 256² | 14 → 14 | 15 → 15 | 20 → 20 | 19 → 18 | 0 → 0 | 5.73/15.75 → 12.09/23.19 |

D333's per-size line drove the prototype: 128² was 60%. With no inflow, seeds 9/11/17 split their flow below the shared 1.2 incision gate, leaving Canyon's deep-incision draw unused. The candidate retains an inflow when Rivers permits one, preserving wall, terrace, side-valley and floor parameters. It improves 128²/9 and /11, but loses 96²/15's promise and introduces water misses on 128²/17 and 256²/18.

**Hold adoption.** The gain is small (41/60 → 42/60). Each size reaches 14/20, but D348 and speed fail. Fix the shared causes and rerun before deciding whether this candidate earns adoption. No shared fix or threshold relaxation is included.

Both batches pass all validator checks: minimum logs 243/251, berries 33/33, reachable mines 2/2, level land 224/224, farmland 123/123, wet bed 3/3. No in-game probe ran. Seed 128²/9 repeats with identical bytes; 1,680 genomes confirm other themes and Rivers: 0 unchanged.

[AUDIT.csv](AUDIT.csv) contains every map and a cause for every miss. Contact sheets: [before 96](before-96.png), [128](before-128.png), [256](before-256.png); [prototype 96](after-96.png), [128](after-128.png), [256](after-256.png). [INTEGRATION.md](INTEGRATION.md) contains the adoption boundary and regeneration commands. Product code was read only.
