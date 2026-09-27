// The starting-logs floor (PLAN §20 D224): the pinned computation in src/core/data/log-floor.json is
// consistent, for the game version the writer stamps, and never below 120. `npx tsx tools/log-floor.ts
// --check` compares it with the installed game's own blueprints (local only; CI has no game).
import { describe, expect, it } from "vitest";
import floor from "../../src/core/data/log-floor.json";
import { GAME_VERSION } from "../../src/core/format/world";

const sum = (items: { logs: number }[]) => items.reduce((s, i) => s + i.logs, 0);

describe("the starting-logs floor (D224)", () => {
  it("is computed for the game version the writer stamps", () => {
    expect(floor.gameVersion).toBe(GAME_VERSION);
  });

  it("is the worst faction's route to a Forester and first essentials, plus the margin, never below 120", () => {
    expect(floor.worst.total).toBe(sum(floor.worst.route.items) + sum(floor.worst.essentials));
    for (const f of Object.values(floor.byFaction)) expect(f.total).toBeLessThanOrEqual(floor.worst.total);
    expect(floor.computed).toBe(Math.ceil(floor.worst.total * (1 + floor.margin)));
    expect(floor.floor).toBe(Math.max(floor.minimum, floor.computed));
    expect(floor.minimum).toBe(120);
    expect(floor.floor).toBeGreaterThanOrEqual(120);
  });

  it("counts logs by species from the game's yields; saplings never count", () => {
    expect(floor.logsPerTree).toMatchObject({ Pine: 2, Birch: 1, Oak: 8 });
    for (const v of Object.values(floor.logsPerTree)) expect(v).toBeGreaterThan(0);
    for (const k of Object.keys(floor.logsPerTree)) expect(typeof (floor.deadTreesKeepLogs as Record<string, boolean>)[k]).toBe("boolean");
    expect(floor.saplingsCount).toBe(false);
  });
});
