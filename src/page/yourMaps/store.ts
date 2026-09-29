// Your maps' storage (PLAN §20 D234, amended by D330; docs/UI-BRIEF.md §3, §6): every edited map,
// kept in this browser. Each entry holds the map's project file (settings, seed and edits: it
// reopens exactly as it was left) and a small top-down thumbnail. The last 30 unstarred maps are
// kept; a star keeps a map for good; the oldest unstarred ones drop off. When browser storage runs
// out it says so plainly instead of losing maps quietly.
//
// IndexedDB, in a database of its own, as the page's other stores are (src/platform: the autosave
// and the Timberborn folder each have theirs, so none bumps another's version). Two stores: the
// entries (small: the list reads them all) and the project files (read only to open a map).

/** Unstarred maps kept (D234 (4)). */
export const KEEP = 30;

export const YOUR_MAPS_DB = "dgm-your-maps";
const ENTRIES = "entries";
const PROJECTS = "projects";

export interface YourMapEntry {
  id: string;
  name: string;
  /** Where the map came from (a generated map, a real place, an imported .timber). */
  kind: "generated" | "place" | "import";
  /** ISO times: first kept, and last edited. */
  createdAt: string;
  editedAt: string;
  starred: boolean;
  /** A PNG data URL (`thumbnailDataUrl`), or null. */
  thumbnail: string | null;
  /** Changes with every saved version of the map (the page's count of its edits works). */
  revision: number;
  /** The revision last saved to Timberborn, or null: the list marks a map whose latest version is
   *  already in the game (D234 (3)). */
  savedToTimberborn: number | null;
  /** The project file's size in bytes. */
  bytes: number;
}

/** A save that could not be kept: storage is full (say so plainly), or there is no browser storage
 *  at all (a private window, blocked site data). */
export type StoreResult = { ok: true } | { ok: false; reason: "full" | "unavailable" };

/** A removed map, held so the removal can be undone. */
export interface Removed {
  entry: YourMapEntry;
  project: Uint8Array;
}

/** The words for a save that failed (D234 (5)). */
export function storeProblem(r: StoreResult): string | null {
  if (r.ok) return null;
  return r.reason === "full"
    ? "Browser storage is full, so Your maps can't keep this map. Unstar some maps, or download them as project files."
    : "This browser isn't keeping Your maps (private window or blocked site data). Download the project file to keep a map.";
}

/** Which entries drop off: all but the newest `KEEP` unstarred ones (starred maps always stay).
 *  `keep` is never dropped (the map just saved). */
export function toDrop(entries: readonly YourMapEntry[], keep?: string): string[] {
  const unstarred = entries.filter((e) => !e.starred && e.id !== keep).sort((a, b) => b.editedAt.localeCompare(a.editedAt));
  const room = keep && entries.some((e) => e.id === keep && !e.starred) ? KEEP - 1 : KEEP;
  return unstarred.slice(Math.max(0, room)).map((e) => e.id);
}

/** The list's order: newest edit first. */
export function byEdited(entries: readonly YourMapEntry[]): YourMapEntry[] {
  return [...entries].sort((a, b) => b.editedAt.localeCompare(a.editedAt));
}

