// The .timber container (FORMAT.md §1): a zip with map_metadata.json, map_thumbnail.jpg,
// version.txt and world.json at the root, Deflate. Entry dates come from the world Timestamp, so
// the same map always gives the same bytes, in every time zone: the DOS date and time are written
// from the timestamp's own fields, never through a local Date, which a daylight-saving gap would
// shift by an hour (the audit's A2).

import { deflateSync, strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
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

/** The thumbnail's size: the map picker shows it, and the checks read it (FORMAT.md §1). */
const THUMBNAIL_SIZE = [960, 540] as const;

/** Why `jpeg` cannot be a map's thumbnail (a 960×540 baseline JPEG), or null when it can. */
export function thumbnailRefusal(jpeg: Uint8Array): string | null {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return "the picture is not a JPEG";
  if (jpeg[jpeg.length - 2] !== 0xff || jpeg[jpeg.length - 1] !== 0xd9) return "the picture is not a whole JPEG: it has no end";
  let i = 2;
  while (i + 4 <= jpeg.length) {
    if (jpeg[i] !== 0xff) return "the picture is not a JPEG: its markers are damaged";
    const marker = jpeg[i + 1];
    // (a fill byte before a marker)
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xc0) {
      if (i + 9 > jpeg.length) return "the picture is not a whole JPEG";
      const h = (jpeg[i + 5] << 8) | jpeg[i + 6];
      const w = (jpeg[i + 7] << 8) | jpeg[i + 8];
      return w === THUMBNAIL_SIZE[0] && h === THUMBNAIL_SIZE[1] ? null : `the picture is ${w}×${h}, not ${THUMBNAIL_SIZE[0]}×${THUMBNAIL_SIZE[1]}`;
    }
    // any other frame (extended, progressive, lossless, arithmetic) is not baseline
    if (marker >= 0xc1 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return "the picture is not a baseline JPEG";
    if (marker === 0xda || marker === 0xd9) break;
    i += 2 + ((jpeg[i + 2] << 8) | jpeg[i + 3]);
  }
  return "the picture is not a JPEG: it has no frame";
}

/** A .timber file with `jpeg` as its map_thumbnail.jpg (the page's 3D picture, D488): every other
 *  entry's record and data are kept byte for byte, in their order; only the zip's directory follows
 *  them. Refused, with the reason, for a picture that is not a 960×540 baseline JPEG or a file without
 *  a map thumbnail. */
export function replaceThumbnail(timber: Uint8Array, jpeg: Uint8Array): { ok: true; bytes: Uint8Array } | { ok: false; reason: string } {
  const refusal = thumbnailRefusal(jpeg);
  if (refusal) return { ok: false, reason: refusal };
  const v = new DataView(timber.buffer, timber.byteOffset, timber.byteLength);
  let eocd = timber.length - 22;
  while (eocd >= 0 && v.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) return { ok: false, reason: "the file is not a zip: it has no end of central directory" };
  const count = v.getUint16(eocd + 10, true);
  const cdOffset = v.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOffset === 0xffffffff || v.getUint16(eocd + 4, true) !== 0) return { ok: false, reason: "the file is a zip this cannot rewrite (zip64 or split)" };
  const damaged = { ok: false as const, reason: "the file's zip records are damaged" };
  const entries: { central: Uint8Array; local: Uint8Array; thumbnail: boolean }[] = [];
  let at = cdOffset;
  for (let k = 0; k < count; k++) {
    if (at + 46 > eocd || v.getUint32(at, true) !== 0x02014b50) return damaged;
    const nameLen = v.getUint16(at + 28, true);
    const end = at + 46 + nameLen + v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
    const name = strFromU8(timber.subarray(at + 46, at + 46 + nameLen));
    const flags = v.getUint16(at + 8, true);
    const local = v.getUint32(at + 42, true);
    if (local + 30 > timber.length || v.getUint32(local, true) !== 0x04034b50) return damaged;
    let localEnd = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true) + v.getUint32(at + 20, true);
    // (a data descriptor after the data, with or without its signature)
    if (flags & 8) localEnd += localEnd + 4 <= timber.length && v.getUint32(localEnd, true) === 0x08074b50 ? 16 : 12;
    if (localEnd > timber.length) return damaged;
    // (matched by file name only, as readTimber and the game do)
    entries.push({ central: timber.slice(at, end), local: timber.slice(local, localEnd), thumbnail: name === "map_thumbnail.jpg" || name.endsWith("/map_thumbnail.jpg") });
    at = end;
  }
  const thumb = entries.find((e) => e.thumbnail);
  if (!thumb) return { ok: false, reason: "the file has no map thumbnail to replace" };
  // the picture's record: the old one's header (its name, date and extra field), deflated as writeTimber does
  const data = deflateSync(jpeg, { level: 6 });
  const crc = crc32(jpeg);
  const old = new DataView(thumb.local.buffer);
  const headLen = 30 + old.getUint16(26, true) + old.getUint16(28, true);
  const local = new Uint8Array(headLen + data.length);
  local.set(thumb.local.subarray(0, headLen));
  local.set(data, headLen);
  for (const [rec, base] of [[local, 0], [thumb.central, 2]] as const) {
    const d = new DataView(rec.buffer);
    // (no data descriptor: the sizes are in the header)
    d.setUint16(base + 6, d.getUint16(base + 6, true) & ~8, true);
    d.setUint16(base + 8, 8, true);
    d.setUint32(base + 14, crc, true);
    d.setUint32(base + 18, data.length, true);
    d.setUint32(base + 22, jpeg.length, true);
  }
  thumb.local = local;
  // the records in their order, then the directory with their new places, then the end record
  const tail = timber.slice(eocd);
  const localsLen = entries.reduce((n, e) => n + e.local.length, 0);
  const cdLen = entries.reduce((n, e) => n + e.central.length, 0);
  const out = new Uint8Array(localsLen + cdLen + tail.length);
  let o = 0;
  let c = localsLen;
  for (const e of entries) {
    new DataView(e.central.buffer).setUint32(42, o, true);
    out.set(e.local, o);
    o += e.local.length;
    out.set(e.central, c);
    c += e.central.length;
  }
  out.set(tail, c);
  const ov = new DataView(out.buffer);
  ov.setUint32(c + 12, cdLen, true);
  ov.setUint32(c + 16, localsLen, true);
  return { ok: true, bytes: out };
}

let crcTable: Uint32Array | null = null;

/** The zip's CRC-32 of `b`. */
function crc32(b: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
