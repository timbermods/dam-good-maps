// The editor's bag (see README.md): the intersection of every slice's members, built fresh in each render.

import type { SessionSlice } from "./session/useSession";
import type { PaintSlice } from "./paint/usePaint";
import type { ViewSlice } from "./view/useView";
import type { SourcePointerSlice } from "./sources/useSourcePointer";
import type { RestSlice } from "./Editor";

export type Ed = SessionSlice & PaintSlice & ViewSlice & SourcePointerSlice & RestSlice;