function isQuota(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name ?? "";
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

export interface YourMapsStore {
  /** Every entry, newest edit first ([] without storage). */
  list(): Promise<YourMapEntry[]>;
  /** A map's project file, or null. */
  project(id: string): Promise<Uint8Array | null>;
  /** Keep a map (a new one, or a new version of one), then drop the oldest unstarred past `KEEP`. */
  put(entry: YourMapEntry, project: Uint8Array): Promise<StoreResult>;
  rename(id: string, name: string): Promise<StoreResult>;
  star(id: string, starred: boolean): Promise<StoreResult>;
  /** The latest version was saved to Timberborn. */
  markSaved(id: string, revision: number): Promise<StoreResult>;
  /** A copy under a new id and name (to try an idea without risking the original). */
  copy(id: string, copy: { id: string; name: string; at: string }): Promise<StoreResult>;
  /** Remove a map; the result undoes it with `restore`. Null when there was nothing to remove. */
  remove(id: string): Promise<Removed | null>;
  restore(r: Removed): Promise<StoreResult>;
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Your maps in IndexedDB. `factory` is the browser's `indexedDB` (a test passes fake-indexeddb's). */
export function openYourMaps(factory: IDBFactory | undefined = (globalThis as { indexedDB?: IDBFactory }).indexedDB): YourMapsStore {
  const open = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      if (!factory) return reject(new Error("no browser storage"));
      let req: IDBOpenDBRequest;
      try {
        req = factory.open(YOUR_MAPS_DB, 1);
      } catch (e) {
        return reject(e);
      }
      req.onupgradeneeded = () => {
        req.result.createObjectStore(ENTRIES, { keyPath: "id" });
        req.result.createObjectStore(PROJECTS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("storage is blocked"));
    });

  /** One transaction over both stores; resolves when it commits. */
  async function tx<T>(mode: IDBTransactionMode, fn: (entries: IDBObjectStore, projects: IDBObjectStore) => Promise<T>): Promise<T> {
    const db = await open();
    try {
      const t = db.transaction([ENTRIES, PROJECTS], mode);
      const done = new Promise<void>((resolve, reject) => {
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error ?? new Error("storage aborted"));
      });
      const out = await fn(t.objectStore(ENTRIES), t.objectStore(PROJECTS));
      await done;
      return out;
    } finally {
      db.close();
    }
  }

  async function write(fn: (entries: IDBObjectStore, projects: IDBObjectStore) => Promise<void>): Promise<StoreResult> {
    try {
      await tx("readwrite", fn);
      return { ok: true };
    } catch (e) {
      // a full disk aborts the transaction with a QuotaExceededError
      return { ok: false, reason: isQuota(e) ? "full" : "unavailable" };
    }
  }

  async function update(id: string, change: (e: YourMapEntry) => void): Promise<StoreResult> {
    return write(async (entries) => {
      const e = (await request(entries.get(id))) as YourMapEntry | undefined;
      if (!e) return;
      change(e);
      await request(entries.put(e));
    });
  }

  return {
    async list() {
      try {
        return byEdited(await tx("readonly", (entries) => request(entries.getAll() as IDBRequest<YourMapEntry[]>)));
      } catch {
        return [];
      }
    },
    async project(id) {
      try {
        const p = await tx("readonly", (_, projects) => request(projects.get(id) as IDBRequest<Uint8Array | undefined>));
        return p instanceof Uint8Array ? p : null;
      } catch {
        return null;
      }
    },
    put(entry, project) {
      return write(async (entries, projects) => {
        await request(entries.put({ ...entry, bytes: project.length }));
        await request(projects.put(project, entry.id));
        const all = (await request(entries.getAll())) as YourMapEntry[];
        for (const id of toDrop(all, entry.id)) {
          await request(entries.delete(id));
          await request(projects.delete(id));
        }
      });
    },
    rename(id, name) {
      return update(id, (e) => void (e.name = name));
    },
    star(id, starred) {
      return update(id, (e) => void (e.starred = starred));
    },
    markSaved(id, revision) {
      return update(id, (e) => void (e.savedToTimberborn = revision));
    },
    copy(id, c) {
      return write(async (entries, projects) => {
        const e = (await request(entries.get(id))) as YourMapEntry | undefined;
        const p = (await request(projects.get(id))) as Uint8Array | undefined;
        if (!e || !p) return;
        await request(entries.put({ ...e, id: c.id, name: c.name, createdAt: c.at, editedAt: c.at, starred: false, savedToTimberborn: null }));
        await request(projects.put(p, c.id));
      });
    },
    async remove(id) {
      try {
        return await tx("readwrite", async (entries, projects) => {
          const entry = (await request(entries.get(id))) as YourMapEntry | undefined;
          const project = (await request(projects.get(id))) as Uint8Array | undefined;
          if (!entry || !project) return null;
          await request(entries.delete(id));
          await request(projects.delete(id));
          return { entry, project };
        });
      } catch {
        return null;
      }
    },
    restore(r) {
      return write(async (entries, projects) => {
        await request(entries.put(r.entry));
        await request(projects.put(r.project, r.entry.id));
      });
    },
  };
}

/** A new entry's id. */
export function newMapId(): string {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return `m${a[0].toString(36)}${a[1].toString(36)}`;
}
