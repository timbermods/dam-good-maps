// The view: what the page knows of the objects on each tile (sources, the start), and the overlay
// and the force's ring drawn on the map.

import { useEffect, useMemo, useRef, useState, type Dispatch, type StateUpdater } from "preact/hooks";
import { footprintTiles, type Orientation } from "../../core/format/footprints";
import { ORIENTATION_NAMES, type EntityView } from "../../render3d/model";
import type { TileHit } from "../../render3d";
import type { WaterLayers } from "../../worker/session";
import { entitiesByTile, startStatus, type TileContext } from "../features";
import type { LayerKind } from "../panels";
import { isSource, SOURCE_SCREEN_REACH, sourceSpots, targetSource, type SourceSpot } from "../sourceSpots";
import { BAD, STATUS_COLOR, WARN, DRAWING, DRAWING_BAND, GOOD, HOVERED, LOCKED, MOVING, paintOverlay, PROBLEM, SELECTED, type OverlayLayer } from "../tools";
import { type StartHere } from "../start/startHere";
import type { Ed } from "../ed";

/** The middle tile of a StartingLocation at Coordinates (x, y) facing o. */
function cornerToCentre(x: number, y: number, o: Orientation): [number, number] {
  switch (o) {
    case "Cw0":
      return [x + 1, y + 1];
    case "Cw90":
      return [x + 1, y - 1];
    case "Cw180":
      return [x - 1, y - 1];
    case "Cw270":
      return [x - 1, y + 1];
  }
}

/** The overlay of a water layer: moisture in three greens, badwater brown and the soil it spoils
 *  lighter, the drought's kept water blue and the water that dries up orange, the tiles under
 *  roofs violet. */
function layerOverlay(l: WaterLayers, kind: LayerKind): OverlayLayer[] {
  const pick = (codes: Uint8Array, code: number) => {
    const out: number[] = [];
    for (let i = 0; i < codes.length; i++) if (codes[i] === code) out.push(i);
    return out;
  };
  switch (kind) {
    case "badwater":
      return [
        { tiles: pick(l.badwater, 2), color: [190, 140, 70, 120] },
        { tiles: pick(l.badwater, 1), color: [120, 70, 30, 200] },
      ];
    case "roofed":
      return [{ tiles: Array.from(l.roofed), color: [170, 90, 220, 150] }];
    default:
      return [];
  }
}

export interface ViewSlice {
  spots: () => SourceSpot[];
  targetAt: (x: number, y: number) => SourceSpot | null;
  sourceOnScreen: (hit: TileHit | null, clientX: number, clientY: number) => { x: number; y: number; bad: boolean; tiles: [number, number][] } | null;
  targetSpot: { current: SourceSpot | null };
  targeted: number | null;
  setTargeted: Dispatch<StateUpdater<number | null>>;
  ctx: () => TileContext;
  startHereRef: { current: StartHere | null };
  startHere: StartHere | null;
}

