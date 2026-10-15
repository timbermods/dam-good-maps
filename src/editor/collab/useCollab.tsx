// A shared session in the editor (docs/COLLAB-BRIEF.md, D486): the other player's cursor on the map, where this player's own
// cursor, tool and camera are sent, the map's updates the session orders (the page takes them as it takes an edit's answer),
// "Go to <name>", and the session's notes in the page's usual note line. The session itself is the page's `Together`
// (src/collab/together.ts); every edit reaches it through the worker, so nothing here routes an edit.

import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { SessionUpdate } from "../../worker/session";
import type { Ed } from "../ed";
import type { EditorProps } from "../Editor";
import { BRUSH_NAMES } from "../brushes";
import { FORCES } from "../TopBar";
import { CURSOR_FADE_MS, type Note, type Together, type TogetherState } from "../../collab/together";

export interface CollabSlice {
  /** The page's session object, when the page has one. */
  together: Together | undefined;
  /** What the session is now (null without one). */
  collab: TogetherState | null;
  /** The other player's cursor, with their name and tool, over the map. */
  presenceMarkers: () => JSX.Element | null;
  /** The map changed under a stale page: the other player's terrain came while this player's strokes were on their way. */
  collabStale: { current: boolean };
}

/** The name of what this player holds, for the other's marker ("Raise", "Carve", "Select"). */
export function heldName(e: Pick<Ed, "forcer" | "tool" | "brushTool" | "shelf" | "selecting">): string | null {
  const verb = e.forcer.current?.status?.verb ?? e.tool;
  if (verb) return FORCES.find((f) => f.id === verb)?.name ?? null;
  if (e.shelf) return e.shelf.name;
  if (e.brushTool) return BRUSH_NAMES[e.brushTool];
  return e.selecting ? "Select" : null;
}

export function useCollab(ed: Ed, props: EditorProps): CollabSlice {
  const together = props.together;
  const [, setTick] = useState(0);
  const state = together?.state ?? null;
  const collabStale = useRef(false);
  const latest = useRef(ed);
  latest.current = ed;
  /** Updates that came before the 3D view was ready: the view draws the map as opened, then these in order. */
  const held = useRef<SessionUpdate[]>([]);

  // the session's changes, and the other's cursor (a frame at most), re-draw this
  useEffect(() => {
    if (!together) return;
    let frame = 0;
    let fade = 0;
    const off = together.subscribe(() => setTick((n) => n + 1));
    const offPresence = together.onPresence(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setTick((n) => n + 1));
      clearTimeout(fade);
      fade = window.setTimeout(() => setTick((n) => n + 1), CURSOR_FADE_MS + 30);
    });
    return () => {
      off();
      offPresence();
      cancelAnimationFrame(frame);
      clearTimeout(fade);
    };
  }, [together]);

  /** An update the session ordered: taken as an edit's answer, after the edits already on their way. */
  const take = (u: SessionUpdate) => {
    const e = latest.current;
    void e.enqueue(async () => {
      if (!e.mounted.current) return;
      e.applyUpdate(u);
      // (this player's strokes are still on their way: the terrain waits for them, and is taken again when the last is in)
      if (u.view.heights && e.pendingTerrain.current > 0) e.collabStale.current = true;
    });
  };

  useEffect(() => {
    if (!together) return;
    return together.attach({
      update: (u) => (latest.current.ready ? take(u) : void held.current.push(u)),
      goTo: (v) => {
        const r = latest.current.renderer.current;
        if (r) r.glideTo({ mode: r.getView().mode, yaw: v.yaw, pitch: v.pitch, distance: v.dist, target: [v.x, v.y, v.z] });
      },
      note: (n: Note) => {
        const e = latest.current;
        const see = n.see;
        e.setMessage({
          kind: n.kind,
          text: n.text,
          ...(see ? { action: { label: "See it", title: "Show where the water changed", run: () => e.showTile(see.x, see.y) } } : {}),
        });
      },
    });
  }, [together]);

  // the view is drawn: the updates that waited go in, in order
  useEffect(() => {
    if (!ed.ready || !held.current.length) return;
    const late = held.current;
    held.current = [];
    for (const u of late) take(u);
  }, [ed.ready]);

  // this player's cursor, tool and camera, to the other, while the session is live (the session sends at most 15 a second)
  const live = state?.phase === "live";
  useEffect(() => {
    if (!together || !live) return;
    let frame = 0;
    let last = "";
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const e = latest.current;
      const r = e.renderer.current;
      const c = together.live;
      if (!r || !c) return;
      const hit = r.hoverHit;
      const cursor: [number, number] | null = hit ? [hit.x + 0.5, hit.y + 0.5] : null;
      const tool = heldName(e);
      const v = r.getView();
      const key = `${cursor ? cursor.join(",") : "-"}|${tool}|${v.target.map((n) => n.toFixed(1)).join(",")}|${v.distance.toFixed(1)}|${v.yaw.toFixed(2)}|${v.pitch.toFixed(2)}`;
      if (key === last) return;
      last = key;
      c.presence({ cursor, tool, view: { x: v.target[0], y: v.target[1], z: v.target[2], dist: v.distance, yaw: v.yaw, pitch: v.pitch } });
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [together, live]);

  function presenceMarkers(): JSX.Element | null {
    const r = ed.renderer.current;
    const p = together?.presence();
    if (!p || !p.cursor || !r || !live) return null;
    void ed.viewTick;
    const [cx, cy] = p.cursor;
    const { W, H } = ed.infoRef.current;
    if (cx < 0 || cy < 0 || cx > W || cy > H) return null;
    const at = r.project(cx, r.heightAt(Math.min(W - 1, Math.floor(cx)), Math.min(H - 1, Math.floor(cy))), -cy);
    if (!at.visible) return null;
    return (
      <div class="collab-presence" aria-hidden="true">
        <span class={`collab-cursor who-${p.role}`} style={{ left: `${at.x}px`, top: `${at.y}px` }}>
          <svg viewBox="0 0 16 20" width="16" height="20">
            <path d="M1 1 L1 15 L5 11.5 L8 18 L10.5 16.8 L7.6 10.6 L13 10.4 Z" />
          </svg>
          <span class="collab-tag">
            {p.name}
            {p.tool ? <span class="collab-tool">{p.tool}</span> : null}
          </span>
        </span>
      </div>
    );
  }

  return { together, collab: state, presenceMarkers, collabStale };
}
