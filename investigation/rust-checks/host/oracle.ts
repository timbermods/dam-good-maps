// The TypeScript the port is compared with: a checkout of the base (feature/m9b with dev merged), by default the
// ignored worktree local/oracle (see INTEGRATION.md). DGM_ORACLE names another.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const ORACLE = resolve(process.env.DGM_ORACLE ?? resolve(import.meta.dirname, "..", "local", "oracle"));

export function oracle(path: string): string {
  return pathToFileURL(resolve(ORACLE, path)).href;
}
