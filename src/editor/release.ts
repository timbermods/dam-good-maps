// What the public site shows before its release (PLAN §20 D219). The forces of nature (Carve now;
// Craterize, Erupt and Quake as they come) go to the preview first and are released only after
// Kyler has tried them; Live editing itself is released now. So the public site shows no forces at
// all: no button, no key, no options row. Every other build shows them: the preview (built under
// /dam-good-maps/preview/), the dev server, the tests (vitest, and the browser tests' build in the
// "e2e" mode) and `npm run try`. The top bar reads this (TopBar.tsx `SHOWN_FORCES`).
//
// At the forces' release, set FORCES_RELEASED to true: every build shows them from then on.

export const FORCES_RELEASED = false;

/** What a build is: vite's mode ("production" for a site build, "development" for the dev server,
 *  "test" under vitest, "e2e" for the browser tests) and its base. */
export interface BuildKind {
  mode: string;
  base: string;
}

/** Whether a build shows the forces: always once they are released; before that, every build but
 *  the public site's (a production build that isn't the preview). */
export function forcesShownIn(b: BuildKind, released = FORCES_RELEASED): boolean {
  return released || b.mode !== "production" || /\/preview\/$/.test(b.base);
}
