// The editor (EDITOR_PLAN §3, PLAN §20 D184): the map fills the screen in the shared 3D view; the
// top bar shapes the land and the water (the brushes, the forces, Select), the left shelf places the
// game's objects (each with its ghost under the pointer), the view buttons show the overlays;
// undo, redo, history, the map's health and export always visible. The document itself lives in
// the worker (src/worker/session.ts): every edit is an operation sent there, and only what changed
// comes back.
//
// Every edit is live (D179): a stroke, a click or a drag is applied at once, one undo step. After
// every edit the instant checks come back with it; the problems it made are shown at once with
// their fixes.
//
// The code is in feature folders, one hook per feature (src/editor/README.md); this file only builds the bag
// and calls them in order.

import type { Remote } from "comlink";
import type { GeneratorApi } from "../worker/generator.worker";
import type { SessionInfo, SessionOpen } from "../worker/session";
import type { Ed } from "./ed";
import type { DrawerModel } from "./Drawer";
import { useSession } from "./session/useSession";
import { usePaint } from "./paint/usePaint";
import { useView } from "./view/useView";
import { useSourcePointer } from "./sources/useSourcePointer";
import { useMarkers } from "./sources/useMarkers";
import { useStartHint } from "./start/useStartHint";
import { useRemoveSources } from "./sources/useRemoveSources";
import { useShelf } from "./shelf/useShelf";
import { useDelete } from "./remove/useDelete";
import { useForcePrefs } from "./forces/useForcePrefs";
import { useForceRun } from "./forces/useForceRun";
import { useForcePointer } from "./forces/useForcePointer";
import { useRows } from "./rows/useRows";
import { useReady } from "./view/useReady";
import { useSelect } from "./selection/useSelect";
import { useViewSync } from "./view/useViewSync";
import { useStart } from "./start/useStart";
import { useKeyboard } from "./keyboard/useKeyboard";
import { useTestHook } from "./testHook/useTestHook";
import { useSave } from "./save/useSave";
import { editorView } from "./render/editorView";

export interface EditorProps {
  api: Remote<GeneratorApi>;
  opened: SessionOpen;
  /** After every change (autosave keys on `info.version`). */
  onChange(info: SessionInfo): void;
  /** Open another file (the page confirms before replacing unsaved work). */
  onOpenFile(file: File): void;
  /** Said in the header's second line when this browser can't keep the map (Your maps). */
  saveState: string;
  /** The map's name as the page keeps it (the drawer renames it; Save to Timberborn uses it). */
  name: string;
  /** The New map drawer: what it shows, whether it is open, and its switch (the page keeps it open across maps). */
  drawer: DrawerModel;
  drawerOpen: boolean;
  onDrawer(open: boolean): void;
}

export default function Editor(props: EditorProps) {
  const ed = {} as Ed;
  Object.assign(ed, useSession(ed, props));
  Object.assign(ed, usePaint(ed, props));
  Object.assign(ed, useView(ed));
  Object.assign(ed, useSourcePointer(ed));
  Object.assign(ed, useMarkers(ed));
  Object.assign(ed, useStartHint(ed));
  Object.assign(ed, useRemoveSources(ed));
  Object.assign(ed, useShelf(ed));
  Object.assign(ed, useDelete(ed));
  Object.assign(ed, useForcePrefs(ed));
  Object.assign(ed, useForceRun(ed));
  Object.assign(ed, useForcePointer(ed));
  Object.assign(ed, useRows(ed));
  Object.assign(ed, useReady(ed));
  Object.assign(ed, useSelect(ed));
  Object.assign(ed, useViewSync(ed));
  Object.assign(ed, useStart(ed));
  useKeyboard(ed, props);
  Object.assign(ed, useTestHook(ed));
  Object.assign(ed, useSave(ed, props.name));

  return editorView(ed, props);
}
