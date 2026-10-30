// The Dam Good Maps MCP server (D141, D501): Claude Desktop and other MCP clients build Timberborn maps with the same
// headless engine as the page. Each tool is a thin wrapper over the core (maps.ts); the rules of D139 are in the tool
// descriptions: steer the generator and say honestly what emerged, shape land with the forces, edit precisely with
// brushes and placements. The words follow docs/RULES.md and controlled English (one meaning a word, short sentences).

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type Tool } from "@modelcontextprotocol/sdk/types.js";
import opsSchema from "../../src/core/doc/ops.schema.json" with { type: "json" };
import specSchema from "../../src/core/spec/mapspec.schema.json" with { type: "json" };
import { INTENTIONS, INTENTION_TEXT } from "../../src/core/land/intentions";
import { SIZE_PRESETS, THEMES } from "../../src/core/spec/mapspec";
import { describeMap, summaryOf } from "./describe";
import { jobOf, secondsOf, startGenerate, waitFor, WAIT_MS, type Job } from "./jobs";
import { applyOps, checksOf, mapOf, mapsFolder, openMap, Refused, rowOf, saveMap, undoStep, type Made } from "./maps";
import { LAYERS, picture, type Layer, type Region } from "./picture";

export const SERVER_VERSION = "0.2.0";

/** How long a generate or wait call waits for its map, in words. */
const WAIT_WORDS = `about ${Math.round(WAIT_MS / 1000)} seconds`;

const INSTRUCTIONS = `Dam Good Maps makes and edits maps for the game Timberborn.
Follow these rules:
1. To get a map with a character, steer the generator. Use generate with a theme, settings and intentions. Do not build a map by hand.
2. After each map, tell the player what emerged and what did not. Use the summary and describe. Do not claim a feature that the map does not have.
3. To change the shape of the land in one area, use a force (an apply operation "forceResult" with a verb).
4. Use brushes, sculpts and placements only for precise edits: move the start, widen a river by two tiles, delete a forest, add one source.
5. Use picture to see the map after edits. Use check before save.
6. save writes the .timber map and its .damgoodmaps.json project. Timberborn shows the map in its custom maps.
7. A large map can take some minutes to make. If generate says that the map is not ready, call wait with its handle until the map is ready.`;

/** A copy of a JSON value with every "required" list removed (a merge patch gives only what changes). */
function optional(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(optional);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (k !== "required") out[k] = optional(x);
    return out;
  }
  return v;
}

/** The operation schema as the apply tool takes it: ops.schema.json exactly, but the fields the engine plans itself
 *  are not required (a force's result, a fill's water, unfed water's tiles, a new object's id, a stroke's seed). */
function applySchema(): Tool["inputSchema"] {
  const s = JSON.parse(JSON.stringify(opsSchema)) as Record<string, any>;
  const defs = s.$defs as Record<string, any>;
  defs.forceResult.required = ["verb", "where"];
  defs.forceResult.properties.settings.required = [];
  defs.forceResult.description = `A force of nature. Give the verb, where it acts, and the settings to change from the force's defaults. The engine plans the force and stores its result. ${defs.forceResult.description}`;
  defs.forceResult.properties.where.description =
    "Where the force acts, in tiles. origin [x, y]: where Carve, Craterize, Erupt and Glaciate start. end [x, y]: where an aimed one goes. path [[x, y], ...]: the line for Quake, Rift, Deposit and Erode (one point is a click). side: which side of a Quake's fault rises, 1 or -1. source: a Carve from an existing source's id.";
  defs.fillHollow.required = ["at", "level"];
  defs.removeUnfedWater.required = [];
  defs.placeEntity.required = ["template", "x", "y"];
  defs.paintObjects.required = ["kind", "area", "density"];
  const { $defs, $schema: _s, $id: _i, title: _t, ...op } = s;
  return {
    type: "object",
    additionalProperties: false,
    required: ["map", "ops"],
    $defs,
    properties: {
      map: { type: "string", description: "The map's handle." },
      ops: { type: "array", minItems: 1, items: op, description: "The operations, in order. Each one is one undo step." },
      picture: { type: "boolean", description: "Also return a picture of the area that changed. The default is false." },
    },
  } as Tool["inputSchema"];
}

const MAP = { type: "string", description: "The map's handle, from generate or open." };

