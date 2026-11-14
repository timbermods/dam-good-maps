// The editor's layout by its room (#1074 slice 2, amends D185): upright under 600 CSS px wide, on its side under 500
// tall, the desktop's otherwise; both short, the longer side decides.

import { describe, expect, it } from "vitest";
import { phoneLayoutFor } from "../../src/editor/view/phoneLayout";

describe("phoneLayoutFor", () => {
  it("gives a phone upright, on its side, and the desktop's layout to a tablet or a laptop", () => {
    expect(phoneLayoutFor(393, 852)).toBe("upright");
    expect(phoneLayoutFor(852, 393)).toBe("side");
    expect(phoneLayoutFor(599, 900)).toBe("upright");
    expect(phoneLayoutFor(1024, 499)).toBe("side");
    expect(phoneLayoutFor(600, 900)).toBeNull();
    expect(phoneLayoutFor(1024, 768)).toBeNull();
    expect(phoneLayoutFor(1920, 1080)).toBeNull();
  });

  it("takes the longer side when both are short", () => {
    expect(phoneLayoutFor(480, 320)).toBe("side");
    expect(phoneLayoutFor(320, 480)).toBe("upright");
  });
});
