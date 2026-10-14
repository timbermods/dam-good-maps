// Checking what arrives (D342: a refusal is one plain line, never a silent clamp). The shapes are in
// collab.schema.json; what depends on the map is checked by the core that applies the command.

import { checkSchema } from "../spec/schema";
import schema from "./collab.schema.json" with { type: "json" };

const SCHEMA = schema as Record<string, unknown>;
const DEFS = SCHEMA.$defs as Record<string, unknown>;

const KINDS: Record<string, string> = {
  entry: "entry",
  request: "request",
  commit: "commit",
  reject: "reject",
  "map-opening": "mapOpening",
  snapshot: "snapshotHeader",
};

/** The longest map name a message carries. */
export const MAX_NAME = 120;

function firstProblem(def: string, value: unknown, what: string): string | null {
  const errors = checkSchema({ $defs: DEFS, $ref: `#/$defs/${def}` }, value);
  if (!errors.length) return null;
  const e = errors[0];
  return `${what} is not valid: ${e.path ? e.path.slice(1).replace(/\//g, " > ") + " " : ""}${e.message}`;
}

/** Why a message or entry is not well formed (one line), or null. */
export function messageProblem(value: unknown): string | null {
  const kind = typeof value === "object" && value !== null ? (value as { kind?: unknown }).kind : undefined;
  if (typeof kind !== "string" || !(kind in KINDS)) return "The message is not one the session knows";
  const problem = firstProblem(KINDS[kind], value, `The ${kind === "entry" ? "log entry" : kind}`);
  if (problem) return problem;
  const m = value as { name?: unknown; command?: { kind?: string; name?: unknown; gesture?: { request?: { verb?: string }; sourceId?: unknown } }; entry?: unknown };
  if (typeof m.name === "string" && (m.name.trim() === "" || m.name.length > MAX_NAME)) return `A map name is 1 to ${MAX_NAME} characters`;
  if (m.entry) return messageProblem(m.entry);
  return m.command ? commandProblem(m.command) : null;
}

/** Why a command is not well formed (one line), or null. */
export function commandProblem(command: unknown): string | null {
  const problem = firstProblem("command", command, "The command");
  if (problem) return problem;
  const c = command as { kind: string; name?: unknown; gesture?: { request: { verb: string }; sourceId?: unknown }; ops?: { op?: string }[] };
  if (c.kind === "newMap" && (typeof c.name !== "string" || c.name.trim() === "" || c.name.length > MAX_NAME)) return `A map name is 1 to ${MAX_NAME} characters`;
  if (c.kind === "force" && c.gesture!.request.verb === "carve" && typeof c.gesture!.sourceId !== "string") return "A carve needs the id of its river source in the gesture";
  if (c.kind === "edit" || c.kind === "select") {
    if (c.ops!.some((o) => o.op === "forceResult")) return "A force travels as its gesture with its seed, never as its result";
  }
  return null;
}
