// A .timber the page saved against the file it should be (D488): where the page drew the map's 3D picture (a GPU),
// every entry's zip record but map_thumbnail.jpg's byte for byte (header and compressed data: names, times,
// compression), in order, and the picture a 960×540 baseline JPEG; where it drew none (software rendering, as on
// CI), the whole file byte for byte.

import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { expect, type Page } from "@playwright/test";
import { thumbnailRefusal } from "../../src/core/format/timber";

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** Each entry's local record (header and data), by name, in the zip's order. */
function records(zip: Uint8Array): Map<string, Uint8Array> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = zip.length - 22;
  while (v.getUint32(eocd, true) !== 0x06054b50) eocd--;
  const out = new Map<string, Uint8Array>();
  let at = v.getUint32(eocd + 16, true);
  for (let k = 0; k < v.getUint16(eocd + 10, true); k++) {
    const n = v.getUint16(at + 28, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + n));
    const local = v.getUint32(at + 42, true);
    out.set(name, zip.slice(local, local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true) + v.getUint32(at + 20, true)));
    at += 46 + n + v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
  }
  return out;
}

export async function expectSavedFile(page: Page, saved: Uint8Array, expected: Uint8Array, what: string): Promise<void> {
  const pictured = await page.evaluate(() => window.dgmHeroMs !== undefined);
  if (!pictured) {
    expect(sha256(saved), `${what}: the whole file`).toBe(sha256(expected));
    return;
  }
  const a = records(saved);
  const b = records(expected);
  expect([...a.keys()], `${what}: its entries`).toEqual([...b.keys()]);
  for (const name of b.keys()) if (name !== "map_thumbnail.jpg") expect(sha256(a.get(name)!), `${what}: ${name}'s record`).toBe(sha256(b.get(name)!));
  expect(thumbnailRefusal(unzipSync(saved)["map_thumbnail.jpg"]), `${what}: its picture`).toBeNull();
}
