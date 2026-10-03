// All product source; data-producing CLI jobs. Image capture and renderer profiling
// scripts remain presentation probes and are listed separately in the audit.
export const presentationTools=new Set(['tools/capture-look.ts','tools/capture-badwater.ts','tools/bench3d.ts']);
export const operationTool=file=>file.startsWith('tools/')&&!presentationTools.has(file);
