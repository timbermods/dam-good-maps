// The URL codec (PLAN §14.5, §19.1): a whole `MapSpec` in the URL fragment, as short keys.
//
//   #v=<generatorVersion>&s=<seed>&t=<theme>&z=<size>&d=<difficulty>&<setting>=<value>…
//
// Only the settings that differ from the theme preset at that difficulty and size are written, in
// a fixed order, so a spec has exactly one fragment. Species weights are four bytes in base64url.
// The rest of the spec is carried too, when it differs from a fresh spec: the archetype (`a`), the
// premise (`p`), the colonies (`c`, reserved for Timber Together, D5), the requested set pieces
// (`sp`) and the regeneration constraints (`k`), the last two as base64url JSON. A share link
// carries the spec only (D7): it reproduces the generated map, not the player's edits.
//
// Decoding never throws. A value it cannot use is reported in `problems` and the preset's value
// stays, so a mistyped link still opens a map.

import { hash32 } from "../math/hash";
import { jsonEqual } from "./mergepatch";
import { validateSpec } from "./schema";
import {
  defaultSettings,
  GENERATOR_VERSION,
  makeSpec,
  MAX_SIDE,
  MIN_SIDE,
  THEMES,
  woodForTrees,
  type Difficulty,
  type MapSpec,
  type Settings,
  type ThemeId,
} from "./mapspec";

/** Seeds may be typed as text; anything that is not a plain uint32 is hashed (PLAN §5.1). */
export function seedFromText(text: string): number {
  const t = text.trim();
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (n <= 0xffffffff) return n;
  }
  return hash32("seed", t);
}

// ---------------------------------------------------------------------------------- the keys

type Path = readonly [keyof Settings, string] | readonly ["start", "rules", string];

interface IntKey {
  key: string;
  path: Path;
  kind: "int";
}
interface EnumKey {
  key: string;
  path: Path;
  kind: "enum";
  /** Value → its one-letter code. */
  codes: Record<string, string>;
}
interface MixKey {
  key: string;
  path: Path;
  kind: "mix";
}
type SettingKey = IntKey | EnumKey | MixKey;

/** Every setting, in fragment order (PLAN §5). */
export const SETTING_KEYS: readonly SettingKey[] = [
  { key: "rl", path: ["terrain", "relief"], kind: "int" },
  { key: "ht", path: ["terrain", "highestTerrain"], kind: "int" },
  { key: "tr", path: ["terrain", "terracing"], kind: "int" },
  { key: "bl", path: ["terrain", "buildableLand"], kind: "enum", codes: { tight: "t", normal: "n", generous: "g" } },
  { key: "rv", path: ["water", "rivers"], kind: "int" },
  { key: "rs", path: ["water", "riverStyle"], kind: "enum", codes: { straight: "s", meandering: "m", braided: "b" } },
  { key: "fl", path: ["water", "riverFlow"], kind: "enum", codes: { trickle: "t", normal: "n", strong: "s", lush: "l" } },
  { key: "dr", path: ["water", "droughtReserve"], kind: "enum", codes: { scarce: "s", normal: "n", plenty: "p" } },
  { key: "lk", path: ["water", "lakes"], kind: "enum", codes: { none: "0", few: "f", some: "s", many: "m" } },
  { key: "wf", path: ["water", "waterfalls"], kind: "enum", codes: { off: "0", few: "f", many: "m" } },
  { key: "bw", path: ["hazards", "badwater"], kind: "enum", codes: { off: "0", low: "l", normal: "n", high: "h" } },
  { key: "bd", path: ["hazards", "badwaterDistance"], kind: "int" },
  { key: "tb", path: ["hazards", "thornBelts"], kind: "enum", codes: { off: "0", some: "s" } },
  { key: "uc", path: ["hazards", "unstableCores"], kind: "enum", codes: { off: "0", on: "1" } },
  { key: "fd", path: ["resources", "forestDensity"], kind: "int" },
  { key: "gs", path: ["resources", "groveSize"], kind: "enum", codes: { scattered: "s", normal: "n", bigWoods: "b" } },
  { key: "sm", path: ["resources", "speciesMix"], kind: "mix" },
  { key: "bn", path: ["resources", "berriesNearStart"], kind: "int" },
  { key: "bb", path: ["resources", "berryBushes"], kind: "int" },
  { key: "ru", path: ["resources", "ruins"], kind: "int" },
  { key: "rc", path: ["resources", "relics"], kind: "enum", codes: { off: "0", some: "s" } },
  { key: "gt", path: ["resources", "geothermal"], kind: "enum", codes: { off: "0", some: "s" } },
  { key: "ms", path: ["resources", "mineSites"], kind: "int" },
  { key: "sa", path: ["start", "area"], kind: "enum", codes: { small: "s", normal: "n", large: "l" } },
  { key: "sw", path: ["start", "rules", "waterWithin"], kind: "int" },
  { key: "sl", path: ["start", "rules", "woodWithin20"], kind: "int" },
  { key: "sb", path: ["start", "rules", "bushesWithin20"], kind: "int" },
  { key: "sx", path: ["start", "rules", "badwaterWithin"], kind: "int" },
  { key: "sr", path: ["start", "rules", "ruinsWithin"], kind: "int" },
];

