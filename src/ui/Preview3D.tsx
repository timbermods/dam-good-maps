// The generator's 3D preview (PLAN §14.2, "3D (lazy)"): the generated map in the shared 3D view,
// with the hover readout, and the best dam site marked as on the 2D preview. Loaded only when the
// player switches the preview to 3D.

import { useMemo, useRef, useState } from "preact/hooks";
import { describeTile, entitiesByTile, FeatureIndex, type TileContext } from "../editor/features";
import { emptyColumns, entityView, soilView, surfaceWater, waterFromDepth, type MapRenderer, type MapView } from "../render3d";
import { DAM_OVERLAY as DAM, damLegendSwatch } from "../render3d/palette";
import type { GenerateResponse } from "../worker/api";
import { View3D } from "./View3D";

export function viewOfResponse(r: GenerateResponse): MapView {
  return {
    W: r.W,
    H: r.H,
    heights: r.heights,
    columns: emptyColumns(),
    water: waterFromDepth(r.heights, r.water, r.contamination),
    entities: entityView(r.entities),
    soil: soilView(r.moisture, r.soilContamination),
  };
}

/** The best dam site's line of tiles (the worker's dam-site layer draws them the same way). */
export function damTiles(r: GenerateResponse): [number, number][] {
  const d = r.facts.bestDam;
  if (!d) return [];
  const half = Math.floor((d.length - 1) / 2);
  const out: [number, number][] = [];
  for (let k = -half; k <= d.length - 1 - half; k++) out.push([d.x + k * d.dir[1], d.y + k * d.dir[0]]);
  return out.filter(([x, y]) => x >= 0 && y >= 0 && x < r.W && y < r.H);
}

export default function Preview3D({ result }: { result: GenerateResponse }) {
  const view = useMemo(() => viewOfResponse(result), [result]);
  // the hover index is built on the first hover, so switching to 3D stays quick
  const ctx = useRef<{ view: MapView; c: TileContext } | null>(null);
  const context = (): TileContext => {
    if (ctx.current?.view !== view) {
      const index = new FeatureIndex(result.W, result.H);
      index.update(result.features);
      ctx.current = {
        view,
        c: { W: result.W, H: result.H, heights: result.heights, water: surfaceWater(result.W, result.H, view.water), entities: view.entities, entitiesAt: entitiesByTile(view.entities, result.W), index, soil: view.soil },
      };
    }
    return ctx.current.c;
  };
  const [hover, setHover] = useState<string | null>(null);
  const dam = useMemo(() => damTiles(result), [result]);
  const legendExtra = useMemo(() => (dam.length ? [{ swatch: damLegendSwatch(), label: "Best dam site", markers: true, tiles: dam.map(([x, y]) => y * result.W + x) }] : []), [dam, result.W]);
  const onReady = (r: MapRenderer) => {
    const data = r.overlayData();
    if (!data) return;
    data.fill(0);
    for (const [x, y] of dam) data.set(DAM, (y * result.W + x) * 4);
    r.commitOverlay();
  };
  return (
    <View3D
      view={view}
      class="preview3d"
      label="3D view of the map. Drag to turn, right-drag to move, wheel to zoom."
      hoverText={hover}
      onReady={onReady}
      legendExtra={legendExtra}
      onHover={(hit) => setHover(hit ? describeTile(context(), hit.x, hit.y) : null)}
    />
  );
}
