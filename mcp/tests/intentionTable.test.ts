// The MCP server offers intentions by the committed table (src/core/land/intentionTable.ts): the table's shape and
// rule, the descriptions built from it, and the refusal of an intention on a theme it is not offered for. The table
// itself is held to the generator by Nightly alone (tools/intention-table.ts --check --theme, a theme a job).

import { describe, expect, it } from "vitest";
import { INTENTION_LEAST, INTENTION_SEEDS, INTENTION_SIDE, INTENTION_TABLE, intentionRefusal, offeredThemes, STYLE_THEMES } from "../../src/core/land/intentionTable";
import { INTENTIONS } from "../../src/core/land/intentions";
import { THEME_NAMES } from "../../src/core/spec/mapspec";
import { callTool, TOOLS } from "../src/server";

describe("the intention table", () => {
  it("counts every intention on every theme, and offers each where it emerged on at least the least", () => {
    const t = INTENTION_TABLE;
    expect({ side: t.side, seeds: t.seeds, least: t.least }).toEqual({ side: INTENTION_SIDE, seeds: [...INTENTION_SEEDS], least: INTENTION_LEAST });
    expect(Object.keys(t.counts).sort()).toEqual([...INTENTIONS].sort());
    for (const id of INTENTIONS) {
      expect(Object.keys(t.counts[id]).sort()).toEqual([...STYLE_THEMES].sort());
      expect(t.offered[id]).toEqual(STYLE_THEMES.filter((th) => t.counts[id][th] >= INTENTION_LEAST));
    }
  });

  it("is what generate's intentions say, and generate refuses an intention where it is not offered", async () => {
    const desc = (TOOLS.find((x) => x.name === "generate")!.inputSchema as unknown as { properties: { intentions: { description: string } } }).properties.intentions.description;
    for (const id of INTENTIONS) {
      const themes = offeredThemes(id);
      expect(desc).toContain(`${id}: `);
      expect(desc.slice(desc.indexOf(`${id}: `))).toMatch(themes.length ? new RegExp(`^[^:]*: [^]*?Offered for ${themes.map((th) => THEME_NAMES[th]).join(", ")}\\.`) : /^[^:]*: [^]*?Not offered now\./);
    }
    // each intention on a theme it is not offered for (or Any): the core's one line, word for word
    for (const id of INTENTIONS) {
      const off = STYLE_THEMES.find((th) => !offeredThemes(id).includes(th)) ?? "any";
      const r = await callTool("generate", { theme: off, size: 128, seed: 1, intentions: [id] });
      expect(r.isError, id).toBe(true);
      expect((r.content[0] as { text: string }).text).toBe(intentionRefusal(id, off));
    }
  });
});