export function useView(ed: Ed): ViewSlice {
  const {
    info, mirror, renderer, ready, forceStroke, forceCursor, forceRing, painted, startDrag, layer, waterLayers,
    selection, selectionTick, selectDraw, selectPreview, sourceDrag, hoverObject, instant, fit, picked, pickedObject,
    indexed, infoRef
  } = ed;

  // ------------------------------------------------------------------------------- the view

  const entitiesAt = (): Map<number, number[]> => {
    const m = mirror.current;
    m.entitiesAt ??= entitiesByTile(m.entities, info.W);
    return m.entitiesAt;
  };
  /** The water or badwater source covering tile (x, y) (a badwater source covers 3 × 3): where it
   *  stands and its tiles. */
  const sourceAt = (x: number, y: number): { x: number; y: number; bad: boolean; tiles: [number, number][] } | null => {
    const m = mirror.current.entities;
    const W = infoRef.current.W;
    const H = infoRef.current.H;
    const at = entitiesAt();
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        for (const k of at.get(ny * W + nx) ?? []) {
          const template = m.templates[m.template[k]];
          if (template !== "WaterSource" && template !== "BadwaterSource") continue;
          const tiles = footprintTiles(template, { template, x: nx, y: ny, z: 0, orientation: ORIENTATION_NAMES[m.orientation[k]] as Orientation, flipped: false });
          if (tiles.some(([tx, ty]) => tx === x && ty === y)) return { x: nx, y: ny, bad: template === "BadwaterSource", tiles };
        }
      }
    return null;
  };
  /** The map's sources (D249), made when first asked for after the objects change. */
  const spotCache = useRef<{ of: EntityView | null; list: SourceSpot[] }>({ of: null, list: [] });
  const spots = (): SourceSpot[] => {
    const e = mirror.current.entities;
    if (spotCache.current.of !== e) spotCache.current = { of: e, list: sourceSpots(e, infoRef.current.W, infoRef.current.H) };
    return spotCache.current.list;
  };
  /** The source the pointer on tile (x, y) targets (D249): one standing there; else, over water or
   *  bare ground, the nearest within about two tiles (another object standing there wins). */
  const targetAt = (x: number, y: number): SourceSpot | null => {
    const W = infoRef.current.W;
    const e = mirror.current.entities;
    const covered = (ed.coverAt().get(y * W + x) ?? []).some((k) => !isSource(e.templates[e.template[k]]));
    return targetSource(spots(), x, y, W, covered);
  };
  /** The source the pointer is over on the screen (D345, B4): the one standing on its tile, else the
   *  one whose marker or ground point the pointer is on, a few pixels' reach, because a source
   *  stands up out of its tile and its marker floats above: a near miss in tiles is a hit on it, so
   *  Ctrl+scroll changes its strength and a click selects it, never placing a second one. */
  const sourceOnScreen = (hit: TileHit | null, clientX: number, clientY: number): { x: number; y: number; bad: boolean; tiles: [number, number][] } | null => {
    const exact = hit ? sourceAt(hit.x, hit.y) : null;
    if (exact) return exact;
    const r = renderer.current;
    const box = r?.canvas.getBoundingClientRect();
    if (!r || !box) return null;
    const px = clientX - box.left;
    const py = clientY - box.top;
    const W = infoRef.current.W;
    const h = mirror.current.heights;
    let best: SourceSpot | null = null;
    let bestD = SOURCE_SCREEN_REACH;
    for (const sp of spots()) {
      const [x0, y0, x1, y1] = sp.rect;
      const cx = (x0 + x1 + 1) / 2;
      const cy = (y0 + y1 + 1) / 2;
      const z = h[sp.corner] ?? 0;
      const ground = r.project(cx, z, -cy);
      const marker = r.project(cx, z + 0.6, -cy);
      if (!ground.visible && !marker.visible) continue;
      // (the distance to the line from the source's foot to its marker)
      const vx = marker.x - ground.x;
      const vy = marker.y - ground.y;
      const len = vx * vx + vy * vy;
      const t = len ? Math.max(0, Math.min(1, ((px - ground.x) * vx + (py - ground.y) * vy) / len)) : 0;
      const d = Math.hypot(px - (ground.x + vx * t), py - (ground.y + vy * t));
      if (d < bestD) {
        bestD = d;
        best = sp;
      }
    }
    void W;
    return best ? { x: best.x, y: best.y, bad: best.bad, tiles: best.tiles.map((i): [number, number] => [i % W, Math.floor(i / W)]) } : null;
  };
  /** The source the pointer targets now (D249), for Delete and its marker. */
  const targetSpot = useRef<SourceSpot | null>(null);
  const [targeted, setTargeted] = useState<number | null>(null);
  const ctx = (): TileContext => ({ W: info.W, H: info.H, heights: mirror.current.heights, water: mirror.current.water, entities: mirror.current.entities, entitiesAt: entitiesAt(), index: indexed, soil: mirror.current.soil, editor: true });

  // where the start is: its feature, or an imported map's own StartingLocation
  const startHereRef = useRef<StartHere | null>(null);
  const startHere = useMemo((): StartHere | null => {
    const f = info.features.find((g) => g.kind === "start");
    if (f && f.kind === "start") return { x: f.params.position[0], y: f.params.position[1], orientation: f.params.orientation, feature: f.id, owner: f.id };
    const e = mirror.current.entities;
    for (let k = 0; k < e.count; k++) {
      if (e.templates[e.template[k]] !== "StartingLocation") continue;
      const o = ORIENTATION_NAMES[e.orientation[k]] as Orientation;
      const [cx, cy] = cornerToCentre(e.x[k], e.y[k], o);
      return { x: cx, y: cy, orientation: o, feature: null, owner: e.owners[e.owner[k]] };
    }
    return null;
  }, [info.features, info.version]);
  startHereRef.current = startHere;

  // overlay: the water layer, dam sites, the footprint of the object under the pointer (green where
  // it fits, red where it doesn't), trees being painted, Remove's rectangle, the source picked, the
  // start while it moves, a source being dragged, the selection, the problems an edit made
  useEffect(() => {
    const r = renderer.current;
    const data = r?.overlayData();
    if (!r || !data) return;
    const layers: OverlayLayer[] = [];
    if (waterLayers && layer !== "none") layers.push(...layerOverlay(waterLayers, layer));
    if (painted) layers.push({ tiles: painted, color: GOOD });
    else if (fit) {
      // (the start's colour says what it is: green fits and meets, amber misses, red cannot stand; D361)
      const color = fit.problem ? BAD : fit.status === "warn" ? WARN : GOOD;
      if (fit.status !== "pending") layers.push({ tiles: fit.tiles, color });
    }
    if (picked) layers.push({ tiles: [picked.y * info.W + picked.x], color: SELECTED });
    if (pickedObject) layers.push({ tiles: footprintTiles(pickedObject.template, { template: pickedObject.template, x: pickedObject.x, y: pickedObject.y, z: 0, orientation: pickedObject.orientation, flipped: pickedObject.flipped }).filter(([x, y]) => x >= 0 && y >= 0 && x < info.W && y < info.H).map(([x, y]) => y * info.W + x), color: SELECTED, outline: true });
    if (startDrag) layers.push({ tiles: [...startDrag.check.tiles, startDrag.check.door], color: STATUS_COLOR[startStatus(startDrag.check)] });
    if (hoverObject && !sourceDrag) layers.push({ tiles: hoverObject, color: HOVERED, outline: true });
    // the source being changed is clearly marked: the one the pointer is on, the one picked (D361, item 6)
    if (targeted !== null && targetSpot.current && !sourceDrag) layers.push({ tiles: targetSpot.current.tiles, color: HOVERED, outline: true });
    if (picked) for (const e of picked.list) layers.push({ tiles: footprintTiles(e.template, { template: e.template, x: e.x, y: e.y, z: 0, orientation: e.orientation, flipped: e.flipped }).filter(([x, y]) => x >= 0 && y >= 0 && x < info.W && y < info.H).map(([x, y]) => y * info.W + x), color: SELECTED, outline: true });
    if (sourceDrag) layers.push({ tiles: sourceDrag, color: MOVING });
    if (selection.current.count) {
      // the working area (D254): the land outside it is locked, and dimmed
      const out: number[] = [];
      const mask = selection.current.mask;
      for (let i = 0; i < mask.length; i++) if (!mask[i]) out.push(i);
      if (out.length) layers.push({ tiles: out, color: LOCKED });
      layers.push({ tiles: selection.current.tiles(), color: SELECTED, outline: true });
    }
    if (selectDraw) layers.push({ tiles: selectDraw, color: DRAWING });
    if (selectPreview) layers.push({ tiles: selectPreview.tiles, color: selectPreview.color });
    // the line a force is drawn with (the gesture itself, D258, D321 item 41)
    if (forceStroke) {
      // (a band: a soft fill and its edge; a thin line is all edge)
      layers.push({ tiles: forceStroke, color: DRAWING_BAND });
      layers.push({ tiles: forceStroke, color: DRAWING, outline: true });
    }
    for (const c of instant) for (const [x, y] of c.where?.tiles ?? []) layers.push({ tiles: [y * info.W + x], color: PROBLEM });
    paintOverlay(data, info.W, info.H, layers);
    r.commitOverlay();
  }, [fit, picked, targeted, pickedObject, hoverObject, startDrag, instant, ready, waterLayers, layer, sourceDrag, selectionTick, selectDraw, selectPreview, painted, forceStroke]);
  // the force's one ring (D312, D321 item 13): its size round the cursor, drawn once where the cursor
  // is (the water's surface over water); a click's small reach still shows a ring round the cursor. A
  // force with no size to show (Quake) shows only a small marker, never a circle (D368 (2))
  useEffect(() => {
    if (forceRing) renderer.current?.setForceRing({ ...forceRing, r: Math.max(1.5, forceRing.r) });
    else renderer.current?.setForceRing(forceCursor ? { x: forceCursor[0] + 0.5, y: forceCursor[1] + 0.5, r: 0, marker: true } : null);
  }, [forceRing, forceCursor, ready]);

  return { spots, targetAt, sourceOnScreen, targetSpot, targeted, setTargeted, ctx, startHereRef, startHere };
}
