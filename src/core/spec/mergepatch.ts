// JSON Merge Patch (RFC 7396): objects merge key by key, `null` deletes a key, and anything else,
// arrays included, replaces the target's value whole. `updateFeature` uses it (and the planned
// `SpecPatch`, PLAN §19.1). The input values are never changed.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function applyMergePatch<T>(target: T, patch: unknown): T {
  if (!isPlainObject(patch)) return clone(patch) as T;
  const base: Record<string, unknown> = isPlainObject(target) ? { ...target } : {};
  for (const key of Object.keys(patch)) {
    const v = patch[key];
    if (v === null) delete base[key];
    else base[key] = applyMergePatch(base[key], v);
  }
  return base as T;
}

/** A deep copy of plain JSON data. */
export function clone<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clone) as T;
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) out[k] = clone(v[k]);
    return out as T;
  }
  return v;
}

/** Structural equality of plain JSON data (key order ignored). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!jsonEqual(a[i], b[i])) return false;
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    for (const k of ka) if (!(k in b) || !jsonEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}
