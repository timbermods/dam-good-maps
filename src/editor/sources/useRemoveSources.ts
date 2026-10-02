// The sources in the objects picked on a tile, and removing them.

import type { EntityInfo } from "../../worker/session";
import type { Ed } from "../ed";

export interface RemoveSourcesSlice {
  pickedSources: () => EntityInfo[];
  removeSources: (list: EntityInfo[]) => void;
}

export function useRemoveSources(ed: Ed): RemoveSourcesSlice {
  const { api, feel, setPicked, pickedRef, run } = ed;

  /** The sources in the objects picked on a tile (a click on a source). */
  function pickedSources(): EntityInfo[] {
    return pickedRef.current?.list.filter((e) => e.template === "WaterSource" || e.template === "BadwaterSource") ?? [];
  }

  /** Remove sources: their water recedes live; one undo step. */
  function removeSources(list: EntityInfo[]) {
    const bad = list.every((e) => e.template === "BadwaterSource");
    void run(
      () => api.apply({ op: "deleteEntities", params: { entities: list.map((e) => e.id) } }, "user", list.length > 1 ? `Remove ${list.length} sources` : bad ? "Remove a badwater source" : "Remove a water source"),
      (u) => {
        if (!u.ok) return;
        setPicked(null);
        for (const e of list) feel("remove", e.x, e.y);
      },
    );
  }

  return { pickedSources, removeSources };
}
