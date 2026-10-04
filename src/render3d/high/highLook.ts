// The High look (Map look 2; PLAN §20 D147, D241, D242, D250, D283, D284): what the renderer draws
// with when the look is High. It holds the High versions of the renderer's materials (the Standard
// shaders with the High additions at their named points, shaders.ts) and everything they read: the
// sun's depth map (soft shadows), the ambient occlusion, the water's flow, the mist and rings, the
// new trees and the refreshed landmarks. The renderer swaps its materials for these while the look is
// High and back when it isn't; the Standard materials are never touched, so the Standard look stays
// exactly as it was. Every effect is a switch (effects.ts).

import { Color, Vector2, type Camera, type Group, type InstancedMesh, type Mesh, type Object3D, type Scene, type ShaderMaterial, type WebGLRenderer } from "three";
import { fallMaterial, objectMaterial, skyMaterial, terrainMaterial, waterMaterial, type SceneUniforms } from "../materials";
import type { EntityView, SurfaceWater } from "../model";
import { allEffects, effectiveEffects, type HighEffects } from "./effects";
import { AmbientField, type Baker } from "./fields";
import { Forest, replacedBatch } from "./forest";
import { buildLandmarks, disposeLandmarks, type Replacement } from "./landmarks";
import { Mist } from "./mist";
import { paletteDefaults, slots } from "./models";
import { fallHooks, landmarkHooks, objectHooks, skyHooks, slopeHooks, SWITCHES, terrainHooks, vegetationHooks, waterHooks, type Switch } from "./shaders";
import { CASTER_LAYER, SHADOW_SIZE, SunShadows } from "./shadows";

/** Warm sunlight (#65): the sun ×(1.48, 1.30, 1.10) and the sky ×0.97 of Standard's; with only the
 *  soft shadows on, #38's balance. */
const SUNLIGHT = { sun: [1.48, 1.3, 1.1], sky: 0.97 } as const;
const SHADOW_BALANCE = { sun: [1.12, 1.06, 0.97], sky: 0.83 } as const;

/** What the High look needs of the renderer. */
export interface HighHost {
  gl: WebGLRenderer;
  scene: Scene;
  uniforms: SceneUniforms;
  requestRender(): void;
  /** Whether motion is welcome (reduced motion off). */
  motion(): boolean;
  /** The falls drawn (instances of the fall template, falls.ts). */
  falls(): Iterable<Mesh>;
  /** Everything that casts a shadow: the terrain's chunks, the map's base, the objects. */
  casters(): Iterable<Object3D>;
  /** How far the ground under tile (x, y) has moved from the map's while a brush paints. */
  groundOffset(x: number, y: number): number;
  /** The renderer's bake worker. */
  baker: Baker;
  /** The moving water's textures (motion.ts): the flow with the smoothed contamination, the rough water. */
  flow(): { flow: unknown; rough: unknown; ready: boolean; ms: number };
}

export interface HighMaterials {
  terrain: ShaderMaterial;
  water: ShaderMaterial;
  fall: ShaderMaterial;
  object: ShaderMaterial;
  sky: ShaderMaterial;
}

/** The time between redraws of the sun's depth map while the land keeps changing (a brush). */
const SHADOW_EVERY = 100;
/** The mist follows the water this long after it changes (and at least this often). */
const WATER_WAIT = 250;
const WATER_MOST = 1000;

export class HighLook {
  readonly materials: HighMaterials;
  private vegetation: ShaderMaterial;
  private landmark: ShaderMaterial;
  private slope: ShaderMaterial;
  private switches = Object.fromEntries(SWITCHES.map((k) => [k, { value: 1 }])) as Record<Switch, { value: number }>;
  private sun = { value: new Color() };
  private sky = { value: new Color() };
  private vegTime = { value: 0 };
  private vegSway = { value: 1 };
  private shadows = new SunShadows();
  private ambient: AmbientField | null = null;
  readonly mist: Mist;
  private forest: Forest | null = null;
  private landmarks: Replacement[] = [];
  private objects: Group | null = null;
  /** The player's switches, and whether the lower-cost tier is on. */
  private chosen: HighEffects = allEffects();
  private lower = false;
  effects: HighEffects = allEffects();
  private map: { W: number; H: number; heights: Uint8Array; surface: SurfaceWater } | null = null;
  private lastShadow = 0;
  private waterSince = 0;
  private waterTimer = 0;
  private disposed = false;
  /** Timings (information: the page's look menu and the measurements). */
  stats = { ambientMs: 0, flowMs: 0, shadowPasses: 0, forest: { plants: 0, near: 0, far: 0, triangles: 0, draws: 0, lodMs: 0 }, landmarks: 0, mist: 0, rings: 0 };

