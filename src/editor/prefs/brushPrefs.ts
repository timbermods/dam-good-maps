// The brush the viewer last used, kept between visits.

import { BRUSHES, DEFAULT_BRUSH, type BrushMode, type BrushSettings, type BrushTool, type SourcesChoice } from "../brushes";

export const BRUSH_KEY = "dgm.brush";

/** The brush the viewer last used: its size and strength, and each brush's mode and sources choice
 *  (D322; not its target, which lasts until the tool changes). A brush saved with the old shared
 *  Clear sources on clears with every brush. */
export function loadBrush(): BrushSettings {
  try {
    const s = JSON.parse(localStorage.getItem(BRUSH_KEY) ?? "null") as (Partial<BrushSettings> & { clearSources?: boolean }) | null;
    if (!s) return DEFAULT_BRUSH;
    const pick = <T extends string>(saved: unknown, fallback: Record<BrushTool, T>, ok: readonly T[]): Record<BrushTool, T> => {
      const out = { ...fallback };
      if (saved && typeof saved === "object") for (const b of BRUSHES) {
        const v = (saved as Record<string, unknown>)[b.tool];
        if (typeof v === "string" && (ok as readonly string[]).includes(v)) out[b.tool] = v as T;
      }
      return out;
    };
    const sources = s.clearSources === true ? { raise: "clear", lower: "clear", flatten: "clear", smooth: "clear", naturalize: "clear" } as Record<BrushTool, SourcesChoice> : DEFAULT_BRUSH.sources;
    return {
      ...DEFAULT_BRUSH,
      size: typeof s.size === "number" ? Math.min(128, Math.max(1, s.size)) : DEFAULT_BRUSH.size,
      strength: typeof s.strength === "number" ? Math.min(10, Math.max(1, Math.round(s.strength))) : DEFAULT_BRUSH.strength,
      modes: pick<BrushMode>(s.modes, DEFAULT_BRUSH.modes, ["ground", "water", "both"]),
      sources: pick<SourcesChoice>(s.sources, sources, ["ride", "keep", "clear"]),
    };
  } catch {
    return DEFAULT_BRUSH;
  }
}

export function saveBrush(s: BrushSettings): void {
  try {
    localStorage.setItem(BRUSH_KEY, JSON.stringify({ size: s.size, strength: s.strength, modes: s.modes, sources: s.sources }));
  } catch {
    // the brush lasts for this visit only
  }
}
