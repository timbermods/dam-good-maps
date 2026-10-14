// Shared by the collaboration contract tests: a generated map, a host with two replicas, and a
// seeded stream of mixed edits from two authors (every brush, Select's sculpt actions, objects placed,
// moved, changed and removed, and every released force), delivered the way the transport will:
// the host orders, every replica applies the commit.

import { decodeProject } from "../../src/core/doc/document";
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { CollabHost, CollabReplica, stable, type Command, type Commit, type ForceGesture, type PlayerId, type Reject, type Snapshot } from "../../src/core/collab";
import type { BrushTool } from "../../src/core/features/raster/brush";
import { generate } from "../../src/core/gen/generate";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { DEPOSIT_DEFAULTS } from "../../src/core/forces/deposit";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { RIFT_DEFAULTS } from "../../src/core/forces/rift";
import type { ForceRequest } from "../../src/core/forces/start";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { rng } from "./forceEverywhere";

/** A generated map as the project bytes the app saves. */
export function mapProject(seed: number, theme: ThemeId, size: number): Uint8Array {
  return MapSession.fromGenerated(generate(makeSpec({ seed, theme, size: { x: size, y: size } }))).project();
}

/** Two project files hold the same document (their JSON may order a log entry's keys differently after a reopen: `step` and `undo`). */
export const sameProject = (a: Uint8Array, b: Uint8Array): boolean => stable(decodeProject(a)) === stable(decodeProject(b));

/** The live editor leaves the water to settle in the background; so do the peers here. */
export const live = (s: MapSession) => s.setWaterMode("defer");

export const openProject = (bytes: Uint8Array): MapSession => {
  const s = MapSession.open(decodeProject(bytes));
  live(s);
  return s;
};

export interface Table {
  host: CollabHost;
  /** The replicas, by player id; the host's own player is not among them. */
  guests: Map<PlayerId, CollabReplica>;
  /** Every refusal the host made, with its reason. */
  refused: string[];
  /** Entries ordered. */
  ordered: number;
}

export const HOST = "ada";
export const GUEST = "bo";
export const WATCHER = "cy";

/** A host with two replicas: bo, who edits, and cy, who only watches. */
export function sit(bytes: Uint8Array, hostOptions: Partial<ConstructorParameters<typeof CollabHost>[1]> = {}, players: PlayerId[] = [GUEST, WATCHER]): Table {
  const host = new CollabHost(openProject(bytes), { hostId: HOST, ...hostOptions });
  const guests = new Map<PlayerId, CollabReplica>();
  for (const id of players) {
    host.join(id);
    guests.set(id, CollabReplica.fromSnapshot(host.snapshot(), id, {}, live));
  }
  return { host, guests, refused: [], ordered: 0 };
}

/** Send every replica a message. */
export function deliver(t: Table, message: Commit | Reject | { kind: "map-opening" }): void {
  for (const g of t.guests.values()) {
    const r = g.receive(message);
    if (!r.ok) throw new Error(`${g.playerId}: ${r.reason}`);
  }
}

/** `author` asks for `command` at their view; the host orders it and every replica applies it. */
export function act(t: Table, author: PlayerId, command: Command): Commit | Reject {
  const request = author === HOST ? t.host.request(command) : (t.guests.get(author)!.request(command) as ReturnType<CollabHost["request"]>);
  const answer = t.host.submit(author, request);
  if (answer.kind === "commit") {
    t.ordered++;
    deliver(t, answer);
  } else {
    t.refused.push(answer.reason);
    t.guests.get(author)?.receive(answer);
  }
  return answer;
}

export const GUID = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

/** The edits a stream makes, by kind. */
export const KINDS = ["raise", "lower", "flatten", "smooth", "naturalize", "sculpt", "place", "move", "props", "remove", "carve", "craterize", "erupt", "lift", "glaciate", "rift", "deposit"] as const;
export type Kind = (typeof KINDS)[number];
export const BRUSH_KINDS: readonly Kind[] = ["raise", "lower", "flatten", "smooth", "naturalize"];
export const FORCE_KINDS: readonly Kind[] = ["carve", "craterize", "erupt", "lift", "glaciate", "rift", "deposit"];
export const CHEAP_KINDS: readonly Kind[] = [...BRUSH_KINDS, "sculpt", "place", "move", "props", "remove"];

/** A seeded source of edits for a map `W` wide. */
export class Stream {
  private next: () => number;
  private ids = 1;
  /** Objects this stream placed and has not removed (id, template). */
  private mine: { id: string; template: string }[] = [];