  constructor(private host: HighHost) {
    const u = host.uniforms;
    const high = {
      ...this.switches,
      sunColor: this.sun,
      skyColor: this.sky,
      hlDepth: { value: this.shadows.target.depthTexture },
      hlShadowMatrix: { value: this.shadows.matrix },
      hlTexel: { value: 1 / SHADOW_SIZE },
      hlAmbient: { value: null as unknown },
      hlFlow: { value: null as unknown },
      hlFlowSize: { value: new Vector2(1, 1) },
      hlRough: { value: null as unknown },
    };
    const own = (m: ShaderMaterial, extra: Record<string, { value: unknown }> = {}) => {
      // the material's own uniforms (the terrain's height range, hover and ground mode) stay the
      // Standard ones' objects, so the renderer's changes reach both
      m.uniforms = { ...m.uniforms, ...high, ...extra };
      return m;
    };
    this.materials = {
      terrain: own(terrainMaterial(u, 0, 1, false, terrainHooks())),
      water: own(waterMaterial(u, false, waterHooks())),
      fall: own(fallMaterial(u, false, fallHooks())),
      object: own(objectMaterial(u, false, objectHooks())),
      sky: own(skyMaterial(skyHooks())),
    };
    this.vegetation = own(objectMaterial(u, false, vegetationHooks(slots.length)), {
      vegPalette: { value: slots.map((k) => hexColour(paletteDefaults[k])) },
      vegTime: this.vegTime,
      vegSway: this.vegSway,
    });
    this.landmark = own(objectMaterial(u, false, landmarkHooks()));
    this.slope = own(objectMaterial(u, false, slopeHooks()));
    this.mist = new Mist(u.time);
    host.scene.add(this.mist.group);
    this.apply();
  }

  /** Share the terrain material's own uniforms (height range, hover, ground mode, an eruption's
   *  heat, D206) with Standard's, so a change of look mid-eruption keeps its glow. */
  shareTerrainUniforms(standard: ShaderMaterial): void {
    const t = this.materials.terrain.uniforms;
    if (t.eruptionMask && t.eruptionMask !== standard.uniforms.eruptionMask) (t.eruptionMask.value as { dispose(): void }).dispose();
    for (const k of ["heightRange", "hover", "groundMode", "eruptionMask", "eruptionAge", "coolingAge"]) t[k] = standard.uniforms[k];
  }

  // ------------------------------------------------------------------------------------ effects

  /** The player's switches and the tier: which effects are on. */
  setEffects(chosen: HighEffects, lower: boolean): void {
    this.chosen = { ...chosen };
    this.lower = lower;
    this.apply();
  }

  get lowerCost(): boolean {
    return this.lower;
  }

  private apply(): void {
    const e = (this.effects = effectiveEffects(this.chosen, this.lower));
    const set = (k: Switch, on: boolean) => (this.switches[k].value = on ? 1 : 0);
    set("hlWater", e.water);
    set("hlShadows", e.shadows);
    set("hlAO", e.ao);
    set("hlTone", e.tone);
    set("hlGrade", e.grade);
    set("hlHaze", e.haze);
    set("hlSky", e.sky);
    set("hlStrata", e.strata);
    set("hlBlend", e.soilEdges);
    set("hlVariation", e.variation);
    set("hlGeology", e.geology);
    set("hlSoilCap", e.soilCap);
    set("hlSection", e.section);
    set("hlCrown", e.crown);
    set("hlLanding", e.landing);
    set("hlBubbles", e.bubbles);
    set("hlRiver", e.roughWater);
    set("hlObjectDetail", e.objectDetail);
    const u = this.host.uniforms;
    const balance = e.sunlight ? SUNLIGHT : e.shadows ? SHADOW_BALANCE : { sun: [1, 1, 1], sky: 1 };
    this.sun.value.copy(u.sunColor.value).multiply(new Color(balance.sun[0], balance.sun[1], balance.sun[2]));
    this.sky.value.copy(u.skyColor.value).multiplyScalar(balance.sky);
    this.vegSway.value = e.sway && this.host.motion() ? 1 : 0;
    this.mist.show(e.mist, e.rings);
    this.showObjects();
    this.shadows.dirty = true;
    this.host.requestRender();
  }

