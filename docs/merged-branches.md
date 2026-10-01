# Remote branches already merged (2026-10-01)

Every branch below is fully contained in `origin/dev` or `origin/main` (checked with `git merge-base --is-ancestor`), so
deleting it loses no work; tags and merge commits stay. Not listed: `feature/forces`, because PR
[#95](https://github.com/timbermods/dam-good-maps/pull/95) still targets it (retarget #95 to `dev` first, then delete it).
The branches with unmerged work (`feature/*`, `investigation/*` not listed here, `review/m9a-set`) are untouched.

To delete them all (this file's list, one command; delete this file afterwards):

```bash
git push origin --delete $(grep '^- ' docs/merged-branches.md | cut -c3- | tr '\n' ' ')
```

- audit/plan-integration
- chore/ceiling-probe
- chore/docs-sweep
- chore/housekeeping
- chore/probe-sizes
- chore/probe-tall
- chore/repo-hygiene
- claude/writing-style
- feature/badwater-source
- feature/brushes
- feature/forces-sounds
- feature/glaciate
- feature/live-editing
- feature/m9a
- feature/real-places
- feature/resources
- feature/save-to-timberborn
- feature/select-shelf
- feature/select-shelf-2
- feature/sitting-a
- feature/sitting-b
- feature/start-edge-rules
- fix/brush-f-readout
- fix/camera-glide-dev
- fix/determinism
- fix/edits-place-nothing
- fix/f-scroll-strength
- fix/force-esc
- fix/force-gaps
- fix/forces-no-pop
- fix/glaciate-power
- fix/naturalize-protection
- fix/nightly-heavy
- fix/recheck-editor
- fix/recheck-forces
- fix/reopen-bytes
- fix/settle-and-foam
- fix/sitting-3
- fix/sitting-3-editor
- fix/size-edits
- fix/water-status-race
- fix/waterflow-dropped-finals
- fix/waterflow-flake
- fix/waterflow-frames
- investigation/3d-view-dev
- investigation/audit
- investigation/block-tool
- investigation/carve
- investigation/claude
- investigation/collab-architecture-2
- investigation/collab-spike
- investigation/craterize
- investigation/cycles
- investigation/cycles-exact
- investigation/deposit-dev
- investigation/determinism-dev
- investigation/erode
- investigation/erupt
- investigation/flow-arrows-dev
- investigation/forces-core
- investigation/generative
- investigation/generative-v2
- investigation/glaciate
- investigation/high-soul-dev
- investigation/juice
- investigation/juice-2
- investigation/landscapes
- investigation/landslide-dev
- investigation/m9b-themes-dev
- investigation/maplook-finish
- investigation/maplook2
- investigation/maplook3
- investigation/meander-dev
- investigation/mechanics
- investigation/mechanics-verified
- investigation/names
- investigation/pickplace
- investigation/pickplace-water2
- investigation/quake
- investigation/rift-dev
- investigation/simspeed
- investigation/simspeed-cycles
- investigation/source-groups
- investigation/startup
- investigation/techniques
- investigation/terrain3d
- investigation/vegetation
- investigation/water-speed-dev
- investigation/workshop
- look/badwater-blend
- look/clean
- look/contamination
- look/mine-site
- look/waterfalls
- m1-core
- merge/dev-into-forces
- release/deploy-rules
- release/deploy-tags
- release/forces
- release/live-editing
- release/look-contamination
- release/look-waterfalls
- release/m6
- release/m7
- release/m8
- release/m9a
- release/map-look
- release/real-places
