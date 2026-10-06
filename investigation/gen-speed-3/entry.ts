// Bundle the exact API used by generator.worker.ts, with the page's embedded Wasm.
export { runGenerate, lastGenerated, emptyWaterFile } from "../../src/worker/api";
export { makeSpec, THEMES } from "../../src/core/spec/mapspec";
export { droughtStorage } from "../../src/core/sim/drought";
