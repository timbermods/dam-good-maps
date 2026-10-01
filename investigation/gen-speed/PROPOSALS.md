# Separate decisions for Kyler

Nothing here is in the adoption patch; these are unmeasured proposals.

- **Prepare fewer fallback starts.** M9b prepares four places, including their start and mine pads,
  before showing land. Preparing only two would remove planning work, but those extra pads are part
  of today's first land, affect water, and can be the eventual start. This needs a deliberate rule
  change, full re-pin and failure/outcome comparison.
- **Spend fewer draws on the planned-outcome screen.** Reducing `landScreen` or accepting the first
  structurally valid land would reduce shaping/rejection work. It changes the accepted genome and
  first land, and may reduce the theme's promise/readable-water rates. Keep absolute checks intact;
  compare per-theme outcomes and tail times before choosing a budget.
- **Change the starting water or stopping cap.** Starting from planned lake levels, or ending at a
  different equilibrium/tick, could save filling work on broad water. Current final water, soil,
  object placement and sometimes the accepted map would change. The earlier water investigations
  already identify this boundary; pursue it only as a separately versioned numerical decision.

Showing land before its current land-stage checks finish would also change the *first land shown*
when that land is rejected. An unchanged final download does not satisfy this investigation's
first-land identity requirement.