  /** Whether everything a map needs has arrived (the worker's fields, the water's): the captures
   *  wait for it. */
  get settled(): boolean {
    return !this.waterTimer && (this.ambient?.ready ?? true) && this.host.flow().ready;
  }

  /** Whether the look moves on its own (the wind in the trees): the renderer keeps drawing. */
  get animates(): boolean {
    return this.vegSway.value > 0 && !!this.forest?.meshes.length;
  }

  // ------------------------------------------------------------------------------------ the map

  /** A new map: the shadows' frame, the ambient occlusion, the water's flow and mist. */
  setMap(W: number, H: number, heights: Uint8Array, surface: SurfaceWater, entities: EntityView): void {
    this.map = { W, H, heights, surface };
    this.shadows.fit(W, H);
    // (a new map's shadows are drawn with its first frame, however soon after the last map's: the
    // wait between redraws is for a brush's strokes, and the last map's depth map is not this one's)
    this.lastShadow = -Infinity;
    this.ambient?.dispose();
    this.ambient = new AmbientField(W, H, this.host.baker, () => {
      this.stats.ambientMs = this.ambient?.ms ?? 0;
      this.host.requestRender();
    });
    this.ambient.bake(heights, entities);
    const flow = this.host.flow();
    const size = this.materials.terrain.uniforms.hlFlowSize.value as Vector2;
    size.set(W, H);
    for (const m of this.allMaterials()) {
      m.uniforms.hlAmbient.value = this.ambient.texture;
      m.uniforms.hlFlow.value = flow.flow;
      m.uniforms.hlRough.value = flow.rough;
    }
    this.updateWater(true);
  }

  /** The objects the renderer built for the map (buildEntities' group): the new trees and the
   *  landmarks go in beside today's, which hide while they show. */
  objectsBuilt(group: Group, entities: EntityView): void {
    // (the same plants as before: the forest stays, only the landmarks follow the new batches)
    const sig = plantSignature(entities);
    const keep = !!this.forest && sig === this.plants;
    this.releaseObjects();
    if (!keep) {
      this.forest?.dispose();
      this.forest = new Forest(entities, this.vegetation);
      this.forest.setGroundOffset((x, y) => this.host.groundOffset(x, y));
      this.plants = sig;
    }
    this.objects = group;
    const forest = this.forest!;
    for (const m of forest.meshes) {
      m.renderOrder = 1;
      group.add(m);
    }
    this.landmarks = buildLandmarks(group, entities, this.landmark, this.slope);
    for (const { fresh } of this.landmarks) group.add(fresh);
    this.showObjects();
    if (this.map) this.ambient?.objects(this.map.heights, entities);
    this.stats.landmarks = this.landmarks.length;
    this.shadows.dirty = true;
  }

  /** The replacements drawn for a group of its own (the shelf's ghost and icons): the originals
   *  hidden, no wind. */
  decorate(group: Group, entities: EntityView): () => void {
    const forest = new Forest(entities, this.vegetation, true);
    forest.layout();
    for (const m of forest.meshes) group.add(m);
    const marks = buildLandmarks(group, entities, this.landmark, this.slope);
    for (const { fresh } of marks) group.add(fresh);
    for (const c of group.children) {
      const mesh = c as InstancedMesh;
      if (this.effects.vegetation && replacedBatch(mesh.name)) mesh.visible = false;
    }
    if (this.effects.landmarks) for (const { old } of marks) old.visible = false;
    for (const m of forest.meshes) m.visible = this.effects.vegetation && m.count > 0;
    for (const { fresh } of marks) fresh.visible = this.effects.landmarks;
    return () => {
      forest.dispose();
      disposeLandmarks(marks);
    };
  }

  private showObjects(): void {
    const g = this.objects;
    if (!g) return;
    const veg = this.effects.vegetation;
    for (const c of g.children) if (!c.name.startsWith("high.") && replacedBatch(c.name)) c.visible = !veg;
    if (this.forest) {
      if (veg) this.forest.layout();
      for (const m of this.forest.meshes) m.visible = veg && m.count > 0;
    }
    for (const { old, fresh } of this.landmarks) {
      old.visible = !this.effects.landmarks;
      fresh.visible = this.effects.landmarks;
    }
  }