const SPECIES = ["pine", "birch", "oak", "succulent"] as const;
const DIFF_CODES: Record<Difficulty, string> = { easy: "e", normal: "n", hard: "h" };
const DIFFS: Record<string, Difficulty> = { e: "easy", n: "normal", h: "hard" };
/** Keys that are not settings, and `st`: Minimum starting trees before D164 (read as wood). */
const OTHER_KEYS = new Set(["v", "s", "t", "z", "d", "a", "p", "c", "sp", "k", "st"]);

function getAt(s: Settings, path: Path): unknown {
  let o: unknown = s;
  for (const k of path) o = (o as Record<string, unknown>)[k];
  return o;
}

function setAt(s: Settings, path: Path, v: unknown): void {
  let o = s as unknown as Record<string, unknown>;
  for (let k = 0; k + 1 < path.length; k++) o = o[path[k]] as Record<string, unknown>;
  o[path[path.length - 1]] = v;
}

// ------------------------------------------------------------------------------------ base64url

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function toBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}

export function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of text) {
    acc = (acc << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
    }
  }
  return new Uint8Array(out);
}

function jsonToB64(v: unknown): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(v)));
}

function b64ToJson(text: string): unknown {
  const bytes = fromBase64Url(text);
  if (!bytes) throw new Error("not base64url");
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

// ------------------------------------------------------------------------------------ encoding

function sizeText(size: { x: number; y: number }): string {
  return size.x === size.y ? String(size.x) : `${size.x}x${size.y}`;
}

/** The fragment of a spec (without the `#`). Settings equal to the preset are left out. */
export function encodeSpecFragment(spec: MapSpec): string {
  const parts: string[] = [];
  const put = (k: string, v: string) => parts.push(`${k}=${encodeURIComponent(v)}`);
  put("v", spec.generatorVersion);
  put("s", String(spec.seed));
  put("t", spec.theme);
  put("z", sizeText(spec.size));
  put("d", DIFF_CODES[spec.designedFor]);
  const base = defaultSettings(spec.theme, spec.designedFor, spec.size);
  for (const sk of SETTING_KEYS) {
    const v = getAt(spec.settings, sk.path);
    const b = getAt(base, sk.path);
    if (jsonEqual(v, b)) continue;
    if (sk.kind === "int") put(sk.key, String(v));
    else if (sk.kind === "enum") put(sk.key, sk.codes[v as string] ?? String(v));
    else {
      const mix = v as Settings["resources"]["speciesMix"];
      put(sk.key, toBase64Url(new Uint8Array(SPECIES.map((n) => mix[n]))));
    }
  }
  if (spec.archetype !== spec.theme) put("a", spec.archetype);
  if (spec.premise !== undefined) put("p", spec.premise);
  if (spec.colonies.count !== 1 || spec.colonies.mod !== "none") put("c", `${spec.colonies.count}${spec.colonies.mod === "timberTogether" ? "t" : "n"}`);
  if (spec.setPieces.length) put("sp", jsonToB64(spec.setPieces));
  const k = spec.constraints;
  if (k.locks.length || k.keepOut.length || k.keep.length) put("k", jsonToB64(k));
  return parts.join("&");
}

/** A share link for a spec: the page's address with the spec in its fragment. */
export function shareLink(base: string, spec: MapSpec): string {
  return `${base.replace(/#.*$/, "")}#${encodeSpecFragment(spec)}`;
}

// ------------------------------------------------------------------------------------ decoding

export interface DecodedFragment {
  spec: MapSpec;
  /** The generator version the link was made with. */
  version: string;
  /** What in the link could not be used, in plain words. */
  problems: string[];
}

function parseParams(fragment: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of fragment.replace(/^#/, "").split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const k = eq >= 0 ? part.slice(0, eq) : part;
    let v = eq >= 0 ? part.slice(eq + 1) : "";
    try {
      v = decodeURIComponent(v.replace(/\+/g, " "));
    } catch {
      // keep the raw text: it is reported below if it does not parse
    }
    if (!out.has(k)) out.set(k, v);
  }
  return out;
}

export function decodeSpecFragment(fragment: string): DecodedFragment | null {
  const params = parseParams(fragment);
  if (!params.has("s")) return null;
  const problems: string[] = [];
  const seed = seedFromText(params.get("s") ?? "0");
  const t = params.get("t") ?? "riverValley";
  let theme: ThemeId = "riverValley";
  if ((THEMES as readonly string[]).includes(t)) theme = t as ThemeId;
  else problems.push(`unknown theme "${t}"`);
  const dc = params.get("d") ?? "n";
  const designedFor = DIFFS[dc] ?? "normal";
  if (!DIFFS[dc]) problems.push(`unknown difficulty "${dc}"`);
  let size = { x: 128, y: 128 };
  const z = params.get("z") ?? "128";
  const m = /^(\d+)(?:x(\d+))?$/.exec(z);
  if (m) {
    const x = Number(m[1]);
    const y = Number(m[2] ?? m[1]);
    if (x >= MIN_SIDE && x <= MAX_SIDE && y >= MIN_SIDE && y <= MAX_SIDE) size = { x, y };
    else problems.push(`size ${z} is outside ${MIN_SIDE}–${MAX_SIDE}`);
  } else problems.push(`bad size "${z}"`);
  const spec = makeSpec({ seed, size, theme, designedFor });

  // settings: each value is checked against the schema on its own, so one bad value never costs
  // the others
  for (const sk of SETTING_KEYS) {
    const raw = params.get(sk.key);
    if (raw === undefined) continue;
    let v: unknown;
    if (sk.kind === "int") v = /^-?\d+$/.test(raw) ? Number(raw) : NaN;
    else if (sk.kind === "enum") v = Object.keys(sk.codes).find((n) => sk.codes[n] === raw) ?? (raw in sk.codes ? raw : undefined);
    else {
      const bytes = fromBase64Url(raw);
      v = bytes && bytes.length === 4 ? Object.fromEntries(SPECIES.map((n, k) => [n, bytes[k]])) : undefined;
    }
    // every map has at least one mine site (Kyler, 2026-09-25): an old link's 0 asks for one
    if (sk.key === "ms" && v === 0) v = 1;
    const before = getAt(spec.settings, sk.path);
    setAt(spec.settings, sk.path, v);
    if (v === undefined || (typeof v === "number" && Number.isNaN(v)) || validateSpec(spec).length) {
      setAt(spec.settings, sk.path, before);
      problems.push(`setting ${sk.key}=${raw} is not valid here, so the preset's value is kept`);
    }
  }
  // a link from before D164 counts starting trees (`st`): its wood is `woodForTrees` of them,
  // unless the link also gives the wood (`sl`)
  const st = params.get("st");
  if (st !== undefined && !params.has("sl")) {
    const before = spec.settings.start.rules.woodWithin20;
    if (/^\d+$/.test(st)) spec.settings.start.rules.woodWithin20 = woodForTrees(Number(st));
    if (!/^\d+$/.test(st) || validateSpec(spec).length) {
      spec.settings.start.rules.woodWithin20 = before;
      problems.push(`setting st=${st} is not valid here, so the preset's value is kept`);
    }
  }
  const a = params.get("a");
  if (a !== undefined) {
    if ((THEMES as readonly string[]).includes(a)) spec.archetype = a as ThemeId;
    else problems.push(`unknown archetype "${a}"`);
  }
  const p = params.get("p");
  if (p !== undefined) spec.premise = p;
  const c = params.get("c");
  if (c !== undefined) {
    const cm = /^([1-4])([nt])$/.exec(c);
    const colonies = cm ? { count: Number(cm[1]) as 1 | 2 | 3 | 4, mod: cm[2] === "t" ? ("timberTogether" as const) : ("none" as const) } : null;
    const before = spec.colonies;
    if (colonies) spec.colonies = colonies;
    if (!colonies || validateSpec(spec).length) {
      spec.colonies = before;
      problems.push(`colonies "${c}" are not valid`);
    }
  }
  for (const [key, field] of [["sp", "setPieces"], ["k", "constraints"]] as const) {
    const raw = params.get(key);
    if (raw === undefined) continue;
    const before = spec[field];
    try {
      (spec as unknown as Record<string, unknown>)[field] = b64ToJson(raw);
      if (validateSpec(spec).length) throw new Error("invalid");
    } catch {
      (spec as unknown as Record<string, unknown>)[field] = before;
      problems.push(`the ${field === "setPieces" ? "set pieces" : "constraints"} in the link are not valid`);
    }
  }
  for (const k of params.keys()) if (!OTHER_KEYS.has(k) && !SETTING_KEYS.some((sk) => sk.key === k)) problems.push(`unknown setting "${k}" ignored`);
  return { spec, version: params.get("v") ?? GENERATOR_VERSION, problems };
}
