// The generator's 3D preview (PLAN §14.2, "3D (lazy)"): the generated map in the shared 3D view,
// with the hover readout. Loaded only when the
// player switches the preview to 3D.

import { useMemo, useRef, useState } from "preact/hooks";
import { describeTile, entitiesByTile, FeatureIndex, type TileContext } from "../editor/features";
import { emptyColumns, entityView, soilView, surfaceWater, waterFromDepth, type MapView } from "../render3d";
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
  return (
    <View3D
      view={view}
      class="preview3d"
      label="3D view of the map. Drag to turn, right-drag to move, wheel to zoom."
      hoverText={hover}
      onHover={(hit) => setHover(hit ? describeTile(context(), hit.x, hit.y) : null)}
    />
  );
}
