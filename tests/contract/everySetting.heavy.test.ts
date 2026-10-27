// Every setting makes a map (D471): the settings panel's extremes at every size it offers, and the
// maps players found that made none (everySetting.ts), each generated; the nightly suite runs it, in
// two files so the small and large maps run side by side (everySettingLarge.heavy.test.ts).
import { describe } from "vitest";
import { settingCases, settingTest } from "./everySetting";

describe("every setting the panel allows makes a map (D471), up to 128²", () => {
  for (const c of settingCases().filter((c) => c.spec.size.x * c.spec.size.y <= 128 * 128)) settingTest(c);
});
