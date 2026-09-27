# Map look 3 · phase 1

Run from the repository root with Node 22.12+:

```sh
npm --prefix investigation/maplook3 run demo
```

The first run installs this folder's locked dependencies. The server selects a free loopback
port and prints it. This is an isolated experiment from dev `7360e32`; nothing is integrated.

## Decisions

- Standard imports the current renderer unchanged. Only the local comparison forces Standard
  on software WebGL, as maplook2 did. This never changes the product's automatic Light mode.
- Keep maplook2's calibrated water and soft shadows as the High foundation. New switches
  independently control ambient occlusion, tone mapping, grade, haze, sky, strata, soil edges,
  colour variation, the three-tree sketch and wind.
- Use stable world-space ambient occlusion: terrain horizon samples and soft canopy footprints.
  This avoids a full extra geometry pass and screen-edge halos. It is an approximation, not SSAO.
- Preserve whole terrain levels and contamination's crack layer. Do not blur geometry or map data.
- The vegetation direction is three original specimen trees in a corner of the demo. Existing
  map trees stay unchanged until a later vegetation round.
- Existing untracked work is preserved in the original checkout. Work uses an isolated worktree.
- This task's folder-only rule takes precedence over the standing living-document updates.
  Adoption proposals live in INTEGRATION.md; the product's behaviour does not change.

## Steps

1. Read CLAUDE.md, docs/PERFECT.md, PLAN §20, EDITOR_PLAN.md, maplook2 and the current renderer.
   Created the isolated runner and dependency manifest. Three.js stays at 0.186.0.
