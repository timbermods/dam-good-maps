// The MCP server offers intentions by the committed table (src/core/land/intentionTable.ts): the table's shape and
// rule, the descriptions built from it, and the refusal of an intention on a theme it is not offered for. The table
// itself is held to the generator by Nightly alone (tools/intention-table.ts --check --theme --side, a theme and a side a
// job).

import { describe, expect, it } from "vitest";
import { countedSide, INTENTION_LEAST, INTENTION_SEEDS, INTENTION_SIDES, INTENTION_TABLE, intentionRefusal, offeredThemes, STYLE_THEMES } from "../../src/core/land/intentionTable";
import { INTENTIONS } from "../../src/core/land/intentions";
import { THEME_NAMES } from "../../src/core/spec/mapspec";
import { callTool, TOOLS } from "../src/server";

describe("the intention table", () => {
  it("counts every intention on every theme at every side, and offers each at a side where it emerged on at least the least there", () => {
    const t = INTENTION_TABLE;
    expect({ sides: t.sides, seeds: t.seeds, least: t.least }).toEqual({ sides: [...INTENTION_SIDES], seeds: [...INTENTION_SEEDS], least: INTENTION_LEAST });
    expect(INTENTION_SIDES).toEqual([128, 256]);
    expect(INTENTION_LEAST).toBe(8);
    expect(Object.keys(t.counts).sort()).toEqual([...INTENTIONS].sort());
    expect(Object.keys(t.offered).sort()).toEqual(INTENTION_SIDES.map(String).sort());
    for (const id of INTENTIONS) {
      expect(Object.keys(t.counts[id]).sort()).toEqual([...STYLE_THEMES].sort());
      for (const th of STYLE_THEMES) expect(Object.keys(t.counts[id][th]).sort()).toEqual(INTENTION_SIDES.map(String).sort());
      for (const s of INTENTION_SIDES) expect(t.offered[String(s)][id]).toEqual(STYLE_THEMES.filter((th) => t.counts[id][th][String(s)] >= INTENTION_LEAST));
    }
  });

  it("gives a map the list of the smallest counted side that holds it, the largest beyond", () => {
    expect([countedSide(64, 64), countedSide(128, 128), countedSide(160, 160), countedSide(192, 96), countedSide(256, 256), countedSide(384, 384)]).toEqual([128, 128, 256, 256, 256, 256]);
    for (const id of INTENTIONS) {
      expect(offeredThemes(id, { W: 96, H: 96 })).toEqual(INTENTION_TABLE.offered["128"][id]);
      expect(offeredThemes(id, { W: 192, H: 192 })).toEqual(INTENTION_TABLE.offered["256"][id]);
    }
  });

  it("is what generate's intentions say, and generate refuses an intention where it is not offered", async () => {
    const desc = (TOOLS.find((x) => x.name === "generate")!.inputSchema as unknown as { properties: { intentions: { description: string } } }).properties.intentions.description;
    INTENTIONS.forEach((id, k) => {
      const at = INTENTION_SIDES.map((s) => ({ s, themes: offeredThemes(id, { W: s, H: s }) })).filter((x) => x.themes.length);
      expect(desc).toContain(`${id}: `);
      const words = at.length ? `Offered ${at.map(({ s, themes }) => `at ${s}² for ${themes.map((th) => THEME_NAMES[th]).join(", ")}`).join("; ")}.` : "Not offered now.";
      const next = INTENTIONS[k + 1];
      expect(desc.slice(desc.indexOf(`${id}: `), next ? desc.indexOf(` ${next}: `) : undefined)).toContain(words);
    });
    // each intention on a theme it is not offered for at the size (or Any): the core's one line, word for word
    for (const size of INTENTION_SIDES)
      for (const id of INTENTIONS) {
        const off = STYLE_THEMES.find((th) => !offeredThemes(id, { W: size, H: size }).includes(th)) ?? "any";
        const r = await callTool("generate", { theme: off, size, seed: 1, intentions: [id] });
        expect(r.isError, `${id} at ${size}`).toBe(true);
        expect((r.content[0] as { text: string }).text).toBe(intentionRefusal(id, off, { W: size, H: size }));
      }
  });
});
