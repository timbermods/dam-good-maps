export * from '../../src/core/math/grid';
export * from '../../src/core/analysis/walk';
export * from '../../src/core/analysis/regions';
export * from '../../src/core/analysis/damsites';
export * from '../../src/core/analysis/metrics';
export * from '../../src/core/validate/playability';
export * from '../../src/core/validate/checks';
export * from '../../src/core/gen/outcomes';
export * from '../../src/core/gen/generate';
export * from '../../src/core/spec/mapspec';
export * from '../../src/core/sim/prefill';
export * from '../../src/core/sim/model';
export * from '../../src/core/format/timber';
export * from '../../src/core/format/world';
export * from '../../src/core/validate/report';
export {cutShape,wearReach} from '../../src/core/water/outletWear';
export {roomMap} from '../../src/core/land/minePads';
import {generate as referenceGenerate} from '../../src/core/gen/generate';
export function generate(...args: Parameters<typeof referenceGenerate>){const r=referenceGenerate(...args);(globalThis as any).__raGenerated?.(r);return r;}
