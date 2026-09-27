// The demo's maps: real Dam Good Maps land, saved as small fixtures by scripts/maps.ts (the ground,
// its settled water, the soil's moisture and the objects on it).

export interface Thing {
  id: string;
  template: string;
  x: number;
  y: number;
  z: number;
  orientation?: string;
}

export interface ErodeMap {
  id: string;
  name: string;
  /** Where the land comes from, in a line. */
  source: string;
  W: number;
  H: number;
  heights: Uint8Array;
  /** Settled water depth per tile (the canonical settle of the map as generated). */
  water: Float32Array;
  contamination: Float32Array;
  /** Moist soil (1) or dry (0), per tile. */
  moist: Uint8Array;
  /** Ground Erode leaves exactly as it is (1): the tiles under water sources, seeps and drains, which
   *  stand on the top of run 0 (GAME_RULES.md §3.4). */
  keep: Uint8Array;
  /** The rock beds (1 hard, per level), fixed as the map was opened, as the forces core keeps them. */
  rock: number[];
  things: Thing[];
}

const b64 = (u: Uint8Array): string => {
  if (typeof Buffer !== "undefined") return Buffer.from(u.buffer, u.byteOffset, u.byteLength).toString("base64");
  let s = "";
  for (let k = 0; k < u.length; k += 0x8000) s += String.fromCharCode(...u.subarray(k, k + 0x8000));
  return btoa(s);
};
const unb64 = (s: string): Uint8Array => {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(s, "base64"));
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
  return u;
};

export interface MapJson {
  id: string;
  name: string;
  source: string;
  W: number;
  H: number;
  heights: string;
  /** Depth × 1000 as 16-bit, little-endian. */
  water: string;
  contamination: string;
  moist: string;
  keep: string;
  rock: number[];
  things: Thing[];
}

function q16(a: Float32Array | Float64Array, scale: number): Uint8Array {
  const u = new Uint16Array(a.length);
  for (let i = 0; i < a.length; i++) u[i] = Math.max(0, Math.min(65535, Math.round(a[i] * scale)));
  return new Uint8Array(u.buffer);
}
function unq16(s: string, scale: number): Float32Array {
  const b = unb64(s);
  const u = new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2);
  return Float32Array.from(u, (v) => v / scale);
}

export function toJson(m: ErodeMap): MapJson {
  return {
    id: m.id,
    name: m.name,
    source: m.source,
    W: m.W,
    H: m.H,
    heights: b64(m.heights),
    water: b64(q16(m.water, 1000)),
    contamination: b64(q16(m.contamination, 1000)),
    moist: b64(m.moist),
    keep: b64(m.keep),
    rock: m.rock,
    things: m.things,
  };
}

export function fromJson(j: MapJson): ErodeMap {
  return {
    id: j.id,
    name: j.name,
    source: j.source,
    W: j.W,
    H: j.H,
    heights: unb64(j.heights).slice(),
    water: unq16(j.water, 1000),
    contamination: unq16(j.contamination, 1000),
    moist: unb64(j.moist).slice(),
    keep: unb64(j.keep).slice(),
    rock: j.rock,
    things: j.things,
  };
}
