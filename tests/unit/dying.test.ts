// A dying plant's form (render3d/dying.ts, D242 as amended 2026-10-29): the game's `#Dying` model is its living one with
// the foliage turned to the game's dry colour and drawn in; ours are made the same way from our own models, in every
// look, and the flag moves a plant between the forms without the forest being made again.

import { describe, expect, it } from "vitest";
import { ShaderMaterial } from "three";
import { buildEntities, modelKeyOf, modelOf } from "../../src/render3d/entities3d";
import { DEAD_FORM, DEAD_LIMBS, deadLeaves, deadWood, DRYING, dryColour, isFoliage } from "../../src/render3d/dying";
import { TREE_COLOURS } from "../../src/render3d/palette";
import { DEAD, DYING, entityView } from "../../src/render3d/model";
import { Forest } from "../../src/render3d/high/forest";
import { model, paletteDefaults, slots } from "../../src/render3d/high/models";

const luma = (c: readonly number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
/** The largest distance from the trunk of the vertices that are foliage in the living model (the same vertices in its dying
 *  form), and the dying form's colours there. */
function foliage(species: string, key: string): { reach: number; colours: [number, number, number][] } {
  const alive = modelOf(species);
  const { pos, col } = modelOf(key);
  let reach = 0;
  const colours: [number, number, number][] = [];
  for (let v = 0; v < pos.length; v += 3) {
    if (!isFoliage([alive.col[v], alive.col[v + 1], alive.col[v + 2]]) && !species.startsWith("Succulent")) continue;
    colours.push([col[v], col[v + 1], col[v + 2]]);
    reach = Math.max(reach, Math.hypot(pos[v], pos[v + 2]));
  }
  return { reach, colours };
}

describe("a dying plant's form, the game's way", () => {
  it("takes the game's dry foliage colour at our green's own lightness, and leaves bark and fruit as they are", () => {
    for (const species of ["Pine", "Birch", "Oak", "BlueberryBush"]) {
      const d = DRYING[species];
      const green: [number, number, number] = [0.2, 0.45, 0.18];
      const dry = dryColour(species, green);
      // the game's hue: red over green over blue in the game's own proportions
      expect(dry[0] / dry[1], species).toBeCloseTo(d.dry[0] / d.dry[1], 5);
      expect(dry[2] / dry[1], species).toBeCloseTo(d.dry[2] / d.dry[1], 5);
      // at our lightness, by as much as the game's dry foliage is lighter or darker than its living
      expect(luma(dry) / luma(green), species).toBeCloseTo(luma(d.dry) / luma(d.alive), 5);
      expect(dryColour(species, [0.36, 0.25, 0.16])).toEqual([0.36, 0.25, 0.16]);
      expect(dryColour(species, [0.46, 0.56, 1.0])).toEqual([0.46, 0.56, 1.0]);
    }
    // the succulent turns only a little browner, as the game's does
    const c = dryColour("Succulent", [0.37, 0.53, 0.29]);
    expect(c[0] / 0.37).toBeCloseTo(0.29 / 0.308, 5);
    expect(c[2] / 0.29).toBeCloseTo(0.12 / 0.157, 5);
  });

  it("Standard's and the light look's dying models: the same parts, foliage dry and drawn in as the game's", () => {
    for (const species of Object.keys(DRYING)) {
      const alive = modelOf(species);
      const dying = modelOf(`${species}.dying`);
      expect(dying.pos.length, species).toBe(alive.pos.length);
      const a = foliage(species, species);
      const d = foliage(species, `${species}.dying`);
      expect(a.colours.length, species).toBeGreaterThan(0);
      expect(d.reach, species).toBeCloseTo(a.reach * DRYING[species].reach, 5);
      if (DRYING[species].mode === "hue") expect(d.colours.some(isFoliage), species).toBe(false);
    }
  });

  it("is drawn while the plant is dying and not dead: the flag picks the model, dead over dying", () => {
    expect(modelKeyOf("Pine", DYING)).toBe("Pine.dying");
    expect(modelKeyOf("Pine", DYING | DEAD)).toBe("Pine.dead");
    expect(modelKeyOf("Succulent", DYING)).toBe("Succulent.dying");
    expect(modelKeyOf("Maple", DYING)).toBe(modelKeyOf("Maple", 0));
    const at = (template: string) => ({ template, x: 1, y: 1, z: 2, orientation: "Cw0", owner: "f" });
    const v = entityView([at("Pine"), at("Oak")]);
    v.flags[0] |= DYING;
    const names = (lite: boolean) => buildEntities(v, new ShaderMaterial(), null, 0, lite).group.children.map((c) => c.name).sort();
    expect(names(false)).toEqual(["Oak", "Pine.dying"]);
    expect(names(true)).toEqual(["Oak.lite", "Pine.dying.lite"]);
  });

  it("High's dying models: foliage in its dying slot, the game's dry colour at the living slot's lightness", () => {
    for (const [slot, species] of [["pine", "Pine"], ["birch", "Birch"], ["oak", "Oak"], ["bush", "BlueberryBush"]] as const) {
      const dry = `${slot}Dry` as keyof typeof paletteDefaults;
      const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
      // (High's objects are in the game's light, as Standard's: D135 as amended 2026-11-09, so the albedos compare as they are)
      expect(luma(hex(paletteDefaults[dry])) / luma(hex(paletteDefaults[slot])), slot).toBeCloseTo(luma(DRYING[species].dry) / luma(DRYING[species].alive), 1);
      const regions = (g: ReturnType<typeof model>) => new Set(Array.from(g.getAttribute("region").array as Float32Array));
      const living = regions(model(species, 0, "near", "alive"));
      const dying = regions(model(species, 0, "near", "dying"));
      expect(living.has(slots.indexOf(slot)), slot).toBe(true);
      expect(dying.has(slots.indexOf(slot)), slot).toBe(false);
      expect(dying.has(slots.indexOf(dry)), slot).toBe(true);
    }
  });

  it("a plant moves between alive, dying and dead in place: the forest is not made again", () => {
    const plants = [
      { template: "Pine", x: 2, y: 2, z: 2, orientation: "Cw0", owner: "t" },
      { template: "Birch", x: 4, y: 2, z: 2, orientation: "Cw0", owner: "t" },
    ];
    const view = entityView(plants);
    const f = new Forest(view, new ShaderMaterial());
    f.layout();
    const flags = view.flags.slice();
    flags[0] |= DYING;
    expect(f.setState(flags)).toBe(1);
    const shown = () => f.meshes.filter((m) => m.count > 0).map((m) => m.name.replace(/\.(near|far)\.\d$/, "")).sort();
    expect(shown()).toEqual(["high.Birch", "high.Pine.dying"]);
    flags[0] = DEAD;
    expect(f.setState(flags)).toBe(1);
    expect(shown()).toEqual(["high.Birch", "high.Pine.dead"]);
    expect(f.setState(flags)).toBe(0);
  });

  it("High's dying colours are the game's hue, as Standard's: both looks light objects with the game's light", () => {
    // (until 2026-11-09 High lit its trees by its own warm sun and took its tint out of their albedo; D135 as amended then
    // lights every object in both looks with the game's light, so High's albedo is Standard's)
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    for (const [slot, species] of [["pine", "Pine"], ["oak", "Oak"], ["birch", "Birch"]] as const) {
      const c = hex(paletteDefaults[`${slot}Dry`]);
      const d = DRYING[species].dry;
      // the game's hue (to the hex colour's rounding)
      expect(c[0] / c[1], slot).toBeCloseTo(d[0] / d[1], 1);
      expect(c[2] / c[1], slot).toBeCloseTo(d[2] / d[1], 1);
    }
  });
});

describe("a dead plant's form, by the game's numbers", () => {
  const height = (pos: ArrayLike<number>) => {
    let h = 0;
    for (let v = 1; v < pos.length; v += 3) h = Math.max(h, pos[v]);
    return h;
  };
  it("stands at the game's height for it, dead ÷ alive, in Standard, the light look and High", () => {
    for (const species of Object.keys(DEAD_FORM)) {
      expect(height(modelOf(`${species}.dead`).pos) / height(modelOf(species).pos), species).toBeCloseTo(DEAD_FORM[species].height, 2);
    }
    for (const species of ["Pine", "Birch", "Oak", "BlueberryBush"] as const)
      for (const detail of ["near", "far"] as const) {
        const h = (state: "alive" | "dead") => height(model(species, 0, detail, state).getAttribute("position").array as Float32Array);
        expect(h("dead") / h("alive"), `${species} ${detail}`).toBeCloseTo(DEAD_FORM[species].height, 2);
      }
  });
  it("is its own bark weathered as the game's, and a dead bush keeps its leaves, gone brown, without its berries", () => {
    const colours = (key: string) => {
      const { col } = modelOf(key);
      const out = new Set<string>();
      for (let v = 0; v < col.length; v += 3) out.add([col[v], col[v + 1], col[v + 2]].map((c) => c.toFixed(3)).join(","));
      return out;
    };
    // the pine's pole: its bark × the game's dead-wood ratio, lighter than the living crowns
    const bark = TREE_COLOURS.pineBark;
    expect(colours("Pine.dead").has([bark[0] * 1.25, bark[1] * 1.43, bark[2] * 1.6].map((c) => c.toFixed(3)).join(","))).toBe(true);
    const bush = colours("BlueberryBush.dead");
    expect(bush.size).toBe(1);
    expect([...bush][0]).toBe(deadLeaves("BlueberryBush", TREE_COLOURS.bush).map((c) => c.toFixed(3)).join(","));
    const regions = new Set(Array.from(model("BlueberryBush", 0, "near", "dead").getAttribute("region").array as Float32Array));
    expect(regions.has(slots.indexOf("berry"))).toBe(false);
    expect(regions.has(slots.indexOf("bushDead"))).toBe(true);
  });
  it("High's bark and dead wood are the game's (TREE_COLOURS), as Standard's are: the pine's, the oak's and the birch's each its own", () => {
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    // (High's albedo is Standard's: both looks light objects with the game's light, D135 as amended 2026-11-09)
    const same = (slot: keyof typeof paletteDefaults, want: readonly number[]) => hex(paletteDefaults[slot]).forEach((c, k) => expect(Math.abs(c - want[k]), slot).toBeLessThanOrEqual(0.5 / 255 + 1e-9));
    same("bark", TREE_COLOURS.pineBark);
    same("oakBark", TREE_COLOURS.oakBark);
    same("dead", deadWood("Pine", TREE_COLOURS.pineBark));
    same("oakDead", deadWood("Oak", TREE_COLOURS.oakBark));
    same("birchBark", TREE_COLOURS.birchBark);
    same("birchDead", deadWood("Birch", TREE_COLOURS.birchBark));
    // each tree draws its own: High's slots, and Standard's colours
    const regions = (species: "Pine" | "Oak", state: "alive" | "dead") => new Set(Array.from(model(species, 0, "near", state).getAttribute("region").array as Float32Array));
    for (const [species, alive, dead, other] of [["Pine", "bark", "dead", "oakBark"], ["Oak", "oakBark", "oakDead", "bark"]] as const) {
      expect(regions(species, "alive").has(slots.indexOf(alive)), species).toBe(true);
      expect(regions(species, "alive").has(slots.indexOf(other)), species).toBe(false);
      expect(regions(species, "dead").has(slots.indexOf(dead)), species).toBe(true);
    }
    const has = (key: string, c: readonly number[]) => {
      const { col } = modelOf(key);
      for (let v = 0; v < col.length; v += 3) if (Math.abs(col[v] - c[0]) + Math.abs(col[v + 1] - c[1]) + Math.abs(col[v + 2] - c[2]) < 1e-6) return true;
      return false;
    };
    expect(has("Pine", TREE_COLOURS.pineBark)).toBe(true);
    expect(has("Oak", TREE_COLOURS.oakBark)).toBe(true);
    expect(has("Oak.dead", deadWood("Oak", TREE_COLOURS.oakBark))).toBe(true);
    expect(has("Birch", TREE_COLOURS.birchBark)).toBe(true);
    expect(has("Birch.dead", deadWood("Birch", TREE_COLOURS.birchBark))).toBe(true);
  });
});

describe("a dead tree at the game's size", () => {
  // the game's MatureDead models' wood, its surface where their textures' alpha keeps it (trunk, limbs and stubs; the
  // twig cards, a sixth kept, left out): until 2026-11-10 ours had 0.70 to 0.82 of it, half as thick, and the dead
  // birches' white read faint from the widest views (fix/dry-widest)
  const GAME_WOOD = { Pine: 1.29, Birch: 0.571, Oak: 1.646 };
  const area = (p: ArrayLike<number>) => {
    let a = 0;
    for (let v = 0; v + 8 < p.length; v += 9) {
      const [ux, uy, uz, wx, wy, wz] = [p[v + 3] - p[v], p[v + 4] - p[v + 1], p[v + 5] - p[v + 2], p[v + 6] - p[v], p[v + 7] - p[v + 1], p[v + 8] - p[v + 2]];
      a += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
    }
    return a;
  };
  it("closes its trunk's top in every look, so the ground never shows down through it", () => {
    // (straight down over the trunk's top, out to half its radius (inside the far models' three sides), every line meets
    // the wood at its top or above)
    const highest = (p: ArrayLike<number>, x: number, z: number) => {
      let top = -Infinity;
      for (let v = 0; v + 8 < p.length; v += 9) {
        const [ax, az, bx, bz, cx, cz] = [p[v], p[v + 2], p[v + 3], p[v + 5], p[v + 6], p[v + 8]];
        const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(det) < 1e-12) continue;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
        const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
        if (l1 < -1e-9 || l2 < -1e-9 || l1 + l2 > 1 + 1e-9) continue;
        top = Math.max(top, l1 * p[v + 1] + l2 * p[v + 4] + (1 - l1 - l2) * p[v + 7]);
      }
      return top;
    };
    for (const species of ["Birch", "Oak"] as const) {
      const [x, y, z, r] = DEAD_LIMBS[species][0].line.at(-1)!;
      const g = (d: "near" | "far") => {
        const m = model(species, 0, d, "dead");
        const p = m.getAttribute("position").array as Float32Array;
        return m.index ? Array.from(m.index.array as ArrayLike<number>, (i) => [p[3 * i], p[3 * i + 1], p[3 * i + 2]]).flat() : p;
      };
      // (each model's own scale upright: its trunk's top at y × its height ÷ the line's)
      const models: [string, ArrayLike<number>][] = [["standard", modelOf(`${species}.dead`).pos], ["near", g("near")], ["far", g("far")]];
      for (const [look, p] of models) {
        let h = 0;
        for (let v = 1; v < p.length; v += 3) h = Math.max(h, p[v]);
        const lineTop = Math.max(...DEAD_LIMBS[species].flatMap((l) => l.line.map((q) => q[1])));
        const k = h / lineTop;
        for (let a = 0; a < 12; a++)
          for (const f of [0, 0.25, 0.5]) {
            const at = highest(p, x + Math.cos(a) * r * f, z + Math.sin(a) * r * f);
            expect(at, `${species} ${look}`).toBeGreaterThanOrEqual((y - 0.01) * k);
          }
      }
    }
  });

  it("has the game's wood in every look, near and far", () => {
    for (const species of ["Pine", "Birch", "Oak"] as const) {
      const standard = area(modelOf(`${species}.dead`).pos);
      const high = (["near", "far"] as const).map((d) => {
        const g = model(species, 0, d, "dead");
        const p = g.getAttribute("position").array as Float32Array;
        return area(g.index ? Array.from(g.index.array as ArrayLike<number>, (i) => [p[3 * i], p[3 * i + 1], p[3 * i + 2]]).flat() : p);
      });
      for (const a of [standard, ...high]) {
        expect(a / GAME_WOOD[species], species).toBeGreaterThan(0.85);
        expect(a / GAME_WOOD[species], species).toBeLessThan(1.4);
      }
    }
  });
});
