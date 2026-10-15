// A .timber the page saved against the file it should be (D488): where the page drew the map's 3D picture (a GPU),
// every entry but map_thumbnail.jpg byte for byte, in order, and the picture a 960×540 baseline JPEG; where it drew
// none (software rendering, as on CI), the whole file byte for byte.

import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { expect, type Page } from "@playwright/test";
import { thumbnailRefusal } from "../../src/core/format/timber";

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export async function expectSavedFile(page: Page, saved: Uint8Array, expected: Uint8Array, what: string): Promise<void> {
  const pictured = await page.evaluate(() => window.dgmHeroMs !== undefined);
  if (!pictured) {
    expect(sha256(saved), `${what}: the whole file`).toBe(sha256(expected));
    return;
  }
  const a = unzipSync(saved);
  const b = unzipSync(expected);
  expect(Object.keys(a), `${what}: its entries`).toEqual(Object.keys(b));
  for (const name of Object.keys(b)) if (name !== "map_thumbnail.jpg") expect(sha256(a[name]), `${what}: ${name}`).toBe(sha256(b[name]));
  expect(thumbnailRefusal(a["map_thumbnail.jpg"]), `${what}: its picture`).toBeNull();
}
