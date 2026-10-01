// Adoption candidate: Canyon's own process strength, after leanGenome applied the settings.
// No courses, water simulation, candidate policy, resources or validation changed.
import type { Genome, Settings } from '../../src/core/land/genome';

export function shapeCanyon(g: Genome, settings: Settings): void {
  if (g.theme !== 'canyon') return;
  // Canyon promises a main river, as River Valley does. Its prior currently permits no inflow,
  // splitting the flow across springs too small to engage the inherited incision. Keep all the
  // seeded wall heights, floors, terraces and side valleys; retain an inflow when Rivers allows it.
  if (settings.water.rivers > 0) g.hydro.inflows = Math.max(1, g.hydro.inflows);
}
