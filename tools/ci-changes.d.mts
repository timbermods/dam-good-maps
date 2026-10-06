export const LIGHT_PACKAGE_FIELDS: string[];
export function isDocument(path: string): boolean;
export function isInvestigation(path: string): boolean;
export function isUiOnly(path: string): boolean;
export function isRustInput(path: string): boolean;
export function onlyLightFieldsDiffer(oldText: string, newText: string, where?: "package" | "lock"): boolean;
export function classify(
  files: string[],
  read: (path: string, side: "old" | "new") => string | null,
  mode?: "auto" | "full" | "light",
): { heavy: boolean; suites: boolean; rust: boolean };
export function needsHeavy(files: string[], read: (path: string, side: "old" | "new") => string | null): boolean;
export function needsTest(files: string[], mode?: "auto" | "full" | "light"): boolean;
