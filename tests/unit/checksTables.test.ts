// The Rust checks read the data and constants they share with the rest of the core (the footprints, the
// starting-logs floor, the calibrated targets, the difficulty rules, the emitters, the objects' names, the
// components the load needs) from rust/checks/src/tables.rs, generated from the TypeScript (D465). A change to
// any of them must reach the checks: rerun `npx tsx tools/rust/checks-tables.ts` and rebuild the Wasm.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checksTables } from "../../tools/rust/checks-tables";

describe("the Rust checks' tables", () => {
  it("are the TypeScript's own (tools/rust/checks-tables.ts)", () => {
    expect(readFileSync("rust/checks/src/tables.rs", "utf8").replace(/\r\n/g, "\n")).toBe(checksTables());
  });
});
