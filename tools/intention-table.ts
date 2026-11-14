// Which themes each intention is offered for (planning, 2026-11-14; src/core/land/intentionTable.ts): each intention
// asked alone of each theme on seeds 1–12 at 128², offered where it emerged on at least 4 of the 12.
//
//   npm run intentions            (writes src/core/land/intentionTable.json; about 1,600 maps, some tens of minutes)
//   npm run intentions -- --check (writes nothing; fails when the committed table differs)

import { readFileSync, writeFileSync } from "node:fs";
import { computeTable } from "./lib/intentionTable";

const FILE = "src/core/land/intentionTable.json";
const check = process.argv.includes("--check");
const t0 = performance.now();
const table = await computeTable(undefined, (done, of) => {
  if (done % 50 === 0 || done === of) process.stderr.write(`${done}/${of} maps, ${Math.round((performance.now() - t0) / 1000)} s\n`);
});
const text = `${JSON.stringify(table, null, 1)}\n`;
if (check) {
  if (readFileSync(FILE, "utf8") !== text) {
    console.error(`${FILE} differs from the generator's: run npm run intentions`);
    process.exit(1);
  }
  console.log(`${FILE} is the generator's`);
} else {
  writeFileSync(FILE, text);
  console.log(`wrote ${FILE}`);
}
