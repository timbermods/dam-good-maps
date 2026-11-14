// The Dam Good Maps MCP server (D141, D501): Claude Desktop and other MCP clients build Timberborn maps with the same
// headless engine as the page. Each tool is a thin wrapper over the core (maps.ts); the rules of D139 are in the tool
// descriptions: steer the generator and say honestly what emerged, shape land with the forces, edit precisely with
// brushes and placements. The words follow docs/RULES.md and controlled English (one meaning a word, short sentences).

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type Tool } from "@modelcontextprotocol/sdk/types.js";
import opsSchema from "../../src/core/doc/ops.schema.json" with { type: "json" };
import specSchema from "../../src/core/spec/mapspec.schema.json" with { type: "json" };
import { INTENTIONS, INTENTION_TEXT } from "../../src/core/land/intentions";
import { naturalSize as craterAcross } from "../../src/core/forces/craterize";
import { naturalSize as eruptAcross } from "../../src/core/forces/erupt";
import { SIZE_PRESETS, THEMES } from "../../src/core/spec/mapspec";
import { describeMap, summaryOf } from "./describe";
import { jobOf, secondsOf, startGenerate, waitFor, WAIT_MS, type Job } from "./jobs";
import { applyOps, checksOf, FORCE_DEFAULTS, mapOf, mapsFolder, MOST_OPEN, openMap, Refused, rowOf, saveMap, undoStep, type Made } from "./maps";
import { LAYERS, picture, type Layer, type Region } from "./picture";

export const SERVER_VERSION = "0.2.0";

/** How long a generate or wait call waits for its map, in words. */
const WAIT_WORDS = `about ${Math.round(WAIT_MS / 1000)} seconds`;

const INSTRUCTIONS = `Dam Good Maps makes and edits maps for the game Timberborn.
Follow these rules:
1. To get a map with a character, steer the generator. Use generate with a theme, settings and intentions. Do not build a map by hand.
2. After each map, tell the player what emerged and what did not. Use the summary and describe. Do not claim a feature that the map does not have. If an intention the player wants did not emerge, generate again with another seed.
3. To change the shape of the land in one area, use a force (an apply operation "forceResult" with a verb).
4. Use brushes, sculpts and placements only for precise edits: move the start, widen a river by two tiles, delete a forest, add one source.
5. Use picture to see the map after edits. Use check before save, and tell the player what its verdict says.
6. Tiles are [x, y]. X runs from west (0) to east. Y runs from south (0) to north: higher Y is north, and up in a picture.
7. save writes the .timber map and its .damgoodmaps.json project. Timberborn shows the map in its custom maps. Edits are kept only in this server until save: open reads the saved file, without later edits.
8. Only the newest ${MOST_OPEN} maps stay open; an older handle stops working. Save a map to keep it. The same input and seed make the same map again.
9. A large map can take some minutes to make. If generate says that the map is not ready, call wait with its handle until the map is ready.`;

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

/** A field of an operation that the engine fills: the apply schema leaves its shape out. */
const STORED = "The engine fills this. Leave it out.";

/** A force's settings with their defaults, in words: "mode strike, power 55, size null". */
function defaultsOf(verb: string): string {
  return Object.entries(FORCE_DEFAULTS[verb])
    .filter(([k]) => k !== "seed" && k !== "layers")
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
}

const CRATER_POWER = FORCE_DEFAULTS.craterize.power as number;
const ERUPT_POWER = FORCE_DEFAULTS.erupt.power as number;

const WHERE_TEXT = [
  "Where the force acts, in tiles [x, y]. X runs west to east, Y south to north (higher Y is north).",
  "origin: where Carve, Craterize, Erupt and Glaciate start: a Carve's source (the head of its river), the middle of a crater, an Erupt's vent.",
  "end: for Carve, the tile the river cuts its way to (an aimed carve cuts through rises). For Craterize, the way the impactor travels (a glancing blow). Without end, a Carve runs downhill from origin.",
  "path [[x, y], ...]: the line for Quake, Rift, Deposit, Erode and an Erupt fissure (one point is a click).",
  "side: which side of a Quake's fault rises, 1 or -1. source: a Carve from an existing source's id.",
].join(" ");

