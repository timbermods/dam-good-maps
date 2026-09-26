// First run (PLAN §20 D184): three one-line hints, each gone once it is done (paint the land, place
// things, add water), and never again after the three, or after the ×. Kept in the browser.

const KEY = "dgm.firstRun";

export type FirstStep = "paint" | "place" | "water";

const LINES: [FirstStep, string][] = [
  ["paint", "Paint the land: pick a brush above, then drag on the map."],
  ["place", "Place things: pick one on the left, then click the map."],
  ["water", "Add water: pick Water source on the left, then click where the water starts."],
];

/** The steps done so far (all three when the hints are over). */
export function loadFirstRun(): Set<FirstStep> {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "done") return new Set(LINES.map(([k]) => k));
    return new Set((JSON.parse(v ?? "[]") as FirstStep[]).filter((k) => LINES.some(([s]) => s === k)));
  } catch {
    return new Set();
  }
}

export function saveFirstRun(done: Set<FirstStep>): void {
  try {
    localStorage.setItem(KEY, done.size >= LINES.length ? "done" : JSON.stringify([...done]));
  } catch {
    // the hints come back next time
  }
}

export function FirstRun(p: { done: Set<FirstStep>; onClose(): void }) {
  const left = LINES.filter(([k]) => !p.done.has(k));
  if (!left.length) return null;
  return (
    <div class="map-note first-run" role="status" aria-label="First steps">
      <ul>
        {left.map(([k, words]) => (
          <li key={k}>{words}</li>
        ))}
      </ul>
      <button type="button" class="linkish" aria-label="No more hints" title="No more hints" onClick={p.onClose}>
        ×
      </button>
    </div>
  );
}
