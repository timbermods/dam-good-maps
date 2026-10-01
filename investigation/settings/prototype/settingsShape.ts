import { makeSpec, type MapSpec } from "../spec/mapspec";

/** Let the adopted Islands shaper handle changes to these controls too. Its other scope stays. */
export function settingsShapeSpec(spec: MapSpec, controls: number): MapSpec {
  const out = structuredClone(spec);
  const preset = makeSpec({ seed: spec.seed, theme: spec.theme, size: spec.size });
  if(controls & 1){
    out.settings.terrain.verticality = preset.settings.terrain.verticality;
    out.settings.terrain.highestTerrain = preset.settings.terrain.highestTerrain;
  }
  if(controls & 2){
    out.settings.water.lakes = preset.settings.water.lakes;
    delete (out.settings.water as typeof out.settings.water & {lakeAmount?:number}).lakeAmount;
  }
  return out;
}
