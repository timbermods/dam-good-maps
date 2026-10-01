// The land at the end against the first land shown (D348), for firstLand.test.ts and its 256² share.
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";

/** The tiles where the land at the end differs from the first land shown, less the worn way out's. */
export function changedSinceShown(theme: ThemeId, seed: number, size: number): { changed: number[]; worn: number; levelled: boolean; passed: boolean } {
  let shown: Uint8Array | null = null;
  const r = generate(makeSpec({ seed, theme, size: { x: size, y: size } }), {
    onLand: (l) => {
      if (!shown) shown = l.heights.slice();
    },
  });
  const worn = new Set(r.info.worn?.cut ?? []);
  const changed: number[] = [];
  for (let i = 0; i < size * size; i++) if (r.built.heights[i] !== shown![i] && !worn.has(i)) changed.push(i);
  return { changed, worn: worn.size, levelled: (r.info.fixes ?? []).includes("levelled start"), passed: r.report.passed };
}
