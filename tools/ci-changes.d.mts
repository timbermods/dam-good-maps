export const LIGHT_PACKAGE_FIELDS: string[];
export function isDocument(path: string): boolean;
export function isInvestigation(path: string): boolean;
export function onlyLightFieldsDiffer(oldText: string, newText: string, where?: "package" | "lock"): boolean;
export function needsHeavy(files: string[], read: (path: string, side: "old" | "new") => string | null): boolean;