const SETTINGS_TEXT = [
  "The settings to change. Give only these; the others keep the verb's defaults.",
  ...Object.keys(FORCE_DEFAULTS).map((verb) => `${verb}: ${defaultsOf(verb)}.`),
].join(" ");

const SETTING_WORDS: Record<string, string> = {
  power: "How strong the force is, 0 to 100.",
  size: `How wide the force is, in tiles across. null (the default): it follows power. At the default power, a craterize is ${craterAcross(CRATER_POWER)} tiles across and an erupt about ${Math.round(eruptAcross(ERUPT_POWER))}; its rim and debris change the ground out to about size tiles from the middle, so about twice size across (size 16: about 30 tiles), and the start moves if its ground breaks. For a crater in one part of a 96-tile map, give a size such as 12. A shallow form shows best in the picture's heights layer.`,
  sources:
    'What happens to water sources, badwater sources and seeps on the tiles the force changes. "clear" (the default): the force removes them. "ride": they stay and move with the ground.',
  dry: "Carve only. false (the default): the carve keeps a water source at its head, so its river runs. true: a dry canyon with no source.",
  meltwater: "Glaciate only. true (the default): the glacier leaves a meltwater source and its river.",
};

/** The operation schema as the apply tool takes it: ops.schema.json exactly, but the fields the engine plans itself
 *  are not required (a force's result, a fill's water, unfed water's tiles, a new object's id, a stroke's seed). */
function applySchema(): Tool["inputSchema"] {
  const s = JSON.parse(JSON.stringify(opsSchema)) as Record<string, any>;
  const defs = s.$defs as Record<string, any>;
  const force = defs.forceResult;
  force.required = ["verb", "where"];
  force.properties.settings.required = [];
  force.description =
    'A force of nature. Give only the verb, where it acts, and the settings to change from the verb\'s defaults. The engine plans the force and stores its result in the other fields. Example: {"op": "forceResult", "params": {"verb": "craterize", "where": {"origin": [40, 30]}, "settings": {"size": 16}}}.';
  force.properties.where.description = WHERE_TEXT;
  force.properties.settings.description = SETTINGS_TEXT;
  for (const [k, text] of Object.entries(SETTING_WORDS)) force.properties.settings.properties[k].description = text;
  // (the result the engine stores: still taken, as a stored force replays, but its shape is the engine's)
  for (const k of Object.keys(force.properties)) if (!["verb", "settings", "where"].includes(k)) force.properties[k] = { description: STORED };
  defs.fillHollow.required = ["at", "level"];
  defs.canal.required = ["path"];
  for (const d of [defs.canal, defs.lake, defs.ridge]) for (const k of ["cells", "levels"]) d.properties[k] = { description: STORED };
  defs.ridge.required = ["path"];
  defs.ridge.description = `High ground along a line: give the path, and the height (5 unless given), width (10), steep ("auto") and seed (1); the engine plans its tiles. ${defs.ridge.description}`;
  defs.canal.description = `A channel that leads water: give the path, and the width (2 unless given), depth (1) and open (true); the engine plans the bed and its banks. ${defs.canal.description}`;
  defs.lake.required = ["outline", "level"];
  defs.lake.description = `A lake where there is none: give the outline and the level, and the depth (2 unless given) and spill if wanted; the engine digs the basin, makes its rim whole and cuts the notch. ${defs.lake.description}`;
  defs.setLakeLevel.required = ["at", "level"];
  defs.setLakeLevel.description = `A lake set to a level: give a tile of the lake (or of the hollow its river fills) and the level; the engine cuts or raises its sill and checks the water stands there. ${defs.setLakeLevel.description}`;
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
      picture: { type: "boolean", description: "Also return a picture of the area where the ground or the water changed. The default is false." },
    },
  } as Tool["inputSchema"];
}

