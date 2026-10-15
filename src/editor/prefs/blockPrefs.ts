// The Block tool's settings the viewer last used, kept between visits.

import { clampSize, DEFAULT_BLOCK, type BlockSettings } from "../block/blockTool";

export const BLOCK_KEY = "dgm.block";

export function loadBlock(): BlockSettings {
  try {
    const s = JSON.parse(localStorage.getItem(BLOCK_KEY) ?? "null") as Partial<BlockSettings> | null;
    if (!s) return DEFAULT_BLOCK;
    return {
      size: typeof s.size === "number" && Number.isFinite(s.size) ? clampSize(s.size) : DEFAULT_BLOCK.size,
      shape: s.shape === "round" ? "round" : "square",
      mode: s.mode === "remove" ? "remove" : "add",
    };
  } catch {
    return DEFAULT_BLOCK;
  }
}

export function saveBlock(s: BlockSettings): void {
  try {
    localStorage.setItem(BLOCK_KEY, JSON.stringify(s));
  } catch {
    // the settings last for this visit only
  }
}