const REGION = {
  type: "object",
  additionalProperties: false,
  required: ["x", "y", "w", "h"],
  description: "A rectangle of tiles: its lowest x and y, its width and its height.",
  properties: { x: { type: "integer", minimum: 0 }, y: { type: "integer", minimum: 0 }, w: { type: "integer", minimum: 1 }, h: { type: "integer", minimum: 1 } },
};

export const TOOLS: Tool[] = [
  {
    name: "generate",
    description: [
      "Make a new Timberborn map with the Dam Good Maps generator.",
      "Steer the map with the theme, the settings and the intentions. Do not try to build a map by hand.",
      "The tool returns a handle for the map, a summary and a top-down picture.",
      "The summary tells which intentions emerged and which did not. Tell the player honestly what emerged.",
      "The generator refuses a map that does not pass its checks. Then try another seed or other settings.",
      "A 128 map takes some seconds. A 256 map can take some minutes.",
      `If the map is not ready after ${WAIT_WORDS}, the tool returns the map's handle and says that the map is not ready. Then call wait with the handle until the map is ready.`,
    ].join(" "),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        theme: { enum: [...THEMES], description: "The kind of land. The default is any." },
        size: {
          anyOf: [{ type: "integer", minimum: 32, maximum: 256 }, { type: "string" }],
          description: `Tiles a side (a number), "width x height", or ${Object.entries(SIZE_PRESETS).map(([k, v]) => `${k} (${v})`).join(", ")}. The default is 128.`,
        },
        seed: { anyOf: [{ type: "integer", minimum: 0, maximum: 4294967295 }, { type: "string" }], description: "The seed: a number or a word. The same seed and settings make the same map. The default is a random seed." },
        designedFor: { enum: ["easy", "normal", "hard"], description: "The difficulty the map is made for. The default is normal." },
        settings: {
          ...(optional((specSchema as Record<string, any>).properties.settings) as object),
          description: "Changes to the generator's settings, as the page's settings panel sets them. Give only the values to change. The other values stay at the theme's defaults.",
        },
        intentions: {
          type: "array",
          items: { enum: [...INTENTIONS] },
          description: `Outcomes to steer toward. The generator tries for each one, but some do not emerge. ${INTENTIONS.map((id) => `${id}: ${INTENTION_TEXT[id]}`).join(" ")}`,
        },
      },
    },
  },
  {
    name: "wait",
    description: [
      "Wait for a map that generate is still making.",
      `The tool returns the map as generate returns it: the handle, the summary and a picture. If the map is not ready after ${WAIT_WORDS}, the tool says what the generator is doing. Then call wait again.`,
      "Tell the player honestly which intentions emerged.",
    ].join(" "),
    inputSchema: { type: "object", additionalProperties: false, required: ["map"], properties: { map: { type: "string", description: "The map's handle, from generate." } } },
  },
  {
    name: "describe",
    description: [
      "Tell what is where on a map, in tile coordinates.",
      "The answer has the start, the water bodies and sources, the rivers, the features, the landmarks, the objects, a grid of ground levels and the checks.",
      "Give tiles to get the ground and the objects on each of those tiles.",
    ].join(" "),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["map"],
      properties: {
        map: MAP,
        tiles: { type: "array", maxItems: 24, items: { type: "array", minItems: 2, maxItems: 2, items: { type: "integer", minimum: 0 } }, description: "Tiles [x, y] to describe one by one." },
        checks: { type: "boolean", description: "Also run the checks. The default is true." },
      },
    },
  },
  {
    name: "apply",
    description: [
      "Change a map with operations from the Dam Good Maps operation schema.",
      "Use a force (op forceResult) to shape land: Carve a river or a canyon, Craterize, Erupt a volcano, Quake a cliff, Glaciate a valley, Rift, Deposit, Erode a cave or an arch.",
      "Use brush, sculpt, placeEntity, moveEntity, deleteEntities and paintObjects only for precise edits.",
      "Use fillHollow and removeUnfedWater for standing water. Place a WaterSource or a BadwaterSource with placeEntity.",
      "Each operation is one undo step. The tool returns what changed.",
      "If the engine refuses an operation, nothing changes and the tool returns the engine's reason.",
      "Tiles are [x, y]. Runs are [y, x0, x1]. A brush's dabs are quarter tiles: the middle of tile (x, y) is (4x + 2, 4y + 2).",
    ].join(" "),
    inputSchema: applySchema(),
  },
  {
    name: "undo",
    description: "Undo the last step on a map. The tool returns the name of the step it took back.",
    inputSchema: { type: "object", additionalProperties: false, required: ["map"], properties: { map: MAP } },
  },
  {
    name: "picture",
    description: [
      "Show a top-down picture of a map or a rectangle of it.",
      "Tile coordinates are in the margins, and higher Y is up.",
      `A layer shows one field instead of the map's look: ${LAYERS.join(", ")}.`,
    ].join(" "),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["map"],
      properties: { map: MAP, layer: { enum: [...LAYERS], description: "The default is map." }, region: REGION },
    },
  },
  {
    name: "check",
    description: [
      "Run the checks that the map gets when it is saved.",
      "Problems that stop saving must be fixed first. Warnings do not stop saving: save notes them in the map's description.",
      "A problem can come with a fix: operations to give to apply.",
    ].join(" "),
    inputSchema: { type: "object", additionalProperties: false, required: ["map"], properties: { map: MAP } },
  },
  {
    name: "save",
    description: [
      "Save the map for Timberborn: the .timber map and its .damgoodmaps.json project, side by side.",
      `The default folder is Timberborn's Maps folder (${mapsFolder()}). A folder that you give is used as it is.`,
      "Save never writes over a file. If the name is taken, it adds -2, -3 and so on.",
      "Save refuses a map with a problem that stops saving. Run check first.",
    ].join(" "),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["map"],
      properties: {
        map: MAP,
        folder: { type: "string", description: "The folder to save in." },
        name: { type: "string", description: "A new name for the map. It also names the files." },
      },
    },
  },
  {
    name: "open",
    description: "Open a saved .damgoodmaps.json project to edit it again. A .timber map opens too, as an imported map. The tool returns a handle and a summary.",
    inputSchema: { type: "object", additionalProperties: false, required: ["path"], properties: { path: { type: "string", description: "The file's full path." } } },
  },
];

