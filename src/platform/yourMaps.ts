// Your maps' storage in the browser (PLAN §20 D234, D330): the model is src/core/library/yourMaps.ts;
// this is its IndexedDB adapter. A database of its own, as the page's other stores have (the
// autosave and the Timberborn folder each have theirs, so none bumps another's version). Two stores:
// the entries (small: the list reads them all) and the project files (read only to open a map).
// Every call fails quietly and says why (`StoreResult`): no browser storage, or storage full.

import { byEdited, withSize, type Removed, type StoreResult, type YourMapEntry, type YourMapsStore } from "../core/library/yourMaps";

export const YOUR_MAPS_DB = "dgm-your-maps";
const ENTRIES = "entries";
const PROJECTS = "projects";

function isQuota(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name ?? "";
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

let asked = false;
/** Once per page load, in Chromium only (`userAgentData` exists only there: Firefox would show a prompt, WebKit has its own
 *  rules): ask the browser to keep the site's storage. The answer and any error are ignored. */
function askToKeepStorage(): void {
  if (asked) return;
  asked = true;
  try {
    const nav = (globalThis as { navigator?: { userAgentData?: unknown; storage?: { persist?: () => Promise<boolean> } } }).navigator;
    if (nav?.userAgentData && nav.storage?.persist) nav.storage.persist().catch(() => {});
  } catch {
    /* ignored */
  }
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Your maps in IndexedDB. `factory` is the browser's `indexedDB` (a test passes fake-indexeddb's; null: no browser storage). */
export function openYourMaps(factory: IDBFactory | null = (globalThis as { indexedDB?: IDBFactory }).indexedDB ?? null): YourMapsStore {
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
      try {
        const out = await fn(t.objectStore(ENTRIES), t.objectStore(PROJECTS));
        await done;
        return out;
      } catch (e) {
        try { t.abort(); } catch { /* already aborted or committed */ }
        await done.catch(() => undefined);
        throw e;
      }
    } finally {
      db.close();
    }
  }

  async function write(fn: (entries: IDBObjectStore, projects: IDBObjectStore) => Promise<StoreResult | void>): Promise<StoreResult> {
    try {
      return (await tx("readwrite", fn)) ?? { ok: true };
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
      e.storageVersion = crypto.randomUUID();
      await request(entries.put(e));
    });
  }

  async function readProject(id: string): Promise<Uint8Array | null> {
    try {
      const p = await tx("readonly", (_, projects) => request(projects.get(id) as IDBRequest<Uint8Array | undefined>));
      return p instanceof Uint8Array ? p : null;
    } catch {
      return null;
    }
  }

  return {
    async list() {
      try {
        const all = await tx("readonly", (entries) => request(entries.getAll() as IDBRequest<YourMapEntry[]>));
        // an entry saved before sizes were kept gets its size from its project, once
        const filled: YourMapEntry[] = [];
        for (const e of all) {
          if (e.size) continue;
          const p = await readProject(e.id);
          const f = p ? withSize(e, p) : e;
          if (f !== e) {
            Object.assign(e, f);
            filled.push(f);
          }
        }
        if (filled.length) {
          await write(async (entries) => {
            for (const f of filled) {
              const cur = (await request(entries.get(f.id))) as YourMapEntry | undefined;
              if (cur && !cur.size) await request(entries.put({ ...cur, size: f.size }));
            }
          });
        }
        return byEdited(all);
      } catch {
        return [];
      }
    },
    project: readProject,
    put(entry, project, expected) {
      return write(async (entries, projects) => {
        const current = (await request(entries.get(entry.id))) as YourMapEntry | undefined;
        if (expected !== undefined && (current?.storageVersion ?? null) !== expected) return { ok: false, reason: "conflict" };
        const storageVersion = crypto.randomUUID();
        await request(entries.put({ ...withSize(entry, project), bytes: project.length, storageVersion }));
        await request(projects.put(project, entry.id));
        return expected === undefined ? { ok: true as const } : { ok: true as const, storageVersion };
      }).then((r) => {
        if (r.ok) askToKeepStorage();
        return r;
      });
    },
    rename(id, name) {
      return update(id, (e) => void (e.name = name));
    },
    markSaved(id, revision) {
      return update(id, (e) => void (e.savedToTimberborn = revision));
    },
    copy(id, c) {
      return write(async (entries, projects) => {
        const e = (await request(entries.get(id))) as YourMapEntry | undefined;
        const p = (await request(projects.get(id))) as Uint8Array | undefined;
        if (!e || !p) return;
        await request(entries.put({ ...e, storageVersion: crypto.randomUUID(), id: c.id, name: c.name, createdAt: c.at, editedAt: c.at, savedToTimberborn: null }));
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
        await request(entries.put({ ...r.entry, storageVersion: crypto.randomUUID() }));
        await request(projects.put(r.project, r.entry.id));
      });
    },
  };
}
