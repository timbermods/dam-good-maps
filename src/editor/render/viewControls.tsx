// The view's own controls: the view buttons, the corner cluster (Slow forces, sound) and what the
// map does as the pointer moves over it.

import type { TileHit } from "../../render3d";
import { describeTile as describeTileFacts, tileWords } from "../../core/doc/describeTile";
import { tip } from "../../ui/Tooltip";
import { LAYER_NAMES, type LayerKind } from "../panels";
import type { Ed } from "../ed";

/** The overlays' words on their view buttons. */
const OVERLAY_WORDS: Record<LayerKind, string> = { none: "None", badwater: "Badwater", roofed: "Under roofs" };

export function levelLinesButton(ed: Ed) {
  const { brush, brushRef, setBrush } = ed;

  return (
    // a view switch (D248): what shows, never how a brush works; whatever tool is picked
    <button type="button" aria-pressed={brush.levelLines} onClick={() => setBrush({ ...brushRef.current, levelLines: !brushRef.current.levelLines })} title="A line at every level">
      Level lines
    </button>
  );
}

export function viewButtons(ed: Ed) {
  const { clearWater, setClearWater, waterLayers, layer, setLayer, minimap, setMinimap } = ed;

  return (
    <>
      <button type="button" aria-pressed={clearWater} onClick={() => setClearWater(!clearWater)} {...tip("See through the water", "T")}>
        Clear water
      </button>
      {(["badwater", ...(waterLayers?.roofed.length ? (["roofed"] as const) : [])] as LayerKind[]).map((k) => (
        <button type="button" key={k} aria-pressed={layer === k} onClick={() => setLayer(layer === k ? "none" : k)} title={`Show ${LAYER_NAMES[k].toLowerCase()}`}>
          {OVERLAY_WORDS[k]}
        </button>
      ))}
      <button type="button" aria-pressed={minimap} onClick={() => setMinimap(!minimap)} title="A small picture of the map">
        Minimap
      </button>
    </>
  );
}

export function cornerButtons(ed: Ed) {
  const { watch, setWatch, sound, setSound } = ed;

  return (
    <>
      <button type="button" aria-pressed={watch} onClick={() => setWatch(!watch)} title="Play forces out slowly">
        Slow forces
      </button>
      <span class="reveal-group">
        {/* (the volume opens beneath the speaker, so the cluster stays as it is) */}
        <label class="slider-field reveal" title="Volume">
          <input type="range" min="0" max="1" step="0.02" aria-label="Sound volume" value={sound.volume} disabled={!sound.on} onInput={(e) => setSound({ ...sound, volume: Number((e.target as HTMLInputElement).value) })} />
        </label>
        <button type="button" class="icon-button speaker" aria-label="Sound" aria-pressed={sound.on} onClick={() => setSound({ ...sound, on: !sound.on })} title={sound.on ? "Mute sounds" : "Turn sounds on"}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
            {sound.on ? <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> : <path d="M3 3l18 18" class="crossed" />}
          </svg>
        </button>
      </span>
    </>
  );
}

/** What the pointer over the map does: the words for the tile, the sources near it, what it would pick up. */
export function hoverHandler(ed: Ed) {
  const {
    renderer, setHover, pageTileFacts, hoverSources, targetAt, targetSpot, setTargeted, brushToolRef, shelfRef, toolRef,
    startHere, selection, objectUnder, objectTiles, setHoverObject, hoverStart
  } = ed;

  return (hit: TileHit | null) => {
    setHover(hit ? tileWords(describeTileFacts(pageTileFacts(), hit.x, hit.y)) : null);
    hoverSources(hit);
    // the source the pointer targets, whatever tool is picked (D249)
    const t = hit ? targetAt(hit.x, hit.y) : null;
    targetSpot.current = t;
    setTargeted(t ? t.k : null);
    // a source, and the start, can be picked up and moved
    const canvas = renderer.current?.canvas;
    const free = hit && !brushToolRef.current && !shelfRef.current && !toolRef.current;
    const onStart = !!hit && !!startHere && Math.max(Math.abs(hit.x - startHere.x), Math.abs(hit.y - startHere.y)) <= 1;
    // the object it would pick, shown before the click (D360 a)
    const pick = hit && free && !t && !onStart && !selection.current.count ? objectUnder(hit.x, hit.y) : undefined;
    const tilesUnder = pick === undefined ? null : objectTiles(pick);
    setHoverObject((cur) => (cur === tilesUnder || (cur && tilesUnder && cur.length === tilesUnder.length && cur[0] === tilesUnder[0]) ? cur : tilesUnder));
    if (canvas) canvas.style.cursor = free && (t || onStart || pick !== undefined) ? "grab" : "";
    hoverStart(!!free && onStart);
  };
}
