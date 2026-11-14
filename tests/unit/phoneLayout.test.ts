// The editor's layout by its room (#1074 slice 2, amends D185): upright under 600 CSS px wide, on its side under 500
// tall, the desktop's otherwise; both short, the longer side decides.

import { afterEach, describe, expect, it, vi } from "vitest";
import { phoneLayoutFor, roomNow, tabletRoomFor } from "../../src/editor/view/phoneLayout";

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

describe("tabletRoomFor", () => {
  it("gives a tablet's room to an iPad's sizes either way up, never to a phone's or a touch laptop's (slice 6)", () => {
    for (const [w, h] of [[820, 1180], [1180, 820], [1024, 768], [1024, 1366], [600, 900]]) expect(tabletRoomFor(w, h), `${w}×${h}`).toBe(true);
    for (const [w, h] of [[393, 852], [852, 393], [1400, 900], [1920, 1080]]) expect(tabletRoomFor(w, h), `${w}×${h}`).toBe(false);
  });
});

describe("roomNow", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the layout viewport's own size, not innerWidth, which grows to fit what is wider than the screen", () => {
    // a phone upright whose page drew something 1,047 wide (the Help flake, #1074 slice 5)
    vi.stubGlobal("document", { documentElement: { clientWidth: 393, clientHeight: 852 } });
    vi.stubGlobal("window", { innerWidth: 1047, innerHeight: 2268 });
    expect(roomNow()).toBe("upright");
  });

  it("gives no layout without a document", () => {
    vi.stubGlobal("document", undefined);
    expect(roomNow()).toBeNull();
  });
});