/** How often an intention emerges, where a count found it rare (generate through this server, 2026-11-14; the seed
 *  named is pinned by mcp/tests/words.test.ts). */
const ODDS: Partial<Record<(typeof INTENTIONS)[number], string>> = {
  "twin-falls":
    "It is rare. On 96-tile maps it emerged for 4 of 15 Highlands seeds (4, 11, 12, 15), 1 of 30 Canyon seeds (12) and none of 15 River Valley seeds; none of 10 Canyon seeds at 128. Waterfalls: many did not change that.",
};

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
      "Choose the intentions whose words match the player's wish. Example: for \"two waterfalls side by side\", {\"theme\": \"highlands\", \"size\": \"small\", \"seed\": 4, \"intentions\": [\"twin-falls\"]} gives them.",
      "The summary tells which intentions emerged and which did not. Tell the player honestly what emerged.",
      "An intention that did not emerge leaves a map that is made and saves. To try again for it, call generate with the same input and another seed. Some intentions are rare (see intentions): after about five misses, tell the player it did not come out.",
      "The generator refuses a map that does not pass its checks. Then try another seed or other settings.",
      "A 128 map takes some seconds. A 256 map can take some minutes.",
      `Only the newest ${MOST_OPEN} maps stay open. The same input and seed make the same map again.`,
      `If the map is not ready after ${WAIT_WORDS}, the tool says so: then call wait with the handle until it is.`,
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
          maxItems: 2,
          items: { enum: [...INTENTIONS] },
          description: `Outcomes to steer toward, at most two. The generator tries for each one, but some do not emerge. ${INTENTIONS.map((id) => `${id}: ${INTENTION_TEXT[id]}${ODDS[id] ? ` ${ODDS[id]}` : ""}`).join(" ")}`,
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
      "The answer has the start, the water bodies and sources, the rivers (carved ones too), the features (a lake with its area and outlet), the landmarks, the objects, a grid of ground levels and the checks.",
      "X runs west to east and Y south to north.",
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
      "Change a map with operations.",
      "Use a force (op forceResult) to shape land: Carve a river or canyon, Craterize, Erupt a volcano, Quake a cliff, Glaciate a valley, Rift, Deposit, Erode a cave or arch.",
      "Only Carve and Glaciate make water. A crater is a dry bowl: for a crater lake, place a WaterSource in it.",
      "A force removes the sources on the ground it changes, unless settings.sources is \"ride\". If it breaks the ground under the start, the start moves; the result says so.",
      "Move the start with moveEntity and the id of describe's StartingLocation object.",
      "Use brush, sculpt, placeEntity, moveEntity, deleteEntities and paintObjects for precise edits.",
      "Use fillHollow and removeUnfedWater for standing water, setLakeLevel to hold a fed lake at a level, canal to lead water, lake to dig a lake in an outline, ridge to raise high ground along a line. Place a WaterSource or a BadwaterSource with placeEntity.",
      "Each operation is one undo step. The result says what changed.",
      "A refused operation changes nothing; the tool returns the reason.",
      "Tiles are [x, y]: X runs west to east, Y south to north. Runs are [y, x0, x1]. A brush's dabs are quarter tiles: the middle of tile (x, y) is (4x + 2, 4y + 2).",
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
      "Run the checks that the map gets when it is saved. The verdict says in one line what they mean for the player.",
      "Problems that stop saving must be fixed first. Warnings do not stop saving: the map plays, but its colony will find those things hard. Save notes them in the map's description.",
      "A walk in a warning is on foot from the start without building: beavers cannot climb or drop a level without a slope or stairs.",
      "A problem can come with a fix: operations to give to apply.",
    ].join(" "),
    inputSchema: { type: "object", additionalProperties: false, required: ["map"], properties: { map: MAP } },
  },
  {
    name: "save",
    description: [
      "Save the map for Timberborn: the .timber map and its .damgoodmaps.json project, side by side.",
      `The default folder is Timberborn's Maps folder (${mapsFolder()}); if Timberborn's folder is not there, save refuses: then give folder. A folder that you give is used as it is.`,
      "A generated map that keeps its own name is saved as dgm-<theme>-<seed>. A map with another name is saved as dgm- and its name in lower case with hyphens. Save never writes over a file: if the name is taken, it adds -2, -3 and so on.",
      "Save refuses a map with a problem that stops saving. Run check first.",
    ].join(" "),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["map"],
      properties: {
        map: MAP,
        folder: { type: "string", description: "The folder to save in." },
        name: { type: "string", description: "A new name for the map, as Timberborn lists it. It stays the map's name for later saves. A name other than the generated one also names the files." },
      },
    },
  },
  {
    name: "open",
    description:
      "Open a saved .damgoodmaps.json project to edit it again. It opens as the file was saved: edits made after that save are not in it. A .timber map opens too, as an imported map. The tool returns a new handle and a summary.",
    inputSchema: { type: "object", additionalProperties: false, required: ["path"], properties: { path: { type: "string", description: "The file's full path." } } },
  },
];

