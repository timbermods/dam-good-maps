// The land's shares, live (Show's "Land", beside Legend): water, moist ground and dry ground as shares of the map, and
// its living trees and logs (core/analysis/landShares.ts). Read from the page's copy of the map when the map changes
// and its water has settled, never per frame; while the water is still flowing the last numbers stay. Dry land is not
// a fault, so the three are shown plainly, with no warning colour. The toggle is remembered in this browser.

import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { landShares, shareWords, type LandPlant, type LandShares } from "../../core/analysis/landShares";
import { DEAD, surfaceWater, YOUNG } from "../../render3d/model";
import type { Ed } from "../ed";

const LAND_KEY = "dgm.land";

export interface LandSharesSlice {
  /** Show's Land toggle is on. */
  landOn: boolean;
  toggleLand: () => void;
  /** The readout under Legend while it is on (null while off, or before the first numbers). */
  landReadout: () => ComponentChildren;
}

function saved(): boolean {
  try {
    return localStorage.getItem(LAND_KEY) === "1";
  } catch {
    return false;
  }
}

export function useLandShares(ed: Ed): LandSharesSlice {
  const { mirror, infoRef, info, flowing, busy, ready } = ed;
  const [on, setOn] = useState(saved);
  const [shares, setShares] = useState<LandShares | null>(null);
  // (the map's own water and soil, as the worker last put them in place: a held weather day's are not the map's)
  useEffect(() => {
    if (!on || !ready || flowing || busy > 0) return;
    const { W, H } = infoRef.current;
    const m = mirror.current;
    const surface = surfaceWater(W, H, m.mapWater).surface;
    const moisture = m.soil?.moisture;
    const e = m.entities;
    const plants: LandPlant[] = [];
    for (let k = 0; k < e.count; k++) plants.push({ template: e.templates[e.template[k]], dead: (e.flags[k] & DEAD) !== 0, young: (e.flags[k] & YOUNG) !== 0 });
    setShares(landShares(W * H, (i) => surface[i] === surface[i], (i) => !!moisture && moisture[i] > 0, plants));
  }, [on, ready, flowing, busy, info.version, ed.waterTick]);
  const toggleLand = () => {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(LAND_KEY, next ? "1" : "0");
    } catch {
      // (a browser that keeps nothing: the toggle still works for this visit)
    }
  };
  const landReadout = () => {
    if (!on || !shares) return null;
    const n = (v: number) => v.toLocaleString("en-GB");
    const [water, moist, dry] = shareWords(shares);
    const line = (name: string, value: string) => (
      <div class="land-line">
        <dt>{name}</dt>
        <dd>{value}</dd>
      </div>
    );
    return (
      <dl class="land-shares" aria-label="The land's shares">
        {line("Water", water)}
        {line("Moist ground", moist)}
        {line("Dry ground", dry)}
        {line("Living trees", n(shares.trees))}
        {line("Logs", n(shares.logs))}
      </dl>
    );
  };
  return { landOn: on, toggleLand, landReadout };
}
