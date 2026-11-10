// A project file (.damgoodmaps) exported to the .timber the app exports for it, through the app's own core
// (`MapSession.exportTimber`: the canonical settle, the export's name and metadata). The page may swap the file's
// top-down thumbnail for its 3D picture (D488); the game's play never reads it. Used by the in-game capture kit
// (investigation/probe/runner/captures.ts) to play a project as players get it (D483).
//
//   npx tsx tools/export-project.ts <project.damgoodmaps> <out folder>
//
// Prints the .timber's path.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeProject } from "../src/core/doc/document";
import { MapSession } from "../src/core/doc/session";

const [project, outDir] = process.argv.slice(2);
if (!project || !outDir) {
  console.error("usage: npx tsx tools/export-project.ts <project.damgoodmaps> <out folder>");
  process.exit(2);
}
const session = MapSession.open(decodeProject(new Uint8Array(readFileSync(project))));
const { bytes, fileName } = session.exportTimber();
mkdirSync(outDir, { recursive: true });
const out = join(outDir, fileName);
writeFileSync(out, bytes);
console.log(out);
