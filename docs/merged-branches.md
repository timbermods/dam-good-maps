# Remote branches deleted on 2026-10-01

Each branch below was fully contained in `origin/dev` or `origin/main` (`git merge-base --is-ancestor`, checked again
just before deleting) and was neither the head nor the base of an open PR, so deleting it lost no work. The commit is
the branch's last one. To restore one: `git push origin <commit>:refs/heads/<branch>` (the commits stay reachable from
`dev` or `main`). #95 was retargeted to `dev` first, which freed `feature/forces`.

| Branch | Last commit |
| --- | --- |
| `audit/plan-integration` | `b6f2e21eb5` |
| `chore/ceiling-probe` | `a0be2aaaae` |
| `chore/docs-sweep` | `ca393c8c14` |
| `chore/housekeeping` | `570a4fafeb` |
| `chore/probe-sizes` | `3418e65134` |
| `chore/probe-tall` | `c33a9bff95` |
| `chore/repo-hygiene` | `2605af7c0c` |
| `claude/writing-style` | `782eb08b99` |
| `feature/badwater-source` | `5b1f3d6900` |
| `feature/brushes` | `b27fed73a9` |
| `feature/forces-sounds` | `05ab3afb0d` |
| `feature/glaciate` | `2c363f00a2` |
| `feature/live-editing` | `faf440f2b7` |
| `feature/m9a` | `ff0e6ea6a1` |
| `feature/real-places` | `26f2d01022` |
| `feature/resources` | `e4354bb05d` |
| `feature/save-to-timberborn` | `02187cb3ea` |
| `feature/select-shelf` | `f92fd5d79c` |
| `feature/select-shelf-2` | `0ea341b911` |
| `feature/sitting-a` | `41518b977e` |
| `feature/sitting-b` | `701d22f9fc` |
| `feature/start-edge-rules` | `8600cf35e2` |
| `fix/brush-f-readout` | `2db0ff68a2` |
| `fix/camera-glide-dev` | `5b4b061932` |
| `fix/determinism` | `bccaa30231` |
| `fix/edits-place-nothing` | `224a2a130c` |
| `fix/f-scroll-strength` | `9a5fcb81f5` |
| `fix/force-esc` | `c138887c27` |
| `fix/force-gaps` | `804d3c0c69` |
| `fix/forces-no-pop` | `736c9d8697` |
| `fix/glaciate-power` | `c2545a4f87` |
| `fix/naturalize-protection` | `e2f4aed0f2` |
| `fix/nightly-heavy` | `294f28098f` |
| `fix/recheck-editor` | `6e6c833fbc` |
| `fix/recheck-forces` | `a21ecffc27` |
| `fix/reopen-bytes` | `5e23c6d2e3` |
| `fix/settle-and-foam` | `2d8f671fb4` |
| `fix/sitting-3` | `49ad91ba81` |
| `fix/sitting-3-editor` | `5cd3a23eaf` |
| `fix/size-edits` | `4d318d6d1d` |
| `fix/water-status-race` | `20265af0d1` |
| `fix/waterflow-dropped-finals` | `7df5d87433` |
| `fix/waterflow-flake` | `b939f8dc39` |
| `fix/waterflow-frames` | `d6414cc995` |
| `investigation/3d-view-dev` | `ad869e8f41` |
| `investigation/audit` | `fcf6cbcc8e` |
| `investigation/block-tool` | `d2080210d6` |
| `investigation/carve` | `6b9d4e630b` |
| `investigation/claude` | `d08deade01` |
| `investigation/collab-architecture-2` | `e6e7c1fabb` |
| `investigation/collab-spike` | `5017e4f7dd` |
| `investigation/craterize` | `2f4963c3d5` |
| `investigation/cycles` | `1a8eba2fc3` |
| `investigation/cycles-exact` | `a9cdb860be` |
| `investigation/deposit-dev` | `391590200e` |
| `investigation/determinism-dev` | `4046e81f65` |
| `investigation/erode` | `47c02e670b` |
| `investigation/erupt` | `89c6842ac2` |
| `investigation/flow-arrows-dev` | `d8ba9b3a70` |
| `investigation/forces-core` | `cb4619d6e2` |
| `investigation/generative` | `a5f189d3e9` |
| `investigation/generative-v2` | `19f5bc467d` |
| `investigation/glaciate` | `f487591bc7` |
| `investigation/high-soul-dev` | `107550f74f` |
| `investigation/juice` | `a85c7c05fc` |
| `investigation/juice-2` | `fb34a5e493` |
| `investigation/landscapes` | `e47767e098` |
| `investigation/landslide-dev` | `0990b8030b` |
| `investigation/m9b-themes-dev` | `b8467e318f` |
| `investigation/maplook-finish` | `1a33d163e5` |
| `investigation/maplook2` | `e63a3ffdbc` |
| `investigation/maplook3` | `b8f912cbf3` |
| `investigation/meander-dev` | `fe8ddfd129` |
| `investigation/mechanics` | `bb394cc201` |
| `investigation/mechanics-verified` | `0e688f9165` |
| `investigation/names` | `989a7c79ec` |
| `investigation/pickplace` | `474724a128` |
| `investigation/pickplace-water2` | `3c0dd84017` |
| `investigation/quake` | `a293e419a0` |
| `investigation/rift-dev` | `85a63fc08a` |
| `investigation/simspeed` | `e5b37a3c1f` |
| `investigation/simspeed-cycles` | `33a68c0744` |
| `investigation/source-groups` | `1e760899e9` |
| `investigation/startup` | `112af1e969` |
| `investigation/techniques` | `1273e77da4` |
| `investigation/terrain3d` | `72d2aa2e88` |
| `investigation/vegetation` | `6617d52603` |
| `investigation/water-speed-dev` | `eef3011215` |
| `investigation/workshop` | `483fad40d8` |
| `look/badwater-blend` | `ef5ea1dfb2` |
| `look/clean` | `fae5a0b20e` |
| `look/contamination` | `e08d247341` |
| `look/mine-site` | `a7c9ceea07` |
| `look/waterfalls` | `84917c1367` |
| `m1-core` | `368557fc22` |
| `merge/dev-into-forces` | `832075dafb` |
| `release/deploy-rules` | `ff34c6ba2c` |
| `release/deploy-tags` | `fa6d0421e1` |
| `release/forces` | `99ac168a77` |
| `release/live-editing` | `985e1cf231` |
| `release/look-contamination` | `2c98d3c0df` |
| `release/look-waterfalls` | `ee8346682d` |
| `release/m6` | `de57860413` |
| `release/m7` | `8abefe7192` |
| `release/m8` | `8e006c28c4` |
| `release/m9a` | `c31a77e98d` |
| `release/map-look` | `70a251cc1a` |
| `release/real-places` | `03874a6533` |
| `feature/forces` | `e8a95dd637` |

