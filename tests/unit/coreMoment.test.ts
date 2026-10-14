// Where an Unstable Core's moment falls against a drought or a badtide (core/sim/coreMoment.ts, D339): a core goes off
// `days` days into its cycle; a hazard starts after the cycle's temperate days (the cycles investigation's `MODES`).

import { describe, expect, it } from "vitest";
import { CORE } from "../../src/core/data/parity";
import type { Feature } from "../../src/core/features/schema";
import { coreCountdowns, coreMoment, coreMomentNow, coreMomentWords, coreNotes, TEMPERATE_DAYS } from "../../src/core/sim/coreMoment";
import { hazardDays } from "../../src/core/sim/weather";

describe("an Unstable Core's moment against the hazard of its cycle", () => {
  it("the generator's core (cycle 5, 10.5 days) goes off before every Normal and Easy hazard, 3 to 7 days before a Normal badtide", () => {
    const core = { cycles: CORE.cycles, days: CORE.days };
    for (const d of ["easy", "normal"] as const) for (const h of ["drought", "badtide"] as const) expect(coreMoment(core, d, h).when).toBe("before");
    const m = coreMoment(core, "normal", "badtide");
    expect(m).toMatchObject({ cycle: 5, days: 10.5, earliest: -5.5, latest: -1.5 });
    expect(coreMomentWords(m, "badtide")).toBe("Unstable core, cycle 5: goes off 3 to 7 days before the badtide");
    expect(coreMomentNow(m, 1)).toBe(false);
  });

  it("on Hard, where cycles open with 5 to 8 temperate days, it goes off during the hazard, on days 4 to 7", () => {
    const m = coreMoment({ cycles: 5, days: 10.5 }, "hard", "drought");
    expect(m.when).toBe("during");
    expect([m.earliest, m.latest]).toEqual([3.5, 6.5]);
    expect(coreMomentWords(m, "drought")).toBe("Unstable core, cycle 5: goes off on days 4 to 7 of the drought");
    expect([3, 4, 7, 8].map((d) => coreMomentNow(m, d))).toEqual([false, true, true, false]);
  });

  it("a core set far later goes off after the hazard has ended; the hazard's length is the difficulty's longest", () => {
    const length = hazardDays("normal", "badtide");
    const late = coreMoment({ cycles: 5, days: TEMPERATE_DAYS.normal[1] + length + 3 }, "normal", "badtide");
    expect(late.when).toBe("after");
    expect(coreMomentWords(late, "badtide")).toBe("Unstable core, cycle 5: goes off after the badtide has ended");
  });

  it("a countdown that starts with the hazard goes off on its first days, or as it starts", () => {
    const m = coreMoment({ cycles: 2, days: 14 }, "normal", "drought");
    expect(m.when).toBe("during");
    expect(coreMomentWords(m, "drought")).toBe("Unstable core, cycle 2: goes off before or on days 1 to 2 of the drought");
  });

  it("a map's cores are read from its features: the same moment is one note counting its cores, and a map with none has no note", () => {
    const core = (id: string, cycles: number): Feature =>
      ({ id, kind: "mapObject", origin: "generated", locked: false, params: { kind: "unstableCore", placement: { x: 5, y: 5, orientation: "Cw0" }, core: { radius: 3, cycles } } }) as unknown as Feature;
    const other = { id: "m", kind: "mapObject", origin: "generated", locked: false, params: { kind: "mineSite", placement: { x: 1, y: 1, orientation: "Cw0" } } } as unknown as Feature;
    const features = [core("a", 5), core("b", 5), core("c", 8), other];
    expect(coreCountdowns(features)).toEqual([{ cycles: 5, days: CORE.days }, { cycles: 5, days: CORE.days }, { cycles: 8, days: CORE.days }]);
    const notes = coreNotes(features, "normal", "badtide", 8);
    expect(notes.map((n) => n.text)).toEqual(["Unstable core, cycle 5: goes off 3 to 7 days before the badtide (2 cores)", "Unstable core, cycle 8: goes off 3 to 7 days before the badtide"]);
    expect(notes.every((n) => !n.now)).toBe(true);
    expect(coreNotes([other], "normal", "badtide", 8)).toEqual([]);
  });
});
