// Where an Unstable Core's moment falls against a drought or a badtide (core/sim/coreMoment.ts, D339): a core goes off
// `days` days into its cycle; a hazard starts after the cycle's temperate days (the cycles investigation's `MODES`), so
// it goes off `days - temperate` days into the hazard, and hazard day N is the Nth day of it.

import { describe, expect, it } from "vitest";
import { CORE } from "../../src/core/data/parity";
import type { Feature } from "../../src/core/features/schema";
import { coreCountdowns, coreMoment, coreMomentNow, coreMomentWords, coreNotes, TEMPERATE_DAYS } from "../../src/core/sim/coreMoment";
import { hazardDays } from "../../src/core/sim/weather";

describe("an Unstable Core's moment against the hazard of its cycle", () => {
  it("at the game's 10.5 days it goes off before every Easy and Normal hazard: 2 to 7 days before on Normal, 5 to 9 on Easy", () => {
    const core = { cycles: 6, days: CORE.days };
    expect(CORE.days).toBe(10.5);
    for (const d of ["easy", "normal"] as const) for (const h of ["drought", "badtide"] as const) expect(coreMoment(core, d, h).when).toBe("before");
    const normal = coreMoment(core, "normal", "badtide");
    expect(normal).toMatchObject({ cycle: 6, days: 10.5, earliest: -6.5, latest: -2.5 });
    expect(coreMomentWords(normal, "badtide")).toBe("Unstable core: goes off 2 to 7 days before cycle 6's drought or badtide");
    expect(coreMomentNow(normal, 1)).toBe(false);
    const easy = coreMoment(core, "easy", "drought");
    expect([easy.earliest, easy.latest]).toEqual([-8.5, -5.5]);
    expect(coreMomentWords(easy, "drought")).toBe("Unstable core: goes off 5 to 9 days before cycle 6's drought or badtide");
  });

  it("on Hard, where cycles open with 5 to 8 temperate days, it goes off 2.5 to 5.5 days in: days 3 to 6 of the hazard", () => {
    const m = coreMoment({ cycles: 6, days: 10.5 }, "hard", "drought");
    expect(m.when).toBe("during");
    expect([m.earliest, m.latest]).toEqual([2.5, 5.5]);
    expect(coreMomentWords(m, "drought")).toBe("Unstable core: goes off on days 3 to 6 of cycle 6's drought or badtide");
    expect([2, 3, 6, 7].map((d) => coreMomentNow(m, d))).toEqual([false, true, true, false]);
  });

  it("a core that goes off on the hazard's last day is during it; one a day later is after it", () => {
    const length = hazardDays("hard", "drought");
    const [, longest] = TEMPERATE_DAYS.hard;
    // earliest = length - 0.5: inside the hazard's last day
    const last = coreMoment({ cycles: 6, days: longest + length - 0.5 }, "hard", "drought");
    expect(last.when).toBe("during");
    expect(coreMomentNow(last, length)).toBe(true);
    // earliest = length: the hazard has just ended
    const after = coreMoment({ cycles: 6, days: longest + length }, "hard", "drought");
    expect(after.when).toBe("after");
    expect(coreMomentWords(after, "drought")).toBe("Unstable core: goes off after cycle 6's drought has ended");
    expect(coreMomentNow(after, length)).toBe(false);
  });

  it("a core set far later goes off after the hazard has ended; the hazard's length is the difficulty's longest", () => {
    const length = hazardDays("normal", "badtide");
    const late = coreMoment({ cycles: 6, days: TEMPERATE_DAYS.normal[1] + length + 3 }, "normal", "badtide");
    expect(late.when).toBe("after");
    expect(coreMomentWords(late, "badtide")).toBe("Unstable core: goes off after cycle 6's badtide has ended");
  });

  it("a countdown that starts with the hazard goes off on its first days, or as it starts", () => {
    const m = coreMoment({ cycles: 2, days: 14 }, "normal", "drought");
    expect(m.when).toBe("during");
    expect(coreMomentWords(m, "drought")).toBe("Unstable core: goes off before or on days 1 to 2 of cycle 2's drought or badtide");
    expect([1, 2, 3].map((d) => coreMomentNow(m, d))).toEqual([true, true, false]);
    // on Hard, 7 days: from 1 day before the hazard to 2 days in, so days 1 to 3
    const hard = coreMoment({ cycles: 2, days: 7 }, "hard", "badtide");
    expect(coreMomentWords(hard, "badtide")).toBe("Unstable core: goes off before or on days 1 to 3 of cycle 2's drought or badtide");
  });

  it("a map's cores are read from its features: the same moment is one note counting its cores, and a map with none has no note", () => {
    const core = (id: string, cycles: number): Feature =>
      ({ id, kind: "mapObject", origin: "generated", locked: false, params: { kind: "unstableCore", placement: { x: 5, y: 5, orientation: "Cw0" }, core: { radius: 3, cycles } } }) as unknown as Feature;
    const other = { id: "m", kind: "mapObject", origin: "generated", locked: false, params: { kind: "mineSite", placement: { x: 1, y: 1, orientation: "Cw0" } } } as unknown as Feature;
    const features = [core("a", 6), core("b", 6), core("c", 8), other];
    expect(coreCountdowns(features)).toEqual([{ cycles: 6, days: CORE.days }, { cycles: 6, days: CORE.days }, { cycles: 8, days: CORE.days }]);
    const notes = coreNotes(features, "normal", "badtide", 8);
    expect(notes.map((n) => n.text)).toEqual([
      "Unstable core: goes off 2 to 7 days before cycle 6's drought or badtide (2 cores)",
      "Unstable core: goes off 2 to 7 days before cycle 8's drought or badtide",
    ]);
    expect(notes.every((n) => !n.now)).toBe(true);
    expect(coreNotes([other], "normal", "badtide", 8)).toEqual([]);
  });
});