const text = (t: string) => ({ type: "text" as const, text: t });
const image = (png: Uint8Array) => ({ type: "image" as const, data: Buffer.from(png).toString("base64"), mimeType: "image/png" });

/** A rectangle around a changed area, with some land round it. */
function around(area: { x0: number; y0: number; x1: number; y1: number }, W: number, H: number): Region {
  const pad = Math.max(8, Math.round(Math.max(area.x1 - area.x0, area.y1 - area.y0) * 0.25));
  const x = Math.max(0, area.x0 - pad);
  const y = Math.max(0, area.y0 - pad);
  return { x, y, w: Math.min(W, area.x1 + pad + 1) - x, h: Math.min(H, area.y1 + pad + 1) - y };
}

/** A made map as generate and wait return it: its handle, summary, intentions and picture. */
function generated(g: Made): CallToolResult {
  // (a job keeps no map: if open has dropped it since, this is the refusal that no map is open under the handle)
  const s = mapOf(g.handle);
  const emerged = g.intentions.length
    ? `Intentions:\n${g.intentions.map((x) => `- ${x.id}: ${x.ok ? "emerged" : "did not emerge"} (${x.note})`).join("\n")}`
    : "Intentions: none.";
  const pic = picture(s);
  return {
    content: [text(`Map ${g.handle} (generated in ${(g.ms / 1000).toFixed(1)} s).\n${summaryOf(s, checksOf(s))}\n${s.description().text}\n${emerged}\n${pic.legend}`), image(pic.png)],
  };
}

/** The map when it is made within a call's wait, or a line that says it is not ready yet. */
async function waitResult(job: Job, call: CallContext): Promise<CallToolResult> {
  const g = await waitFor(job, call.progress, call.signal);
  if (g) return generated(g);
  return { content: [text(`Map ${job.handle} is not ready yet (${secondsOf(job)} s so far). ${job.now} Call wait with map "${job.handle}" to get it.`)] };
}

/** What a call can do besides answer: send progress (when the client asked for it), and hear that it was cancelled. */
export interface CallContext {
  progress: ((message: string) => void) | null;
  signal?: AbortSignal;
}

/** Say what a long step does, before the step holds the thread. */
async function starting(call: CallContext, message: string): Promise<void> {
  if (!call.progress) return;
  call.progress(message);
  await new Promise((resolve) => setImmediate(resolve));
}

