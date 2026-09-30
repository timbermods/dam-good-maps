import { mkdirSync, writeFileSync } from "node:fs";
import { tree, startingLocation } from "../../src/core/format/entities";
import { DEFAULTS, plan } from "./rift";
const W = 16, heights = new Uint8Array(W * W).fill(10);
const m = { W, H: W, maxHeight: 22, heights,
  entities: [tree({ id: "tree", owner: "rift-sample", x: 8, y: 8, z: 10, species: "Pine" }),
    startingLocation({ id: "start", owner: "rift-sample", x: 2, y: 2, z: 10, orientation: "Cw0" })],
  water: { depth: new Float64Array(W * W), contamination: new Float64Array(W * W) } };
const p = plan(m, { ...DEFAULTS, size: 6 }, { path: [{ x: 2, y: 9 }, { x: 8, y: 8 }, { x: 13, y: 10 }] });
mkdirSync("samples", { recursive: true });
writeFileSync("samples/tiny-operation.json", JSON.stringify({ input: "16×16, level 10, dry; tree at 8,8 and Cw0 start at 2,2", operation: p.operation }, null, 2) + "\n");
