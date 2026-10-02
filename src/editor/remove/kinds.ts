// The kinds of thing Delete takes.

import type { RemoveKind } from "../../core/features/objects";

/** Delete takes every kind (D288): objects, sources and the start (D323 item 44). */
export const ALL_KINDS: RemoveKind[] = ["trees", "bushes", "ruins", "objects", "slopes", "sources", "start"];
