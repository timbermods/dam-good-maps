export const LIGHT_PACKAGE_FIELDS: string[];
export function isDocument(path: string): boolean;
export function isInvestigation(path: string): boolean;
export function isUiOnly(path: string): boolean;
export function isCollabOnly(path: string): boolean;
export function isRustInput(path: string): boolean;
export function onlyLightFieldsDiffer(oldText: string, newText: string, where?: "package" | "lock"): boolean;
export function classify(
  files: string[],
  read: (path: string, side: "old" | "new") => string | null,
  mode?: "auto" | "full" | "light",
): { heavy: boolean; suites: boolean; rust: boolean };
export function needsHeavy(files: string[], read: (path: string, side: "old" | "new") => string | null): boolean;
export function needsTest(files: string[], mode?: "auto" | "full" | "light"): boolean;
export function isPage(path: string): boolean;
export function needsPage(files: string[], mode?: "auto" | "full" | "light"): boolean;
export const GENERATOR_DIRS: string[];
export const GENERATOR_FILES: string[];
export const GENERATOR_RUST: string[];
export function isGenerator(path: string): boolean;
export function needsGenerator(files: string[], mode?: "auto" | "full" | "light"): boolean;
