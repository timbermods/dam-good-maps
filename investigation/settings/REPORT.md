# Generator settings prototype

## Round 1

Held: 7/350 maps failed validation; 8/140 relief and 26/140 water comparisons did not increase; speed missed the targets.

## Round 2

**Direction fixed; still held.** Merged `feature/m9b` `e292cefe` first (product `13d1f1a2`). Product source is unchanged.

The floor/cap compressed Verticality; preset-relative Lakes competed with native water. Verticality now owns the post-floor span, anchors Any/Highlands contours and keeps a stable geological recipe. Lakes grows connected basins, protects prepared play space and retains signature water. Canyon/Delta reserve excavation depth; small Canyons retain native water. Theme shapers are unchanged.

**128², every theme, seeds 1–5, 0/25/50/75/100:** 350/350 validate and settle; 280/280 comparisons increase. Floors, caps and D348 hold; 33/35 at Verticality 100 reach 22. Means below include signature water.

| Theme | Relief, levels | Held water, tiles |
|---|---|---|
| any | 3.8/7.0/10.2/14.2/18.8 | 12/136/359/546/720 |
| riverValley | 3.6/7.0/10.4/14.2/17.6 | 6/129/271/385/500 |
| canyon | 5.6/8.8/11.4/14.0/17.2 | 143/261/544/834/1162 |
| highlands | 8.8/11.0/12.4/15.2/18.4 | 5/98/300/532/715 |
| lakeBasin | 6.2/8.8/11.4/13.8/16.8 | 1377/1475/1640/1809/1981 |
| delta | 7.0/10.0/12.8/16.0/19.0 | 0/144/450/751/972 |
| islands | 3.8/6.6/10.6/14.6/18.6 | 8494/8540/8608/8744/8876 |

Nightly gains: **+0.156 cliffs/+4.58 basins**, exceeding +0.03/+3; 40/40 valid. Base gains −0.017/+1.33 fail. Combined checks and four neighboring controls pass.

**Remaining gates:** 96²/128²/256² defaults validate on 209/210. Lakes/Islands 96² seed 4 retains the baseline’s mine-site/start failure; no new absolute failures. All three outcomes: Verticality **81/105**, Lakes **79/105**, baseline **84/105 each**. All-three counts regress in 14/42 theme/size groups; individual outcomes in 18/42. Verticality/Canyon 256² falls 4→1; Lakes/Lake Basin 256² falls 2→0.

Visibility remains uneven: River Valley seed 3 gains just **13 held tiles** on 50→75 (0.08% of the map), reaching 61 at 100. Positive direction does not prove conspicuous steps or fully filled basins.

| 128² final map, median/p90 seconds | Raw | CPU estimate |
|---|---|---|
| Verticality | 3.67/9.17 | 2.84/5.03 |
| Lakes | 4.72/9.59 | 2.94/5.50 |

Target **2/5 s is final map**, correcting Round 1’s label. The 256² high-setting sample passes 14/14: land raw 6.73/40.06 s, CPU 4.37/26.17; water raw 14.40/70.45 s, CPU 10.18/43.09 (targets 3/6 and 8/20). Shared-host estimates are diagnostic; speed misses.

Type-check, 1,010 guards, three patch checks, 28 hash repeats and the extra 96² Canyon range (25/25) pass. No game probe or lowered thresholds. Adoption remains held on the gates above.

Details: [measures](MEASURES.csv), [every step](STEP_GAINS.csv), [paired outcomes](OUTCOMES.csv). Checked sheets: [Verticality](verticality-contact.png), [3D](verticality-3d-contact.png), [Lakes](lakes-contact.png), each under 1 MB. Patches/regeneration: [INTEGRATION.md](INTEGRATION.md). Bulk results are gitignored in `local/`.
