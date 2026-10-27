// The page's 3D picture goes into a saved .timber as its map_thumbnail.jpg (D488): every other entry kept byte
// for byte, and anything that is not a 960×540 baseline JPEG refused with its reason.

import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { replaceThumbnail, thumbnailRefusal } from "../../src/core/format/timber";
import { thumbnailJpeg } from "../../src/core/render/shade";

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

const opts = { level: 6 as const, mtime: new Date(2026, 0, 1, 12, 0, 0) };
const topDown = thumbnailJpeg(new Uint8Array([3, 5, 7, 9]), 2, 2, null);
const timber = zipSync({
  "map_metadata.json": [strToU8('{"Width":2,"Height":2}'), opts],
  "map_thumbnail.jpg": [topDown, opts],
  "version.txt": [strToU8("1.1.0\r\n"), opts],
  "world.json": [strToU8('{"GameVersion":"1.1.0"}'.repeat(50)), opts],
});
/** Another 960×540 baseline picture (the core's encoder, other ground). */
const picture = thumbnailJpeg(new Uint8Array(64 * 64).map((_, i) => (i * 7) % 16), 64, 64, null);

describe("the map's picture as its thumbnail (D488)", () => {
  it("puts the picture in and keeps every other entry byte for byte, in order", () => {
    const r = replaceThumbnail(timber, picture);
    if (!r.ok) throw new Error(r.reason);
    const before = records(timber);
    const after = records(r.bytes);
    expect([...after.keys()]).toEqual([...before.keys()]);
    for (const name of ["map_metadata.json", "version.txt", "world.json"]) expect(Buffer.from(after.get(name)!).equals(Buffer.from(before.get(name)!)), name).toBe(true);
    const files = unzipSync(r.bytes);
    expect(Buffer.from(files["map_thumbnail.jpg"]).equals(Buffer.from(picture))).toBe(true);
    expect(Buffer.from(files["world.json"]).equals(Buffer.from(unzipSync(timber)["world.json"]))).toBe(true);
    // (again: the same file)
    const again = replaceThumbnail(r.bytes, topDown);
    expect(again.ok && Buffer.from(again.bytes).equals(Buffer.from(timber))).toBe(true);
  });

  it("refuses anything but a 960×540 baseline JPEG, and a file without a thumbnail", () => {
    expect(thumbnailRefusal(picture)).toBeNull();
    const at = (b: Uint8Array) => b.findIndex((x, i) => x === 0xff && b[i + 1] === 0xc0);
    const small = picture.slice();
    small[at(small) + 7] = 0x02; // 640 wide: 0x0280
    small[at(small) + 8] = 0x80;
    const progressive = picture.slice();
    progressive[at(progressive) + 1] = 0xc2;
    const cases: [Uint8Array, RegExp][] = [
      [strToU8("not a picture"), /not a JPEG/],
      [small, /640×540, not 960×540/],
      [progressive, /not a baseline JPEG/],
      [picture.subarray(0, picture.length - 100), /no end/],
    ];
    for (const [jpeg, why] of cases) {
      const r = replaceThumbnail(timber, jpeg);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(why);
    }
    const save = zipSync({ "world.json": [strToU8("{}"), opts] });
    const r = replaceThumbnail(save, picture);
    expect(!r.ok && r.reason).toBe("the file has no map thumbnail to replace");
  });
});
