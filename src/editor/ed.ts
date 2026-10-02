// The editor's bag (see README.md): the intersection of every slice's members, built fresh in each render.

import type { SessionSlice } from "./session/useSession";
import type { PaintSlice } from "./paint/usePaint";
import type { ViewSlice } from "./view/useView";
import type { SourcePointerSlice } from "./sources/useSourcePointer";
import type { MarkersSlice } from "./sources/useMarkers";
import type { StartHintSlice } from "./start/useStartHint";
import type { RemoveSourcesSlice } from "./sources/useRemoveSources";
import type { ShelfSlice } from "./shelf/useShelf";
import type { DeleteSlice } from "./remove/useDelete";
import type { ForcePrefsSlice } from "./forces/useForcePrefs";
import type { ForceRunSlice } from "./forces/useForceRun";
import type { ForcePointerSlice } from "./forces/useForcePointer";
import type { RowsSlice } from "./rows/useRows";
import type { ReadySlice } from "./view/useReady";
import type { SelectSlice } from "./selection/useSelect";
import type { ViewSyncSlice } from "./view/useViewSync";
import type { StartSlice } from "./start/useStart";
import type { TestHookSlice } from "./testHook/useTestHook";
import type { SaveSlice } from "./save/useSave";

export type Ed = SessionSlice & PaintSlice & ViewSlice & SourcePointerSlice & MarkersSlice & StartHintSlice & RemoveSourcesSlice & ShelfSlice & DeleteSlice & ForcePrefsSlice & ForceRunSlice & ForcePointerSlice & RowsSlice & ReadySlice & SelectSlice & ViewSyncSlice & StartSlice & TestHookSlice & SaveSlice;
