// The editor's test hook on window (tests/e2e read it).

import type { Remote } from "comlink";
import type { EditOp } from "../../core/doc/ops";
import type { GeneratorApi } from "../../worker/generator.worker";
import type { CheckItem, SessionInfo } from "../../worker/session";
import type { StartCheck } from "../features";
import type { ForceStatus, ForceTiming } from "../forceDriver";
import type { BrushParams } from "../../core/features/raster/brush";

export {};

declare global {
  interface Window {
    /** Test hook: the open editor (tests/e2e). */
    dgmEditor?: {
      info: () => SessionInfo;
      tileToClient(x: number, y: number): { x: number; y: number };
      idle(): Promise<void>;
      /** The problems the last edit made. */
      instant(): CheckItem[];
      /** The footprint under the pointer (an object from the shelf): its tiles, and why the game would
       *  refuse it there. */
      fit(): { tiles: number[]; problem: string | null } | null;
      /** The start's check while it moves (its footprint and the three start requirements). */
      startCheck(): StartCheck | null;
      /** An edit through the editor, as a stroke or a click would make it (tests). */
      edit(op: EditOp, label: string): Promise<void>;
      /** The worker, for timing its answers (tests/e2e/preview.spec.ts). */
      worker: Remote<GeneratorApi>;
      /** Strokes whose painted terrain differed from the worker's build (0 when all is well). */
      strokeMismatches(): number;
      /** Strokes, undos and redos on their way to the worker. */
      pendingTerrain(): number;
      /** The carve at work (D199), or null. */
      carve(): ForceStatus | null;
      /** Any force at work (D202, D203, D206), or null. */
      force(): ForceStatus | null;
      /** The last force's times from its gesture (D321, item 29): worked out, its land final as planned and as it came, kept, and its showing. */
      forceTiming(): ForceTiming | null;
      /** The last stroke painted (its operation's params), or null. */
      lastStroke(): BrushParams | null;
      /** "The start fits here" after a Flatten stroke (D204), and how long its search took. */
      startHint(): { x: number; y: number; strong: boolean; ms: number } | null;
      /** The editor's sounds (D226): the recorded bank ready, and recordings playing now. */
      sound(): { ready: boolean; playing: number } | null;
      /** What the force picked draws (D258): the stroke being painted (its tiles), the cursor's tile,
       *  and Aim's arrow (from a tile to the pointer), each null when not shown; and the side of a
       *  fault that moves (1 its left, -1 its right: V flips it, D289). */
      /** The drawn gesture on the land: its tiles and its band's half width (D344, A3; 0: a thin line). */
      gesture(): { stroke: number | null; band: number | null; cursor: [number, number] | null; side: 1 | -1; ring: number | null };
      /** The sources glowing red for Sources: Clear (D249, D322), by their corner tiles (the view draws the
       *  glow only with a GPU: this is what it asks for). */
      sourceGlow(): number[];
      /** The Select tool's selection (the working area while it is open, D259), its tiles. */
      selection(): number[];
      /** The water's pace after an edit (tests only: the page always plays it at Normal). */
      waterSpeed(speed: "slower" | "normal" | "faster" | "instant"): void;
      waterSettled(): boolean;

    };
  }
}
