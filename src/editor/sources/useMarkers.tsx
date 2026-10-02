// The sources' markers: the groups near the pointer, those feeding its water, and the labels drawn
// over them.

import type { JSX } from "preact";
import { useMemo, useRef } from "preact/hooks";
import type { TileHit } from "../../render3d";
import { feedingGroups, sourceGroups, sourceStrengths, sourceStrengthWords, type SourceGroup } from "../features";
import type { Ed } from "../ed";

export interface MarkersSlice {
  groupsRef: { current: SourceGroup[] };
  hoverSources: (hit: TileHit | null) => void;
  sourcesChanged: () => void;
  pointedWords: string | null;
  markerRef: { current: boolean };
  sourceMarkers: () => JSX.Element | null;
}

export function useMarkers(ed: Ed): MarkersSlice {
  const {
    info, mirror, renderer, ready, shelf, markersOn, setNearSources, nearSources, setFeeding, feeding, viewTick,
    infoRef, targeted, strengthTick, strengthOfEntity
  } = ed;

  // ------------------------------------------------------------------------ the sources' markers

  /** The map's sources as markers (a river's mouth is one), from the page's view of the objects. */
  // (the one number, D368 (4): worked out again whenever the page's copy of the objects or a strength set on it
  // changes, never left on an older copy)
  const groups = useMemo(() => sourceGroups(mirror.current.entities, info.W, mirror.current.heights, strengthOfEntity), [info.version, ready, mirror.current.entities, strengthTick]);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  /** Near the pointer: the groups within two tiles; over water: the groups it comes from. */
  const hoverKey = useRef("");
  function hoverSources(hit: TileHit | null) {
    const key = hit ? `${hit.x},${hit.y}` : "";
    if (key === hoverKey.current) return;
    hoverKey.current = key;
    const gs = groupsRef.current;
    const r = renderer.current;
    if (!hit) {
      setNearSources([]);
      setFeeding([]);
      r?.setSourceGlow([]);
      return;
    }
    const near: number[] = [];
    gs.forEach((g, k) => {
      if (g.tiles.some((t) => Math.abs((t % info.W) - hit.x) <= 2 && Math.abs(Math.floor(t / info.W) - hit.y) <= 2)) near.push(k);
    });
    setNearSources(near);
    const feed = mirror.current.water ? (feedingGroups(mirror.current.water, gs, info.W, info.H, hit.x, hit.y) ?? []) : [];
    setFeeding(feed);
    r?.setSourceGlow(feed.flatMap((k) => gs[k].tiles));
  }
  const hoverSourcesRef = useRef(hoverSources);
  hoverSourcesRef.current = hoverSources;
  /** The objects changed: the sources near the pointer and those feeding its water are found again
   *  at once, so a removed source's marker, label and glow go with it (D260), never after the water
   *  or the background check. */
  function sourcesChanged() {
    // (the groups as the objects are now: the page's memo follows at its next render)
    groupsRef.current = sourceGroups(mirror.current.entities, infoRef.current.W, mirror.current.heights, strengthOfEntity);
    hoverKey.current = "";
    hoverSourcesRef.current(renderer.current?.hoverHit ?? null);
  }
  /** Which markers show: every one with a source picked on the shelf or **Markers** on; else those
   *  near the pointer and those its water comes from. */
  /** The strength of the source the pointer is on, in words, the same as its marker's label (D361, item 6). */
  const pointedWords = targeted !== null ? (() => { const s = sourceStrengths(groups, strengthOfEntity, targeted); return s ? sourceStrengthWords(s) : null; })() : null;
  const targetGroup = targeted === null ? -1 : groups.findIndex((g) => g.members.includes(targeted));
  const shownGroups = shelf?.source || markersOn ? groups.map((_, k) => k) : [...new Set([...nearSources, ...feeding, ...(targetGroup >= 0 ? [targetGroup] : [])])];
  const markerRef = useRef(false);
  markerRef.current = shownGroups.length > 0;

  function sourceMarkers() {
    const r = renderer.current;
    if (!r || !shownGroups.length) return null;
    void viewTick;
    return (
      <div class="source-markers" aria-hidden="true">
        {shownGroups.map((k) => {
          const g = groups[k];
          if (!g) return null;
          const p = r.project(g.x + 0.5, g.z + 0.6, -(g.y + 0.5));
          if (!p.visible) return null;
          const n = g.members.length;
          const words = `${n > 1 ? `${n} sources, ` : ""}${g.strength} ${g.bad ? "badwater" : "water"}/s`;
          return (
            <span key={k} class={`map-note source-marker${g.bad ? " bad" : ""}${feeding.includes(k) ? " feeding" : ""}${k === targetGroup ? " target" : ""}`} style={{ left: `${p.x}px`, top: `${p.y}px` }}>
              {words}
            </span>
          );
        })}
      </div>
    );
  }

  return { groupsRef, hoverSources, sourcesChanged, pointedWords, markerRef, sourceMarkers };
}
