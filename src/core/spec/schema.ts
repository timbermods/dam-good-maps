// A small JSON Schema checker for the keywords our schemas use (type or a list of types, enum, const, minimum,
// maximum, pattern, required, properties, additionalProperties, items, minItems, maxItems, $ref to
// #/$defs, if/then). It never evaluates code, so it also runs inside a Claude artifact. The tests
// cross-check it against Ajv on the same schema.

import featuresSchema from "../features/features.schema.json" with { type: "json" };
import mapSpecSchema from "./mapspec.schema.json" with { type: "json" };
import type { MapSpec } from "./mapspec";

type Schema = Record<string, unknown>;

export interface SchemaError {
  path: string;
  message: string;
}

function typeOk(t: string, v: unknown): boolean {
  switch (t) {
    case "object": return v !== null && typeof v === "object" && !Array.isArray(v);
    case "array": return Array.isArray(v);
    case "string": return typeof v === "string";
    case "boolean": return typeof v === "boolean";
    case "integer": return typeof v === "number" && Number.isInteger(v);
    case "number": return typeof v === "number" && Number.isFinite(v);
    case "null": return v === null;
    default: return false;
  }
}

export function checkSchema(root: Schema, value: unknown): SchemaError[] {
  const errors: SchemaError[] = [];
  const resolve = (s: Schema): Schema => {
    const ref = s.$ref as string | undefined;
    if (!ref) return s;
    const m = /^#\/\$defs\/(.+)$/.exec(ref);
    if (!m) throw new Error(`unsupported $ref ${ref}`);
    return (root.$defs as Record<string, Schema>)[m[1]];
  };
  const walk = (s0: Schema, v: unknown, path: string, out: SchemaError[]): void => {
    const s = resolve(s0);
    if ("const" in s && v !== s.const) out.push({ path, message: `must be ${JSON.stringify(s.const)}` });
    if (s.enum && !(s.enum as unknown[]).includes(v)) out.push({ path, message: `must be one of ${(s.enum as unknown[]).join(", ")}` });
    if (s.type) {
      const types = (Array.isArray(s.type) ? s.type : [s.type]) as string[];
      if (!types.some((t) => typeOk(t, v))) {
        out.push({ path, message: `must be ${types.join(" or ")}` });
        return;
      }
    }
    if (typeof v === "number") {
      if (typeof s.minimum === "number" && v < s.minimum) out.push({ path, message: `must be >= ${s.minimum}` });
      if (typeof s.maximum === "number" && v > s.maximum) out.push({ path, message: `must be <= ${s.maximum}` });
    }
    if (typeof v === "string" && typeof s.maxLength === "number" && v.length > s.maxLength) out.push({ path, message: `must be at most ${s.maxLength} characters` });
    if (typeof v === "string" && typeof s.pattern === "string" && !new RegExp(s.pattern).test(v)) {
      out.push({ path, message: `must match ${s.pattern}` });
    }
    if (Array.isArray(v)) {
      if (typeof s.minItems === "number" && v.length < s.minItems) out.push({ path, message: `needs ${s.minItems}+ items` });
      if (typeof s.maxItems === "number" && v.length > s.maxItems) out.push({ path, message: `allows ${s.maxItems} items` });
      if (s.items) v.forEach((item, i) => walk(s.items as Schema, item, `${path}/${i}`, out));
    }
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      for (const k of (s.required as string[] | undefined) ?? []) {
        if (!(k in obj)) out.push({ path, message: `missing "${k}"` });
      }
      const props = (s.properties as Record<string, Schema> | undefined) ?? {};
      for (const k of Object.keys(obj)) {
        if (k in props) walk(props[k], obj[k], `${path}/${k}`, out);
        else if (s.additionalProperties === false) out.push({ path, message: `unknown property "${k}"` });
      }
    }
    if (s.if) {
      const probe: SchemaError[] = [];
      walk(s.if as Schema, v, path, probe);
      if (probe.length === 0 && s.then) walk(s.then as Schema, v, path, out);
    }
    if (Array.isArray(s.allOf)) for (const sub of s.allOf as Schema[]) walk(sub, v, path, out);
  };
  walk(root, value, "", errors);
  return errors;
}

export const MAPSPEC_SCHEMA = mapSpecSchema as Schema;

export function validateSpec(spec: unknown): SchemaError[] {
  return checkSchema(MAPSPEC_SCHEMA, spec);
}

export function assertSpec(spec: unknown): asserts spec is MapSpec {
  const errors = validateSpec(spec);
  if (errors.length) throw new Error("invalid MapSpec: " + errors.map((e) => `${e.path || "/"} ${e.message}`).join("; "));
}

export const FEATURES_SCHEMA = featuresSchema as Schema;

export function validateFeatures(features: unknown): SchemaError[] {
  return checkSchema(FEATURES_SCHEMA, features);
}
