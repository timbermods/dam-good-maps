// A dying plant's form (render3d/dying.ts, D242 as amended 2026-10-29): the game's `#Dying` model is its living one with
// the foliage turned to the game's dry colour and drawn in; ours are made the same way from our own models, in every
// look, and the flag moves a plant between the forms without the forest being made again.

import { describe, expect, it } from "vitest";
import { ShaderMaterial } from "three";
import { buildEntities, modelKeyOf, modelOf } from "../../src/render3d/entities3d";
import { DRYING, dryColour, isFoliage } from "../../src/render3d/dying";
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
});
