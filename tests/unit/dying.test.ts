// A dying plant's form (render3d/dying.ts, D242 as amended 2026-10-29): the game's `#Dying` model is its living one with
// the foliage turned to the game's dry colour and drawn in; ours are made the same way from our own models, in every
// look, and the flag moves a plant between the forms without the forest being made again.

import { describe, expect, it } from "vitest";
import { ShaderMaterial } from "three";
import { buildEntities, modelKeyOf, modelOf } from "../../src/render3d/entities3d";
import { DEAD_FORM, deadLeaves, DRYING, dryColour, isFoliage } from "../../src/render3d/dying";
import { DEAD, DYING, entityView } from "../../src/render3d/model";
import { Forest } from "../../src/render3d/high/forest";
import { model, paletteDefaults, slots, WARM_SUN } from "../../src/render3d/high/models";
import { SUNLIGHT } from "../../src/render3d/high/highLook";

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

  it("High's dying models: foliage in its dying slot, the game's dry colour at the living slot's lightness, as High's warm sun lights both", () => {
    for (const [slot, species] of [["pine", "Pine"], ["birch", "Birch"], ["oak", "Oak"], ["bush", "BlueberryBush"]] as const) {
      const dry = `${slot}Dry` as keyof typeof paletteDefaults;
      const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
      // (as lit by High's warm sun: its albedo has the sun's tint taken out, below)
      const lit = (h: string) => hex(h).map((c, k) => c * WARM_SUN[k]);
      expect(luma(lit(paletteDefaults[dry])) / luma(lit(paletteDefaults[slot])), slot).toBeCloseTo(luma(DRYING[species].dry) / luma(DRYING[species].alive), 1);
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

  it("High's dying and dead colours are the game's as they read under High's warm sun (its tint taken out of the albedo)", () => {
    expect([...WARM_SUN]).toEqual([...SUNLIGHT.sun]);
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    for (const [slot, species] of [["pine", "Pine"], ["oak", "Oak"], ["birch", "Birch"]] as const) {
      const lit = hex(paletteDefaults[`${slot}Dry`]).map((c, k) => c * WARM_SUN[k]);
      const d = DRYING[species].dry;
      // lit, the game's hue (to the hex colour's rounding)
      expect(lit[0] / lit[1], slot).toBeCloseTo(d[0] / d[1], 1);
      expect(lit[2] / lit[1], slot).toBeCloseTo(d[2] / d[1], 1);
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
    expect(colours("Pine.dead").has([0.36 * 1.25, 0.25 * 1.43, 0.16 * 1.6].map((c) => c.toFixed(3)).join(","))).toBe(true);
    const bush = colours("BlueberryBush.dead");
    expect(bush.size).toBe(1);
    expect([...bush][0]).toBe(deadLeaves("BlueberryBush", [0.14, 0.29, 0.14]).map((c) => c.toFixed(3)).join(","));
    const regions = new Set(Array.from(model("BlueberryBush", 0, "near", "dead").getAttribute("region").array as Float32Array));
    expect(regions.has(slots.indexOf("berry"))).toBe(false);
    expect(regions.has(slots.indexOf("bushDead"))).toBe(true);
  });
});
