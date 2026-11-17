// The e2e build only (window.__dgmNeverKeep, App.tsx): a generate that keeps no map by construction. Its attempts follow one
// another a few times a second, each refused with a real reason in a player's words (`failWords.ts`), and it never ends by
// itself: only the making's bounds (the offer at 30 s, the stop at 5 minutes, `makingClock.ts`) or Cancel end it. A test of
// those bounds then never races a real map that happens to pass first (generateBound.spec.ts failed on a quick runner
// that way, PR #1224's run). A player never reaches it: `refusingMake` is this generate in the e2e build and nothing in
// any other, so the published page's bundle carries none of this file's code.

import { failurePhrase } from "../core/gen/failWords";
import type { GenerateResponse, GenProgress } from "../worker/api";

/** Real reasons an attempt is refused (`GenerateResult.failures`' ids), taken in turn. */
const REFUSED: readonly (readonly string[])[] = [["start.water"], ["water.settles"], ["start.wood"], ["easy start (planned)"]];
/** How often a refused attempt follows the last (ms of the page's time). */
const EVERY_MS = 250;

/** Attempts, each refused, while `live()`; the promise never settles (the page drops a stopped generate's answer). */
export function refusingGenerate(live: () => boolean, onProgress: (p: GenProgress) => void): Promise<GenerateResponse> {
  return new Promise(() => {
    let attempt = 0;
    const t = setInterval(() => {
      if (!live()) return clearInterval(t);
      onProgress({ kind: "stage", attempt, stage: "land", tried: attempt, ...(attempt ? { failed: failurePhrase(REFUSED[(attempt - 1) % REFUSED.length]) } : {}) });
      attempt++;
    }, EVERY_MS);
  });
}

/** The refusing generate, in the end-to-end build alone (the bundler drops it and all it uses from every other build). */
export const refusingMake = import.meta.env.MODE === "e2e" ? refusingGenerate : undefined;
