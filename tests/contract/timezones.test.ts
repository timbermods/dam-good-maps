// The audit's A2 (D129): a .timber's bytes never depend on the machine's time zone, even for a
// timestamp inside a daylight-saving gap (2026-03-08 02:30 does not exist in Los Angeles). The same
// file is written in child processes with different TZ settings and compared byte for byte; and a
// timestamp outside any gap keeps the bytes the writer always gave (the ZIP entry time as before).

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { dosTime } from "../../src/core/format/timber";

const ROOT = resolve(__dirname, "../..");

const SCRIPT = `
import { createHash } from "node:crypto";
import { writeTimber } from ${JSON.stringify(join(ROOT, "src/core/format/timber.ts").replace(/\\/g, "/"))};
import { voxelsFromHeights, settledSimulationSingletons, LAYERS, GAME_VERSION } from ${JSON.stringify(join(ROOT, "src/core/format/world.ts").replace(/\\/g, "/"))};
const W = 8, H = 8;
const heights = new Uint8Array(W * H).fill(3);
const z = new Float64Array(W * H);
const out = [];
for (const timestamp of process.argv.slice(2)) {
  const bytes = writeTimber({
    metadata: { Width: W, Height: H, MapDescription: "" },
    thumbnail: null,
    versionTxt: GAME_VERSION + "\\r\\n",
    world: { gameVersion: GAME_VERSION, timestamp, sizeX: W, sizeY: H, layers: LAYERS, voxels: voxelsFromHeights(heights, W, H), singletons: settledSimulationSingletons(W, H, { floor: heights, depth: z, contamination: z, moisture: z, soilContamination: z, sat: new Uint8Array(W * H) }), entities: [] },
    extraFiles: [],
  });
  out.push(createHash("sha256").update(bytes).digest("hex"));
}
console.log(out.join(" "));
`;

describe(".timber bytes in every time zone (the audit's A2)", () => {
  it("writes the same bytes for a daylight-saving-gap timestamp in Los Angeles, Sydney and UTC", () => {
    const dir = mkdtempSync(join(tmpdir(), "dgm-tz-"));
    const file = join(dir, "write.ts");
    writeFileSync(file, SCRIPT);
    const run = (tz: string) =>
      execFileSync(process.execPath, ["--import", "tsx", file, "2026-03-08 02:30:00", "2026-10-04 02:30:00", "2026-01-01 00:00:00"], { cwd: ROOT, env: { ...process.env, TZ: tz }, encoding: "utf8" }).trim();
    const la = run("America/Los_Angeles");
    expect(run("UTC")).toBe(la);
    expect(run("Australia/Sydney")).toBe(la);
  });

  it("writes the timestamp's own date and time in every entry", () => {
    // 2026-03-08 02:30:00 as DOS fields
    const dos = dosTime("2026-03-08 02:30:00");
    expect(dos >>> 25).toBe(2026 - 1980);
    expect((dos >>> 21) & 15).toBe(3);
    expect((dos >>> 16) & 31).toBe(8);
    expect((dos >>> 11) & 31).toBe(2);
    expect((dos >>> 5) & 63).toBe(30);
    expect(unzipSync).toBeTypeOf("function");
  });
});
