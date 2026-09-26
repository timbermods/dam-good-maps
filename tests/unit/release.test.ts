// What the public site shows before its release (PLAN §20 D219, src/editor/release.ts): the forces
// are on the preview, the dev server and in the tests, and not on the public site, until
// FORCES_RELEASED is set. The browser checks: tests/e2e/publicSite.spec.ts (the public build),
// brushKit.spec.ts and carve.spec.ts (the tests' build).

import { afterEach, describe, expect, it, vi } from "vitest";
import { forcesShownIn, FORCES_RELEASED } from "../../src/editor/release";

const PUBLIC = { mode: "production", base: "/dam-good-maps/" };
const PREVIEW = { mode: "production", base: "/dam-good-maps/preview/" };

describe("the forces before their release", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("the public site hides them; the preview, the dev server, the tests and npm run try show them", () => {
    expect(forcesShownIn(PUBLIC, false)).toBe(false);
    expect(forcesShownIn(PREVIEW, false)).toBe(true);
    expect(forcesShownIn({ mode: "development", base: "/dam-good-maps/" }, false)).toBe(true);
    expect(forcesShownIn({ mode: "test", base: "/" }, false)).toBe(true);
    expect(forcesShownIn({ mode: "e2e", base: "/dam-good-maps/" }, false)).toBe(true);
    expect(forcesShownIn({ mode: "try", base: "/dam-good-maps/" }, false)).toBe(true);
    // another base built as the public site is (the browser tests' public-build/) hides them too
    expect(forcesShownIn({ mode: "production", base: "/dam-good-maps/public-build/" }, false)).toBe(false);
  });

  it("released, every build shows them", () => {
    for (const b of [PUBLIC, PREVIEW, { mode: "development", base: "/" }]) expect(forcesShownIn(b, true)).toBe(true);
    // the switch as it stands decides the public site
    expect(forcesShownIn(PUBLIC)).toBe(FORCES_RELEASED);
  });

  it("the top bar built as the public site has no forces; built as the preview, Carve", async () => {
    vi.stubEnv("MODE", "production");
    vi.stubEnv("BASE_URL", "/dam-good-maps/");
    vi.resetModules();
    const pub = await import("../../src/editor/TopBar");
    expect(pub.SHOWN_FORCES.map((f) => f.id)).toEqual(FORCES_RELEASED ? ["carve"] : []);
    expect(pub.forceShown("carve")).toBe(FORCES_RELEASED);
    vi.stubEnv("BASE_URL", "/dam-good-maps/preview/");
    vi.resetModules();
    const pre = await import("../../src/editor/TopBar");
    expect(pre.SHOWN_FORCES.map((f) => f.id)).toEqual(["carve"]);
    expect(pre.forceShown("carve")).toBe(true);
  });

  it("under the tests, the top bar shows Carve", async () => {
    const t = await import("../../src/editor/TopBar");
    expect(t.forceShown("carve")).toBe(true);
    expect(t.forceShown("quake")).toBe(false);
  });
});
