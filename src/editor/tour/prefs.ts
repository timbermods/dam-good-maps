// What the tour must not leave behind in the browser (D377): the tour's gestures size brushes and forces, and the
// editor remembers those between visits (and marks the first-run hints done by what is painted). The tour keeps
// the player's own choices as they were and puts them back when it ends, however it ends.

const KEYS = ["dgm.brush", "dgm.forces", "dgm.firstRun"] as const;

export type Prefs = Record<(typeof KEYS)[number], string | null>;

/** The choices the tour could change, as they stand now; the forces play at their normal pace for the tour
 *  (Slow forces would stretch it). */
export function takePrefs(): Prefs {
  const was = {} as Prefs;
  for (const k of KEYS) {
    try {
      was[k] = localStorage.getItem(k);
    } catch {
      was[k] = null;
    }
  }
  try {
    const f = JSON.parse(was["dgm.forces"] ?? "null") as { watch?: unknown } | null;
    if (f && f.watch === true) localStorage.setItem("dgm.forces", JSON.stringify({ ...f, watch: false }));
  } catch {
    // (the tour plays at the pace the browser kept)
  }
  return was;
}

export function putPrefsBack(was: Prefs): void {
  for (const k of KEYS) {
    try {
      if (was[k] === null) localStorage.removeItem(k);
      else localStorage.setItem(k, was[k]);
    } catch {
      // (a browser that won't keep them kept nothing to put back)
    }
  }
}
