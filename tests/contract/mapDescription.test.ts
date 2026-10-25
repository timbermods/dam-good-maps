// The map's description (the game shows it with the map): written by the player with the `setDescription`
// operation, refused with a one-line reason when it can't be (never cut short, D342), undone like any
// operation, saved in the project and reopened byte for byte (D455), written into the exported .timber, and
// carried between collaborating players like any operation. A map whose player wrote none has a generated
// one, in a player's words and without the retired "designed for" (D449).

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { descriptionProblem, MAX_DESCRIPTION } from "../../src/core/doc/description";
import { MapSession } from "../../src/core/doc/session";
import { readTimber, writeTimber } from "../../src/core/format/timber";
import { generate } from "../../src/core/gen/generate";
import { mapSays } from "../../src/core/gen/names";
import { generatedThemeOf } from "../../src/core/gen/pack";
import { THEMES, makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { NO_BADWATER_NOTE } from "../../src/core/resources/badwater";
import { NO_SOURCES_NOTE } from "../../src/core/gen/pack";
import { TALL_NOTE } from "../../src/core/format/world";
import { act, expectIdentical, GUEST, HOST, mapProject, sit } from "./collabFixtures";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const W = 96;
const set = (text: string) => ({ op: "setDescription" as const, params: { text } });
const described = (bytes: Uint8Array) => String(readTimber(bytes).metadata?.MapDescription ?? "");

let r: ReturnType<typeof generate>;
beforeAll(() => {
  r = generate(makeSpec({ seed: 7, theme: "riverValley", size: { x: W, y: W } }));
});

describe("writing the description", () => {
  it("sets it, and the exported .timber carries it whole", () => {
    const s = MapSession.fromGenerated(r);
    expect(s.description().written).toBe(false);
    const done = s.apply(set("A quiet valley.\nBuild upstream first."));
    expect(done.ok).toBe(true);
    expect(done.errors).toEqual([]);
    expect(s.description()).toEqual({ text: "A quiet valley.\nBuild upstream first.", written: true, kept: null });
    expect(described(s.exportTimber().bytes)).toBe("A quiet valley.\nBuild upstream first.");
    expect(s.history().map((h) => h.label)).toEqual(["Write the description"]);
  });

  it("changes nothing on the map: no ground, water or object, and no rebuild", () => {
    const s = MapSession.fromGenerated(r);
    const built = s.built;
    s.apply(set("Hello."));
    expect(s.built).toBe(built);
    const before = readTimber(MapSession.fromGenerated(r).exportTimber().bytes);
    const after = readTimber(s.exportTimber().bytes);
    expect(after.world).toEqual(before.world);
  });

  it("empty text takes it away, and the generated description is written again", () => {
    const s = MapSession.fromGenerated(r);
    const generated = described(s.exportTimber().bytes);
    s.apply(set("Mine."));
    expect(s.apply(set("")).ok).toBe(true);
    expect(s.description().written).toBe(false);
    expect(described(s.exportTimber().bytes)).toBe(generated);
    expect(s.history().map((h) => h.label)).toEqual(["Write the description", "Clear the description"]);
  });

  it("undoes and redoes like any operation", () => {
    const s = MapSession.fromGenerated(r);
    const generated = described(s.exportTimber().bytes);
    s.apply(set("One."));
    s.apply(set("Two."));
    expect(s.undo()).toBe(true);
    expect(s.description().text).toBe("One.");
    expect(s.undo()).toBe(true);
    expect(s.description().written).toBe(false);
    expect(described(s.exportTimber().bytes)).toBe(generated);
    expect(s.redo()).toBe(true);
    expect(s.redo()).toBe(true);
    expect(described(s.exportTimber().bytes)).toBe("Two.");
  });

  it("is refused with a one-line reason, never cut short or changed", () => {
    const s = MapSession.fromGenerated(r);
    const long = "x".repeat(MAX_DESCRIPTION + 1);
    const tooLong = s.apply(set(long));
    expect(tooLong.ok).toBe(false);
    expect(tooLong.errors).toEqual([`A description holds up to ${MAX_DESCRIPTION} characters; this one has ${MAX_DESCRIPTION + 1}`]);
    expect(s.apply(set("x".repeat(MAX_DESCRIPTION))).ok).toBe(true);
    expect(s.apply(set("   \n ")).errors).toEqual(["A description of only spaces says nothing: leave it empty to use the generated one"]);
    expect(s.apply(set("bell\u0007")).errors).toEqual(["A description holds text and line breaks only"]);
    expect(s.apply(set("x".repeat(MAX_DESCRIPTION))).errors).toEqual(["That is already the description"]);
    const bare = MapSession.fromGenerated(r);
    expect(bare.apply(set("")).errors).toEqual(["The map has no written description to take away"]);
    expect(bare.apply({ op: "setDescription", params: { text: 5 } } as never).ok).toBe(false);
    expect(bare.apply({ op: "setDescription", params: { text: "a", extra: 1 } } as never).ok).toBe(false);
    // refused, nothing was applied: the history holds only what was accepted
    expect(bare.history()).toEqual([]);
    expect(descriptionProblem("fine", null)).toBeNull();
    // (it counts characters, not the bytes or code units of an emoji)
    expect(descriptionProblem("🦫".repeat(MAX_DESCRIPTION), null)).toBeNull();
  });

  it("a tall map keeps its note after the player's words", () => {
    const s = MapSession.fromGenerated(generate(makeSpec({ seed: 7, theme: "highlands", size: { x: W, y: W } })));
    s.apply({ op: "sculpt", params: { mode: "flatten", cells: [[10, 10, 14]], level: 20 } });
    s.apply(set("A tall one."));
    const text = described(s.exportTimber().bytes);
    expect(text.startsWith("A tall one.")).toBe(true);
    expect(text).toMatch(/map editor/);
  });
});

describe("the notes a written description keeps", () => {
  const withSettings = (hazards: object, water: object = {}) => {
    const spec = makeSpec({ seed: 22, size: { x: W, y: W } });
    return generate({ ...spec, settings: { ...spec.settings, hazards: { ...spec.settings.hazards, ...hazards }, water: { ...spec.settings.water, ...water } } });
  };

  it("No badwater (D200) follows the player's words, and the field shows the generated words without it", () => {
    const s = MapSession.fromGenerated(withSettings({ badwater: "off" }));
    const before = s.description();
    expect(before.written).toBe(false);
    expect(before.kept).toBe(NO_BADWATER_NOTE);
    expect(before.text).not.toContain(NO_BADWATER_NOTE);
    expect(described(s.exportTimber().bytes)).toContain(NO_BADWATER_NOTE);
    s.apply(set("My dry valley."));
    expect(s.description()).toEqual({ text: "My dry valley.", written: true, kept: NO_BADWATER_NOTE });
    expect(described(s.exportTimber().bytes)).toBe(`My dry valley.

${NO_BADWATER_NOTE}`);
    // (the player who wrote the note themselves does not get it twice)
    s.apply(set(`Mine. ${NO_BADWATER_NOTE}`));
    expect(described(s.exportTimber().bytes)).toBe(`Mine. ${NO_BADWATER_NOTE}`);
  });

  it("Sources: None (D330) follows the player's words", () => {
    const s = MapSession.fromGenerated(withSettings({}, { sources: "none" }));
    expect(s.description().kept).toBe(NO_SOURCES_NOTE);
    s.apply(set("Place your own water."));
    expect(described(s.exportTimber().bytes)).toBe(`Place your own water.

${NO_SOURCES_NOTE}`);
  });

  it("the last badwater spring removed (D213) is noted after the player's words", () => {
    const s = MapSession.fromGenerated(r);
    const springs = s.built.entities.filter((e) => e.template === "BadwaterSource").map((e) => e.id);
    expect(springs.length).toBeGreaterThan(0);
    expect(s.apply({ op: "deleteEntities", params: { entities: springs } }).ok).toBe(true);
    s.apply(set("No badwater here now."));
    expect(s.description().kept).toBe(NO_BADWATER_NOTE);
    expect(described(s.exportTimber().bytes)).toBe(`No badwater here now.

${NO_BADWATER_NOTE}`);
  });

  it("a tall map's note is shown as kept too", () => {
    const s = MapSession.fromGenerated(generate(makeSpec({ seed: 7, theme: "highlands", size: { x: W, y: W } })));
    s.apply({ op: "sculpt", params: { mode: "flatten", cells: [[10, 10, 14]], level: 20 } });
    expect(s.description().kept).toBe(TALL_NOTE);
    expect(s.description().text).not.toMatch(/map editor/);
    s.apply(set("Tall."));
    expect(described(s.exportTimber().bytes)).toBe(`Tall.

${TALL_NOTE}`);
  });
});

describe("saved in the project", () => {
  it("reopens byte for byte, and writes the same .timber", () => {
    const s = MapSession.fromGenerated(r);
    s.apply({ op: "sculpt", params: { mode: "raise", cells: [[4, 4, 9]], amount: 1 } });
    s.apply(set("Written before the second edit."));
    s.apply({ op: "sculpt", params: { mode: "raise", cells: [[20, 20, 24]], amount: 1 } });
    s.apply(set("A second thought."));
    const saved = s.project();
    const reopened = MapSession.open(decodeProject(saved));
    expect(reopened.description().text).toBe("A second thought.");
    expect(sha(reopened.exportTimber().bytes)).toBe(sha(s.exportTimber().bytes));
    expect(sha(reopened.project())).toBe(sha(saved));
    // (and a replay of the log, as the checks do, makes the same map)
    expect(reopened.checkReplay()).toBe(true);
    expect(reopened.history().map((h) => h.label)).toEqual(["Raise terrain", "Write the description", "Raise terrain", "Write the description"]);
    // undo reaches the earlier description after the reopen too
    reopened.undo();
    expect(reopened.description().text).toBe("Written before the second edit.");
  });

  it("a cleared description reopens cleared", () => {
    const s = MapSession.fromGenerated(r);
    s.apply(set("Gone soon."));
    s.apply(set(""));
    const reopened = MapSession.open(decodeProject(s.project()));
    expect(reopened.description().written).toBe(false);
    expect(sha(reopened.exportTimber().bytes)).toBe(sha(MapSession.fromGenerated(r).exportTimber().bytes));
  });
});

describe("an opened .timber", () => {
  it("shows its own description, replaces it when one is written, and keeps a real place's credits", () => {
    const file = readTimber(MapSession.fromGenerated(r).exportTimber().bytes);
    const credits = "Made with Dam Good Maps from public elevation data: Somewhere. The data providers do not endorse this map.";
    file.metadata = { ...file.metadata!, MapDescription: `Inspired by the land near Somewhere; not a replica.\n\n${credits}` };
    const s = MapSession.importMap(writeTimber(file), "somewhere.timber", "near-somewhere");
    expect(s.description()).toEqual({ text: "Inspired by the land near Somewhere; not a replica.", written: false, kept: credits });
    s.apply(set("My own words."));
    expect(described(s.exportTimber().bytes)).toBe(`My own words.\n\n${credits}`);
    const plain = readTimber(MapSession.fromGenerated(r).exportTimber().bytes);
    plain.metadata = { ...plain.metadata!, MapDescription: "From the game's editor." };
    const t = MapSession.importMap(writeTimber(plain), "plain.timber");
    expect(t.description()).toEqual({ text: "From the game's editor.", written: false, kept: null });
    t.apply(set("Replaced."));
    expect(described(t.exportTimber().bytes)).toBe("Replaced.");
    t.undo();
    expect(described(t.exportTimber().bytes)).toBe("From the game's editor.");
  });
});

describe("the generated description", () => {
  const retired = JSON.parse(readFileSync("tools/retired-terms.json", "utf8")) as { terms: { term: string }[]; patterns: { pattern: string }[] };
  const norm = (t: string) => t.toLowerCase().replace(/[`*]/g, "").replace(/[-_\s]+/g, " ");

  it("is short, plain and player-facing: its size, its theme, what it shows, and its credit", () => {
    const d = described(r.bytes);
    expect(d.startsWith(`A ${W}×${W} River Valley map.`)).toBe(true);
    expect(d.endsWith(`, seed 7.`)).toBe(true);
    expect(d).not.toMatch(/designed for/i);
    for (const line of r.says ?? []) expect(d).toContain(line);
    expect(d.length).toBeLessThan(MAX_DESCRIPTION);
    // the editor's session writes the same
    expect(described(MapSession.fromGenerated(r).exportTimber().bytes)).toBe(d);
    expect(MapSession.fromGenerated(r).description()).toEqual({ text: d, written: false, kept: null });
  });

  it("says what the map shows: the standout's line first, two lines at most", () => {
    const ids = r.intentions.filter((x) => x.ok);
    expect(r.says?.length).toBeGreaterThan(0);
    expect(r.says!.length).toBeLessThanOrEqual(2);
    expect(mapSays(r.intentions)).toEqual(r.says);
    expect(mapSays([])).toEqual([]);
    expect(mapSays([{ id: "oxbow", ok: false }])).toEqual([]);
    // (an intention that gave no line of its own is said in general words; the first of Kyler's goes first)
    expect(mapSays([{ id: "two-ways", ok: true }, { id: "oxbow", ok: true, say: "An oxbow." }, { id: "snaking-river", ok: true, say: "A snake." }])).toEqual(["A snake.", "Two ways to grow: open farmland one way, wood and ruins up the cliffs the other."]);
    expect(ids.length).toBeGreaterThan(0);
  });

  it("holds no retired term, for every theme, and still tells its theme to the checks", () => {
    for (const theme of THEMES) {
      const m = generate(makeSpec({ seed: 3, theme: theme as ThemeId, size: { x: W, y: W } }));
      const d = described(m.bytes);
      const n = norm(d);
      for (const t of retired.terms) expect(n, `${theme}: ${t.term}`).not.toContain(norm(t.term));
      for (const p of retired.patterns) expect(new RegExp(p.pattern).test(n), `${theme}: ${p.pattern}`).toBe(false);
      expect(generatedThemeOf(d), theme).toBe(theme);
    }
  });

  it("reads the old opening of a file made before D449 too", () => {
    expect(generatedThemeOf("Lake Basin, 128×128, designed for hard. Its land … Made with Dam Good Maps 0.8.9, seed 7.")).toBe("lakeBasin");
    expect(generatedThemeOf("A 96×96 Islands map. Made with Dam Good Maps 0.9.0, seed 3.")).toBe("islands");
    expect(generatedThemeOf("A 96×96 map. Made with Dam Good Maps 0.9.0, seed 3.")).toBe("any");
    expect(generatedThemeOf("My own words. Made with Dam Good Maps 0.9.0, seed 3.")).toBe(null);
  });
});

describe("between collaborating players", () => {
  it("is ordered by the host and applied alike by every player, undone by its author, and refused with the one-line reason", () => {
    const t = sit(mapProject(5, "highlands", 48));
    const first = act(t, GUEST, { kind: "edit", label: "Write the description", ops: [set("Written by the guest.")] });
    expect(first.kind).toBe("commit");
    expectIdentical(t, "a description written");
    expect(t.host.session.description()).toMatchObject({ text: "Written by the guest.", written: true });
    for (const g of t.guests.values()) expect(g.session.description().text).toBe("Written by the guest.");
    // its author takes it back: every player has the generated one again
    const undone = act(t, GUEST, { kind: "undo", target: first.kind === "commit" ? first.entry.seq : 0 });
    expect(undone.kind).toBe("commit");
    expectIdentical(t, "a description taken back");
    expect(t.host.session.description().written).toBe(false);
    // the host writes its own
    expect(act(t, HOST, { kind: "edit", label: "Write the description", ops: [set("Rewritten by the host.")] }).kind).toBe("commit");
    expectIdentical(t, "a description rewritten");
    for (const g of t.guests.values()) expect(g.session.description().text).toBe("Rewritten by the host.");
    // a refusal travels as the one-line reason
    const bad = act(t, HOST, { kind: "edit", label: "Write the description", ops: [set("x".repeat(MAX_DESCRIPTION + 1))] });
    expect(bad.kind).toBe("reject");
    expect(JSON.stringify(bad)).toMatch(/holds up to 600 characters/);
  });
});
