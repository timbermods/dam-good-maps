export type GuardKind = "source" | "ir" | "assembly" | "wasm";
export function sourceViolations(text: string): { line: number; text: string }[];
export function irViolations(text: string): string[];
export function assemblyViolations(text: string): string[];
export function wasmViolations(bytes: Uint8Array): unknown[];
export function assertClean(kind: GuardKind, input: string | Uint8Array): void;