const text = (t: string) => ({ type: "text" as const, text: t });
const image = (png: Uint8Array) => ({ type: "image" as const, data: Buffer.from(png).toString("base64"), mimeType: "image/png" });

/** What the checks mean for the player, in one line. */
function verdictOf(c: { blocking: unknown[]; warnings: unknown[] }): string {
  if (c.blocking.length) return `It does not save yet: fix the ${c.blocking.length === 1 ? "problem" : `${c.blocking.length} problems`} in stopSaving first.`;
  const n = c.warnings.length;
  if (!n) return "It saves and passes every check.";
  return `It saves and Timberborn plays it, but ${n === 1 ? "a warning says" : `${n} warnings say`} what its colony will find hard. Tell the player, or fix ${n === 1 ? "it" : "them"} (a warning with fix has operations for apply; a start warning can also be mended by moving the start).`;
}

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
  // (the intentions asked for are the spec's; the generator draws the others itself)
  const asked = new Set(s.spec?.intentions ?? []);
  // (an intention asked for and not checked: the generator set it aside, in a round that makes a map with none)
  const aside = [...asked].filter((id) => !g.intentions.some((x) => x.id === id));
  const missed = [...g.intentions.filter((x) => asked.has(x.id) && !x.ok).map((x) => x.id), ...aside];
  const rows = [
    ...g.intentions.map((x) => `- ${x.id}${asked.has(x.id) ? " (asked for)" : ""}: ${x.ok ? "emerged" : "did not emerge"} (${x.note})`),
    ...aside.map((id) => `- ${id} (asked for): did not emerge (the generator set it aside to make a map that passes its checks)`),
  ];
  const emerged = rows.length ? `Intentions:\n${rows.join("\n")}` : "Intentions: none.";
  const retry = missed.length
    ? `\n${missed.join(" and ")} did not emerge. The map is made and saves as it is. To try again, call generate with the same input and another seed: each seed gives another map. ${missed.map((id) => ODDS[id as keyof typeof ODDS]).filter(Boolean).join(" ")} After about five misses, tell the player it did not come out.`.replace("  ", " ")
    : "";
  const pic = picture(s);
  return {
    content: [text(`Map ${g.handle} (generated in ${(g.ms / 1000).toFixed(1)} s).\n${summaryOf(s, checksOf(s))}\n${s.description().text}\n${emerged}${retry}\n${pic.legend}`), image(pic.png)],
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
        if (args.picture) {
          // the ground that changed, else the water that came or went
          const area = c.ground.area ?? c.water.area;
          if (area) {
            const pic = picture(s, { region: around(area, s.size.x, s.size.y) });
            content.push(text(pic.legend), image(pic.png));
          } else content.push(text("No ground or water changed, so there is no picture. Call picture to see the map."));
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
          verdict: verdictOf(c),
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
