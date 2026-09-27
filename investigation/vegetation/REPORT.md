# Vegetation investigation

Prototype only, based on dev `f78d9a2`. Run `npm --prefix investigation/vegetation run demo`; the free localhost port is printed. First run installs this folder's locked dependencies. three.js is 0.186.0, the repository version.

## Decisions

- Keep production Standard unchanged until a real hardware comparison proves the new path is no slower. High is a proposal awaiting visual approval alongside phase 1.
- Species must read from above through shape as well as colour. Use radial pine tiers, narrow split birch crowns, broad lobed oak crowns, pale bare branches and low berry clusters.
- Keep palette and material response adjustable. Use the existing renderer's lighting for both sides; phase 1 is not an approved dependency.
- Preserve actual stored growth progress in a demo-only sidecar. The production view currently carries only a young flag; it cannot faithfully express continuous growth.
- Use original geometry only. No Timberborn installation, files, models or textures are read.
- Work in an isolated checkout because the initial dev checkout has unrelated investigations. All committed changes stay here. Living product documents remain unchanged because this is a proposal and the user restricted scope.

## Steps

1. Read CLAUDE.md, docs/PERFECT.md, EDITOR_PLAN.md, PLAN §20, Map look 2 and current plant/ghost/icon rendering. Isolated the runner and licences. Baseline findings: current plants are instanced; young trees use a fixed half-scale; Map look 2's override depth shader needs the same wind deformation as the visible model.