  constructor(
    seed: number,
    readonly W: number,
  ) {
    this.next = rng(seed * 7919 + W);
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)];
  }

  private at(margin = 12): [number, number] {
    return [margin + Math.floor(this.next() * (this.W - 2 * margin)), margin + Math.floor(this.next() * (this.W - 2 * margin))];
  }

  /** A wandering stroke round a place, as a player paints: three passes. */
  private stroke(tool: BrushTool): EditOp {
    const [x, y] = this.at();
    const dabs: number[] = [];
    const c = (v: number) => Math.max(0, Math.min(this.W - 1, v));
    for (let rep = 0; rep < 2; rep++) for (let k = 0; k < 24; k++) dabs.push(Math.round(c(x - 8 + k * 0.6) * 4), Math.round(c(y + 3 * Math.sin(k / 5)) * 4));
    return { op: "brush", params: { tool, size: 4 + Math.floor(this.next() * 6), strength: 10, ...(tool === "flatten" ? { level: 2 + Math.floor(this.next() * 12) } : {}), ...(tool === "naturalize" ? { seed: Math.floor(this.next() * 1e6) } : {}), dabs } } as EditOp;
  }

  private force(kind: Kind): ForceGesture {
    const [x, y] = this.at(14);
    const power = 30 + Math.floor(this.next() * 60);
    const seed = 1 + Math.floor(this.next() * 1e5);
    const base = { cut: null, natural: true } as const;
    const a = this.next() * Math.PI;
    const c = (v: number) => Math.max(1, Math.min(this.W - 2, v));
    const line = [-12, 0, 12].map((d) => ({ x: c(x + d * Math.cos(a)), y: c(y + d * Math.sin(a)) }));
    const id = GUID(this.ids++ + 1000);
    let request: ForceRequest;
    switch (kind) {
      case "carve":
        request = { verb: "carve", settings: { ...CARVE_DEFAULTS, power, seed, dry: true }, origin: [x, y], ...base };
        return { id, sourceId: GUID(this.ids++ + 5000), request };
      case "craterize":
        request = { verb: "craterize", settings: { ...CRATER_DEFAULTS, power, seed }, origin: [x, y], ...base };
        break;
      case "erupt":
        request = { verb: "erupt", settings: { ...ERUPT_DEFAULTS, power, seed }, origin: [x, y], ...base };
        break;
      case "lift":
        request = { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "lift", power, seed }, path: line, side: 1, ...base };
        break;
      case "glaciate":
        request = { verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, power, seed }, origin: [x, y], ...base };
        break;
      case "rift":
        request = { verb: "rift", settings: { ...RIFT_DEFAULTS, power, size: 12, seed }, path: line, ...base };
        break;
      default:
        request = { verb: "deposit", settings: { ...DEPOSIT_DEFAULTS, power, size: 16, seed }, path: line, ...base };
    }
    return { id, request };
  }

  /** Placing `template` somewhere the game accepts it, or null. */
  private place(template: string, s: MapSession): Command | null {
    for (let tries = 0; tries < 40; tries++) {
      const [x, y] = this.at(6);
      const id = GUID(this.ids++ + 20000);
      const op = { op: "placeEntity", params: { id, template, x, y, orientation: "Cw0", ...(template === "WaterSource" ? { components: { WaterSource: { SpecifiedStrength: 1, CurrentStrength: 1 } } } : {}) } } as EditOp;
      if (!s.check(op).length) {
        this.mine.push({ id, template });
        return { kind: "edit", ops: [op], label: `Place ${template}` };
      }
    }
    return null;
  }

  /** The next command of `kind` against the host's map as it is (placing and moving look for ground the game accepts). */
  command(kind: Kind, s: MapSession): Command | null {
    // (a force may have taken an object this stream placed)
    const standing = new Set(s.built.entities.map((e) => e.id));
    this.mine = this.mine.filter((o) => standing.has(o.id));
    if (BRUSH_KINDS.includes(kind)) return { kind: "edit", ops: [this.stroke(kind as BrushTool)], label: kind };
    if (FORCE_KINDS.includes(kind)) return { kind: "force", gesture: this.force(kind) };
    switch (kind) {
      case "sculpt": {
        const [x, y] = this.at();
        const w = 3 + Math.floor(this.next() * 6);
        const cells: [number, number, number][] = [];
        const tiles: number[] = [];
        for (let dy = 0; dy < w; dy++) {
          cells.push([y + dy, x, x + w - 1]);
          for (let dx = 0; dx < w; dx++) tiles.push((y + dy) * this.W + x + dx);
        }
        const mode = this.pick(["raise", "lower", "flatten", "smooth", "terrace"] as const);
        const params = { mode, cells, ...(mode === "raise" || mode === "lower" ? { amount: 1 } : {}), ...(mode === "flatten" ? { level: 5 + Math.floor(this.next() * 6) } : {}), ...(mode === "terrace" ? { step: 2 } : {}) };
        return { kind: "select", ops: [{ op: "sculpt", params } as EditOp], label: `Select: ${mode}`, tiles };
      }
      case "place":
        return this.place(this.pick(["Pine", "Oak", "Birch", "BlueberryBush", "WaterSource"] as const), s);
      case "move": {
        if (!this.mine.length) return null;
        const o = this.pick(this.mine);
        for (let tries = 0; tries < 40; tries++) {
          const [x, y] = this.at(6);
          const op = { op: "moveEntity", params: { id: o.id, x, y } } as EditOp;
          if (!s.check(op).length) return { kind: "edit", ops: [op], label: `Move ${o.template}` };
        }
        return null;
      }
      case "props": {
        const sources = this.mine.filter((o) => o.template === "WaterSource");
        if (!sources.length) return this.place("WaterSource", s);
        const n = 1 + Math.floor(this.next() * 4);
        return { kind: "edit", ops: [{ op: "setEntityProps", params: { id: this.pick(sources).id, components: { WaterSource: { SpecifiedStrength: n, CurrentStrength: n } } } } as EditOp], label: "Change source" };
      }
      case "remove": {
        if (!this.mine.length) return null;
        const k = Math.floor(this.next() * this.mine.length);
        const [o] = this.mine.splice(k, 1);
        return { kind: "edit", ops: [{ op: "deleteEntities", params: { entities: [o.id] } } as EditOp], label: `Remove ${o.template}` };
      }
    }
    return null;
  }
}

export function snapshotOf(t: Table): Snapshot {
  return t.host.snapshot();
}
