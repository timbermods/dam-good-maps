// Specs for the share-link tests (tests/contract/share.test.ts in Node, tests/e2e/share.spec.ts in
// Chromium): every theme, with settings away from their presets.

import { makeSpec, type MapSpec } from "../src/core/spec/mapspec";

export function shareCases(): MapSpec[] {
  const a = makeSpec({ seed: 31, size: { x: 96, y: 96 } });
  a.settings.terrain.relief = 80;
  a.settings.water.waterfalls = "many";
  a.settings.water.lakes = "many";
  a.settings.resources.speciesMix = { pine: 10, birch: 60, oak: 30, succulent: 0 };
  const b = makeSpec({ seed: 4242, size: { x: 128, y: 128 }, theme: "canyon", designedFor: "easy" });
  b.settings.hazards.badwaterDistance = 45;
  const c = makeSpec({ seed: 77, size: { x: 96, y: 112 }, theme: "lakeBasin" });
  c.settings.water.rivers = 3;
  c.settings.start.area = "large";
  // Any, the default theme (D209), with Verticality away from its preset
  const d = makeSpec({ seed: 12, size: { x: 96, y: 96 }, theme: "any" });
  d.settings.terrain.verticality = 60;
  return [a, b, c, d];
}
