// The sources' markers: the groups near the pointer, those feeding its water, and the labels drawn
// over them (drawn by `SourceLabels`: nudged apart, kept off the panels, merged when crowded).

import type { JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { FLUIDS } from "../../core/data/parity";
import type { MarkerNote } from "../../core/doc/objectOps";
import type { TileHit } from "../../render3d";
import { feedingGroups, sourceGroups, sourceStrengths, sourceStrengthWords, type SourceGroup } from "../features";
import type { Ed } from "../ed";
import { SourceLabels } from "./SourceLabels";
import type { LabelIn } from "./labelLayout";

/** A note's label id: past every source group's (an index of the groups). */
const NOTE_ID = 100000;

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
    api, info, mirror, renderer, ready, shelf, markersOn, setNearSources, nearSources, setFeeding, feeding, viewTick,
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
    const feed = mirror.current.water ? (feedingGroups(mirror.current.water, gs, info.W, info.H, hit.x, hit.y, undefined, mirror.current.heights) ?? []) : [];
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
  // the water objects, cores and reserves have labels of their own words (the core's `markerNotes`, D337): worked out
  // by the worker, from the objects as the map holds them, whenever the objects change while every marker shows
  const showAll = !!(shelf?.source || markersOn);
  const [notes, setNotes] = useState<MarkerNote[]>([]);
  useEffect(() => {
    if (!showAll || !ready) return;
    let live = true;
    api
      .markerNotes()
      .then((n) => live && setNotes(n))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [showAll, ready, info.version, mirror.current.entities, strengthTick]);
  const shownNotes = showAll ? notes : [];
  const markerRef = useRef(false);
  markerRef.current = shownGroups.length > 0 || shownNotes.length > 0;

  function sourceMarkers() {
    const r = renderer.current;
    if (!r || (!shownGroups.length && !shownNotes.length)) return null;
    void viewTick;
    const items: LabelIn[] = [];
    for (const k of shownGroups) {
      const g = groups[k];
      if (!g) continue;
      const p = r.project(g.x + 0.5, g.z + 0.6, -(g.y + 0.5));
      if (!p.visible) continue;
      const feed = feeding.includes(k);
      const target = k === targetGroup;
      items.push({ id: k, ax: p.x, ay: p.y, count: g.members.length, strength: g.strength, bad: g.bad, feeding: feed, target });
    }
    shownNotes.forEach((n, k) => {
      const p = r.project(n.at[0], n.z + 0.6, -n.at[1]);
      if (!p.visible) return;
      items.push({ id: NOTE_ID + k, ax: p.x, ay: p.y, count: 1, strength: 0, bad: false, feeding: false, target: false, text: n.text, ...(FLUIDS[n.template]?.needsDrill ? { warn: true } : {}) });
    });
    return items.length ? <SourceLabels items={items} /> : null;
  }

  return { groupsRef, hoverSources, sourcesChanged, pointedWords, markerRef, sourceMarkers };
}