/** Answer one tool call. */
export async function callTool(name: string, args: Record<string, unknown>, call: CallContext = { progress: null }): Promise<CallToolResult> {
  try {
    switch (name) {
      case "generate":
        return await waitResult(startGenerate(args), call);
      case "wait":
        return await waitResult(jobOf(String(args.map)), call);
      case "describe": {
        const s = mapOf(String(args.map));
        const d = describeMap(s, { tiles: args.tiles as [number, number][] | undefined, checks: args.checks === false ? null : checksOf(s) });
        return { content: [text(JSON.stringify(d))] };
      }
      case "apply": {
        const s = mapOf(String(args.map));
        const ops = args.ops as unknown[];
        await starting(call, `Applying ${ops?.length ?? 0} operation${ops?.length === 1 ? "" : "s"} to ${s.size.x} x ${s.size.y} tiles.`);
        const c = applyOps(s, ops);
        const content: CallToolResult["content"] = [text(JSON.stringify(c))];
        if (args.picture && c.ground.area) {
          const pic = picture(s, { region: around(c.ground.area, s.size.x, s.size.y) });
          content.push(text(pic.legend), image(pic.png));
        }
        return { content };
      }
      case "undo": {
        const s = mapOf(String(args.map));
        return { content: [text(`Undone: ${undoStep(s).undone}.`)] };
      }
      case "picture": {
        const s = mapOf(String(args.map));
        const layer = (args.layer ?? "map") as Layer;
        if (!LAYERS.includes(layer)) throw new Refused(`The layer is one of ${LAYERS.join(", ")}`);
        const region = args.region as Region | undefined;
        if (region && (region.x >= s.size.x || region.y >= s.size.y)) throw new Refused("The region is off the map");
        await starting(call, "Drawing the picture.");
        const pic = picture(s, { layer, ...(region ? { region } : {}) });
        return { content: [text(`${pic.legend} Tiles X ${pic.region.x}–${pic.region.x + pic.region.w - 1}, Y ${pic.region.y}–${pic.region.y + pic.region.h - 1}, ${pic.scale} pixels a tile.`), image(pic.png)] };
      }
      case "check": {
        const s = mapOf(String(args.map));
        await starting(call, "Running the checks.");
        const c = checksOf(s);
        const out = {
          saves: c.blocking.length === 0,
          stopSaving: c.blocking.map(rowOf),
          warnings: c.warnings.map(rowOf),
          advice: c.advisory.map(rowOf),
          ...(c.existing.length ? { alreadyThere: c.existing.map(rowOf) } : {}),
          ...(c.approximate ? { approximate: c.approximate } : {}),
          checks: c.checks,
        };
        return { content: [text(JSON.stringify(out))] };
      }
      case "save": {
        const s = mapOf(String(args.map));
        await starting(call, "Running the checks and writing the files.");
        const r = saveMap(s, { folder: args.folder as string | undefined, name: args.name as string | undefined });
        const lines = [`Saved ${r.timber.path} (${Math.round(r.timber.bytes / 1024)} KB) and ${r.project.path}.`];
        if (r.noted.length) lines.push(`The map's description notes ${r.noted.length} warning${r.noted.length > 1 ? "s" : ""}: ${r.noted.join("; ")}.`);
        lines.push("In Timberborn: New game, then the custom maps.");
        return { content: [text(lines.join("\n"))] };
      }
      case "open": {
        await starting(call, `Opening ${String(args.path)}.`);
        const o = openMap(String(args.path));
        return { content: [text(`Map ${o.handle}.\n${summaryOf(o.session, null)}`)] };
      }
      default:
        throw new Refused(`There is no tool "${name}"`);
    }
  } catch (e) {
    // a refusal's one line, word for word; anything else is a fault and says so
    const msg = e instanceof Refused ? e.message : `The tool failed: ${e instanceof Error ? e.message : String(e)}`;
    return { content: [text(msg)], isError: true };
  }
}

/** The server, ready to connect to a transport (stdio in index.ts, in memory in the tests). */
export function createServer(): Server {
  const server = new Server({ name: "dam-good-maps", version: SERVER_VERSION }, { capabilities: { tools: {} }, instructions: INSTRUCTIONS });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
    // progress, when the client asked for it (a progressToken): numbered in order, with a line on what is being done
    const token = req.params._meta?.progressToken;
    let n = 0;
    const progress =
      token === undefined
        ? null
        : (message: string) => void extra.sendNotification({ method: "notifications/progress", params: { progressToken: token, progress: ++n, message } }).catch(() => {});
    return callTool(req.params.name, (req.params.arguments ?? {}) as Record<string, unknown>, { progress, signal: extra.signal });
  });
  return server;
}