# Investigation branches deleted on 2026-10-02 (D390)

Each branch below had no open PR, and every commit on it not reachable from `origin/dev` has an identical patch on
`dev` (`git cherry origin/dev <branch>` lists only `-` lines): its work reached `dev` by cherry-pick, so deleting it
lost no work. The commit is the branch's last one, in full; GitHub keeps unreferenced commits only for a while, so
restore from `dev`'s copies of the patches if the commit is gone (`git push origin <commit>:refs/heads/<branch>`).

| Branch | Last commit | Date | Last commit message |
| --- | --- | --- | --- |
| `investigation/3d-view` | `a65714fe4f724ad83fdd61a956fa1da0555ad623` | 2026-09-30 | Investigate 3D terrain views in High and Standard |
| `investigation/collab-architecture` | `6861c0414e41d8d155f225e194b7d5bc370537b9` | 2026-09-30 | Investigate collaborative patches, claims, footprints and checkpoints |
| `investigation/deposit` | `e06d4c2b8e4bbfb4832fcfc388b8320c2a6ba709` | 2026-09-30 | Make Deposit relief visible and adapt clicks to the terrain |
| `investigation/determinism` | `f306fd495c713e19278c507686102b2c603cdef8` | 2026-09-30 | Investigate cross-browser map determinism and propose portable fixes |
| `investigation/flow-arrows` | `5e3dc29ad1ef92853633cd91c8a08dd603e76729` | 2026-09-29 | Shape flow into sparse luminous lanes with surface foam and wakes |
| `investigation/high-soul` | `427150ddb920f0d33fa1fb3c210db9f492b951c8` | 2026-09-29 | Refine High contamination, stone relief, clouds and channel waves |
| `investigation/landslide` | `17978d26fe01e84e70b8b9b424c2be6fabdefc43` | 2026-09-29 | Add standalone Landslide force investigation |
| `investigation/meander` | `0ce6785f896d0f08a1a764583b04f1f3f6697a60` | 2026-09-30 | Add standalone Meander river-aging investigation |
| `investigation/rift` | `9cc478ec22d99fd80dc93bd18747b3e10a5324aa` | 2026-09-29 | Add standalone Rift fault-valley investigation |