  private clearObjects(): void {
    this.releaseObjects();
    this.forest?.dispose();
    this.forest = null;
    this.plants = "";
  }

  private plants = "";

  /** The renderer is about to put its objects away (new ones follow): the High models leave its
   *  group first, the forest kept for the next if its plants are the same. */
  releaseObjects(): void {
    for (const m of this.forest?.meshes ?? []) m.removeFromParent();
    disposeLandmarks(this.landmarks);
    this.landmarks = [];
    this.objects = null;
  }

  /** The terrain changed round a rectangle (or all of it): the ambient occlusion there, the
   *  shadows. */
  terrainChanged(heights: Uint8Array, rect: { x0: number; y0: number; x1: number; y1: number } | null): void {
    if (!this.map) return;
    this.map.heights = heights;
    this.ambient?.terrainAround(heights, rect ?? { x0: 0, y0: 0, x1: this.map.W - 1, y1: this.map.H - 1 });
    this.shadows.dirty = true;
  }

  /** The objects moved with the ground (a brush): the shadows. */
  castersMoved(): void {
    this.shadows.dirty = true;
  }

  /** The water changed: its mist follows a moment later (the flow and rough water: motion.ts). */
  waterChanged(surface: SurfaceWater): void {
    if (!this.map) return;
    this.map.surface = surface;
    const now = performance.now();
    if (!this.waterTimer) this.waterSince = now;
    clearTimeout(this.waterTimer);
    const wait = Math.max(0, Math.min(WATER_WAIT, this.waterSince + WATER_MOST - now));
    this.waterTimer = window.setTimeout(() => {
      this.waterTimer = 0;
      this.updateWater(false);
    }, wait);
  }

  private updateWater(now: boolean): void {
    const m = this.map;
    if (!m || this.disposed) return;
    this.stats.flowMs = this.host.flow().ms;
    this.mist.set(m.W, m.H, m.surface, this.host.falls());
    this.mist.show(this.effects.mist, this.effects.rings);
    this.stats.mist = this.mist.stats.mist;
    this.stats.rings = this.mist.stats.rings;
    if (!now) this.host.requestRender();
  }

  /** Mist and rings again (the falls were meshed again). */
  fallsChanged(): void {
    if (this.map) this.waterChanged(this.map.surface);
  }

  // --------------------------------------------------------------------------------- each frame

  /** Before each frame: the trees' models for this camera, the wind's clock, the sun's depth map. */
  beforeRender(camera: Camera, pixels: number, time: number): void {
    this.vegTime.value = time;
    // (a tree's close-up or far model casts nearly the same shadow: the depth map keeps the one it
    // was drawn with, and isn't drawn again for the camera's moves)
    if (this.forest && this.effects.vegetation) this.forest.update(camera, pixels, !this.lower);
    if (this.forest) this.stats.forest = { ...this.forest.stats };
    if (this.shadows.dirty && this.effects.shadows) {
      const now = performance.now();
      if (now - this.lastShadow >= SHADOW_EVERY) {
        this.lastShadow = now;
        for (const o of this.host.casters()) o.layers.enable(CASTER_LAYER);
        this.shadows.render(this.host.gl, this.host.scene);
        this.stats.shadowPasses = this.shadows.passes;
      } else window.setTimeout(() => this.host.requestRender(), SHADOW_EVERY);
    }
  }

  private allMaterials(): ShaderMaterial[] {
    return [...Object.values(this.materials), this.vegetation, this.landmark, this.slope];
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.waterTimer);
    this.clearObjects();
    this.mist.dispose();
    this.shadows.dispose();
    this.ambient?.dispose();
    for (const m of this.allMaterials()) m.dispose();
  }
}

/** The plants of a view (and where each is in its list), as a string that changes when any of them
 *  does. */
function plantSignature(e: EntityView): string {
  let h = 2166136261;
  let n = 0;
  for (let k = 0; k < e.count; k++) {
    const t = e.templates[e.template[k]];
    if (!replacedBatch(t)) continue;
    n++;
    for (const v of [k, t.length, t.charCodeAt(0), e.x[k], e.y[k], e.z[k], e.flags[k]]) h = Math.imul(h ^ v, 16777619);
  }
  return `${n}:${h >>> 0}`;
}

function hexColour(hex: string): Color {
  return new Color(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
}
