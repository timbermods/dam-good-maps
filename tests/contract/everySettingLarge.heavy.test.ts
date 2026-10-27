// Every setting makes a map (D471), the maps over 128²: everySetting.heavy.test.ts has the rest.
import { describe } from "vitest";
import { settingCases, settingTest } from "./everySetting";

describe("every setting the panel allows makes a map (D471), over 128²", () => {
  for (const c of settingCases().filter((c) => c.spec.size.x * c.spec.size.y > 128 * 128)) settingTest(c);
});
