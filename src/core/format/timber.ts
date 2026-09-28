// The .timber container (FORMAT.md §1): a zip with map_metadata.json, map_thumbnail.jpg,
// version.txt and world.json at the root, Deflate. Entry dates come from the world Timestamp, so
// the same map always gives the same bytes, in every time zone: the DOS date and time are written
// from the timestamp's own fields, never through a local Date, which a daylight-saving gap would
// shift by an hour (the audit's A2).

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { parse, stringify, type JsonObject } from "./json";
import { decodeWorld, encodeWorld, GAME_VERSION, type WorldModel } from "./world";

export interface TimberFile {
  /** map_metadata.json, or null for a save (which carries save_metadata.json instead). */
  metadata: JsonObject | null;
  thumbnail: Uint8Array | null;
  versionTxt: string;
  world: WorldModel;
  /** Any other entries, in file order (save_metadata.json, save_thumbnail.jpg, ...). */
  extraFiles: [string, Uint8Array][];
}

export function mapMetadata(sizeX: number, sizeY: number, description: string, extra: JsonObject = {}): JsonObject {
  return {
    Width: sizeX,
    Height: sizeY,
    MapNameLocKey: "",
    MapDescriptionLocKey: "",
    MapDescription: description,
    IsRecommended: false,
    IsUnconventional: false,
    IsDev: false,
    ...extra,
  };
}

/** The zip's DOS date and time (the date in the high 16 bits) of "yyyy-MM-dd HH:mm:ss", from its
 *  own fields (2026-01-01 00:00:00 when it does not parse). */
export function dosTime(timestamp: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(timestamp);
  const [y, mo, d, h, mi, s] = m ? [+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]] : [2026, 1, 1, 0, 0, 0];
  return (((y - 1980) << 25) | (mo << 21) | (d << 16) | (h << 11) | (mi << 5) | (s >> 1)) >>> 0;
}

/** Write `dos` as every entry's date and time, in the local headers and the central directory. */
function setZipTimes(zip: Uint8Array, dos: number): void {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = zip.length - 22;
  while (eocd >= 0 && v.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("the zip has no end of central directory");
  const count = v.getUint16(eocd + 10, true);
  let at = v.getUint32(eocd + 16, true);
  for (let k = 0; k < count; k++) {
    if (v.getUint32(at, true) !== 0x02014b50) throw new Error("the zip's central directory is damaged");
    v.setUint32(at + 12, dos, true);
    const local = v.getUint32(at + 42, true);
    v.setUint32(local + 10, dos, true);
    at += 46 + v.getUint16(at + 28, true) + v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
  }
}

export function writeTimber(file: TimberFile): Uint8Array {
  // any time outside a daylight-saving change for fflate; the real one is written after
  const opts = { level: 6 as const, mtime: new Date(2026, 0, 1, 12, 0, 0) };
  const entries: Zippable = {};
  if (file.metadata) {
    const meta: JsonObject = { ...file.metadata, Width: file.world.sizeX, Height: file.world.sizeY };
    entries["map_metadata.json"] = [strToU8(stringify(meta)), opts];
    if (file.thumbnail) entries["map_thumbnail.jpg"] = [file.thumbnail, opts];
  }
  for (const [name, data] of file.extraFiles) entries[name] = [data, opts];
  entries["version.txt"] = [strToU8(file.versionTxt), opts];
  entries["world.json"] = [strToU8(encodeWorld(file.world)), opts];
  const zip = zipSync(entries);
  setZipTimes(zip, dosTime(file.world.timestamp));
  return zip;
}

export function readTimber(bytes: Uint8Array): TimberFile {
  const files = unzipSync(bytes);
  const names = Object.keys(files);
  const byName = (n: string) => {
    // entries are matched by file name only, like the game (FORMAT.md §1)
    const key = names.find((k) => k === n || k.endsWith("/" + n));
    return key ? files[key] : undefined;
  };
  const worldBytes = byName("world.json");
  if (!worldBytes) throw new Error("not a .timber file: world.json missing");
  const world = decodeWorld(strFromU8(worldBytes));
  const metaBytes = byName("map_metadata.json");
  const metadata = metaBytes ? (parse(strFromU8(metaBytes)) as JsonObject) : null;
  const versionBytes = byName("version.txt");
  const known = new Set(["world.json", "map_metadata.json", "map_thumbnail.jpg", "version.txt"]);
  return {
    metadata,
    thumbnail: byName("map_thumbnail.jpg") ?? null,
    versionTxt: versionBytes ? strFromU8(versionBytes) : GAME_VERSION + "\r\n",
    world,
    extraFiles: names.filter((n) => !known.has(n.split("/").pop()!)).map((n) => [n, files[n]] as [string, Uint8Array]),
  };
}
