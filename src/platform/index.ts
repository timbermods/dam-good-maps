// Platform adapters (PLAN §19.9): the only code that differs between the website and the future
// Claude artifact edition. The core never touches the DOM or a platform API.

// (first: on a first visit the page reloads once, cross-origin isolated, before anything else runs)
import "./isolation";
import { transfer, wrap, type Remote } from "comlink";
import type { GeneratorApi } from "../worker/generator.worker";
import type { ShowcaseMessage, ShowcaseRequest } from "../worker/showcaseApi";
import type { MapSpec } from "../core/spec/mapspec";
import { parallelWaterSupported, threadsFor } from "../core/sim/parallelPolicy";

/** workers: module URLs on the website (the artifact build will inline them as blobs). The
 *  generator and the editor's map run in one worker; the editor's checks run in a second one, on
 *  a replica of the open map, and the two talk over a port of their own. */
export function createGenerator(): Remote<GeneratorApi> {
  return createGeneratorWorker().api;
}

/** The generator and its checks worker, with `stop`: both end at once (a map being made is cancelled, the page
 *  then opens the map that was open in a new one). */
export function createGeneratorWorker(): { api: Remote<GeneratorApi>; stop(): void } {
  const worker = new Worker(new URL("../worker/generator.worker.ts", import.meta.url), { type: "module" });
  const api = wrap<GeneratorApi>(worker);
  let checks: Worker | null = null;
  // the water's helper threads (src/core/sim/parallel.ts), started here so they are ready by the first big map
  const helpers = waterHelpers();
  const ports = helpers.map((h) => h.port);
  if (ports.length) void api.waterHelpers(transfer(ports, ports));
  try {
    checks = new Worker(new URL("../worker/checks.worker.ts", import.meta.url), { type: "module" });
    const ch = new MessageChannel();
    checks.postMessage({ checksPort: ch.port1 }, [ch.port1]);
    void api.connectChecks(transfer(ch.port2, [ch.port2]));
  } catch {
    // no second worker: the checks run in the first one
  }
  return {
    api,
    stop: () => {
      worker.terminate();
      checks?.terminate();
      for (const h of helpers) h.worker.terminate();
    },
  };
}

/** The multi-core water's helpers for the editor's worker, each reached through a port (none where it doesn't
 *  run: a page not cross-origin isolated, WebKit, fewer than four cores). The worker starts more for bigger maps. */
function waterHelpers(): { worker: Worker; port: MessagePort }[] {
  if (!parallelWaterSupported(true)) return [];
  const count = Math.min(threadsFor(256 * 256), (navigator.hardwareConcurrency || 4) - 1) - 1;
  if (count < 2) return [];
  const helpers: { worker: Worker; port: MessagePort }[] = [];
  try {
    for (let k = 0; k < count; k++) {
      const worker = new Worker(new URL("../worker/waterStrip.worker.ts", import.meta.url), { type: "module" });
      const ch = new MessageChannel();
      helpers.push({ worker, port: ch.port2 });
      worker.postMessage({ waterPort: ch.port1 }, [ch.port1]);
    }
  } catch {
    for (const h of helpers) {
      h.worker.terminate();
      h.port.close();
    }
    return []; // helper creation is optional: keep the one-thread generator working
  }
  return helpers;
}

/** D329's background search: a generator worker of its own (no checks worker), so the editor's
 *  never waits on it; `stop` ends it at once (a new map was asked for). */
export function createBackground(): { api: Remote<GeneratorApi>; stop(): void } {
  // ("background": its water stays on one thread, generator.worker.ts)
  const worker = new Worker(new URL("../worker/generator.worker.ts", import.meta.url), { type: "module", name: "background" });
  return { api: wrap<GeneratorApi>(worker), stop: () => worker.terminate() };
}

/** Showcase mode (D488 (2)): its search in a worker of its own (worker/showcase.worker.ts, the messages in
 *  worker/showcaseApi.ts), so the editor never slows. `start` begins a search and `onMessage` hears each map
 *  made and the end; `stop` ends it after the map being made (a `done` with what it found); `terminate` ends
 *  it at once. */
export function createShowcase(onMessage: (m: ShowcaseMessage) => void): { start(spec: MapSpec, budgetMs: number, tries?: number): void; stop(): void; terminate(): void } {
  const worker = new Worker(new URL("../worker/showcase.worker.ts", import.meta.url), { type: "module", name: "showcase" });
  worker.onmessage = (e: MessageEvent<ShowcaseMessage>) => onMessage(e.data);
  worker.onerror = (e) => onMessage({ kind: "error", message: e.message || "the showcase search stopped" });
  const send = (m: ShowcaseRequest) => worker.postMessage(m);
  return {
    start: (spec, budgetMs, tries) => send({ kind: "start", spec, budgetMs, ...(tries !== undefined ? { tries } : {}) }),
    stop: () => send({ kind: "stop" }),
    terminate: () => worker.terminate(),
  };
}

/** files: save bytes under a file name. The artifact edition wraps .timber in a .zip (D10). */
export function saveFile(bytes: Uint8Array, name: string, type = "application/octet-stream"): void {
  const blob = new Blob([bytes as unknown as ArrayBuffer], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** files: read a file the player picked (a file input or a drop). */
export async function readFile(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

// ------------------------------------------------------------------------------------ storage

/** storage: the autosave (EDITOR_PLAN §3 "Persistence"). Browser storage can be missing or full
 *  (private windows, blocked site data): every call fails quietly and says so. */
export interface Autosave {
  bytes: Uint8Array;
  name: string;
  /** ISO time of the save. */
  savedAt: string;
  kind: "generated" | "import";
  /** The screen the player was on: a reload in the editor opens the editor again. */
  screen: "settings" | "editor";
}

const DB = "dam-good-maps";
const STORE = "autosave";
const KEY = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB, 1);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("storage is blocked"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("storage aborted"));
    });
  } finally {
    db.close();
  }
}

export const storage = {
  /** Save the autosave; false when browser storage is unavailable or full. */
  async save(a: Autosave): Promise<boolean> {
    try {
      await withStore("readwrite", (s) => s.put(a, KEY));
      return true;
    } catch {
      return false;
    }
  },
  async load(): Promise<Autosave | null> {
    try {
      const a = (await withStore<Autosave | undefined>("readonly", (s) => s.get(KEY) as IDBRequest<Autosave | undefined>)) ?? null;
      return a && a.bytes instanceof Uint8Array ? a : null;
    } catch {
      return null;
    }
  },
  async clear(): Promise<void> {
    try {
      await withStore("readwrite", (s) => s.delete(KEY));
    } catch {
      // nothing to clear
    }
  },
};

// ---------------------------------------------------------------------- save to Timberborn (D162)

// Its own database, never the autosave one: the live site, /preview/ and future versioned builds
// share an origin and so share IndexedDB. Bumping a shared database's version so an older tab
// (still open, or an older cached build) opens it at a lower version throws a VersionError there
// and breaks its autosave. A separate database can gain stores freely without touching that one.
const FOLDER_DB = "dgm-folders";
const FOLDER_STORE = "folders";
const FOLDER_KEY = "timberborn-maps";

function openFolderDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(FOLDER_DB, 1);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => req.result.createObjectStore(FOLDER_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("storage is blocked"));
  });
}

async function withFolderStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openFolderDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(FOLDER_STORE, mode);
      const req = fn(tx.objectStore(FOLDER_STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("storage aborted"));
    });
  } finally {
    db.close();
  }
}

declare global {
  interface Window {
    /** Chrome and Edge only; undefined everywhere else. */
    showDirectoryPicker?(options?: {
      id?: string;
      mode?: "read" | "readwrite";
      startIn?: "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
    }): Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemHandle {
    /** Chromium's permission extension to the File System Access API; not in the DOM lib. */
    queryPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
    requestPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  }
}

/** Whether this browser can save straight into a folder. Chrome and Edge; not Firefox or Safari. */
export function canSaveToTimberborn(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

/** The remembered Maps folder, if permission still stands (asking again counts as "still stands"). */
async function recallFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await withFolderStore<FileSystemDirectoryHandle | undefined>("readonly", (s) => s.get(FOLDER_KEY) as IDBRequest<FileSystemDirectoryHandle | undefined>);
    if (!handle) return null;
    const mode = { mode: "readwrite" as const };
    if ((await handle.queryPermission?.(mode)) === "granted") return handle;
    if ((await handle.requestPermission?.(mode)) === "granted") return handle;
    return null;
  } catch {
    return null;
  }
}

async function rememberFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    await withFolderStore("readwrite", (s) => s.put(handle, FOLDER_KEY));
  } catch {
    // the folder still works this once; it just won't be remembered next time
  }
}

async function forgetFolder(): Promise<void> {
  try {
    await withFolderStore("readwrite", (s) => s.delete(FOLDER_KEY));
  } catch {
    // nothing remembered, or storage blocked
  }
}

async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  const handle = await window.showDirectoryPicker!({ id: "timberborn-maps", mode: "readwrite", startIn: "documents" });
  const granted = await handle.requestPermission?.({ mode: "readwrite" });
  if (granted && granted !== "granted") throw new DOMException("the player refused write access", "NotAllowedError");
  return handle;
}

async function writeIntoFolder(folder: FileSystemDirectoryHandle, name: string, bytes: Uint8Array): Promise<void> {
  const file = await folder.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(bytes as unknown as ArrayBuffer);
  await writable.close();
}

async function nameTaken(folder: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await folder.getFileHandle(name);
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") return false;
    throw e; // some other failure (permission, a blocked folder): let the caller fall back
  }
}

/** "dgm-river-valley-7.timber" -> "dgm-river-valley-7-2.timber" (D345, B10). */
function withSuffix(name: string, n: number): string {
  const dot = name.lastIndexOf(".");
  const stem = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? "" : name.slice(dot);
  return `${stem}-${n}${ext}`;
}

/** Never overwrite a map with the same name (D162 amendment, Kyler 2026-09): the first name not
 *  already in the folder, trying "name-2", "name-3" and so on after the plain name. */
async function freeName(folder: FileSystemDirectoryHandle, name: string): Promise<string> {
  if (!(await nameTaken(folder, name))) return name;
  for (let n = 2; ; n++) {
    const candidate = withSuffix(name, n);
    if (!(await nameTaken(folder, candidate))) return candidate;
  }
}

/** Where Timberborn reads custom maps from, as the player sees it. */
export const TIMBERBORN_MAPS_PATH = "Documents\\Timberborn\\Maps";

/** The one test of a chosen folder: the browser hands over the folder's name but not its path, so a folder called
 *  Maps is as close as a page can get to Timberborn's. Anything else (Documents, Downloads) is refused. */
export function isMapsFolder(name: string): boolean {
  return name.trim().toLowerCase() === "maps";
}

/** The plain line shown when the folder picked is not named Maps. */
export function wrongFolderNote(picked: string): string {
  return `"${picked}" isn't Timberborn's Maps folder. Choose ${TIMBERBORN_MAPS_PATH}.`;
}

/** The picker closed without a choice, not a failure: nothing should be saved and nothing said. */
function isCancel(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: string }).name === "AbortError";
}

/** `savedAs` is set only when the name had to change to avoid overwriting an existing map. `cancelled`: the player
 *  closed the folder picker, so nothing was saved or downloaded. `wrong-folder`: the folder picked wasn't named Maps,
 *  so nothing was saved and the previous choice stands. `download` with `failed`: the folder could not be written, so
 *  the map was downloaded instead. */
export type SaveToTimberbornResult =
  | { via: "fsa"; folder: string; savedAs?: string }
  | { via: "download"; failed?: true; forgotten?: true }
  | { via: "cancelled" }
  | { via: "wrong-folder"; picked: string };

/** Swapped out in tests so the fallback and the write can be checked without a real browser. */
export interface SaveToTimberbornDeps {
  supported(): boolean;
  recall(): Promise<FileSystemDirectoryHandle | null>;
  remember(handle: FileSystemDirectoryHandle): Promise<void>;
  pick(): Promise<FileSystemDirectoryHandle>;
  freeName(folder: FileSystemDirectoryHandle, name: string): Promise<string>;
  write(folder: FileSystemDirectoryHandle, name: string, bytes: Uint8Array): Promise<void>;
  download(bytes: Uint8Array, name: string): void;
  /** Drop the remembered folder (it could not be written, so the next save asks again). */
  forget?(): Promise<void>;
}

/** Exported so a test can reach the real IndexedDB-backed folder store without a real browser's `window`. */
export const liveDeps: SaveToTimberbornDeps = {
  supported: canSaveToTimberborn,
  recall: recallFolder,
  remember: rememberFolder,
  forget: forgetFolder,
  pick: pickFolder,
  freeName,
  write: writeIntoFolder,
  download: saveFile,
};

/** Where a save will go, found before the map is built: the folder, or why it has to be a download or nothing. */
export type FolderChoice = { via: "folder"; folder: FileSystemDirectoryHandle } | { via: "download"; failed?: true; forgotten?: true } | { via: "cancelled" } | { via: "wrong-folder"; picked: string };

/**
 * Step one of Save to Timberborn (D162): find the Maps folder. The first call asks the player to pick it and
 * remembers it; later calls reuse it, asking again only if permission has lapsed. This runs first, straight
 * from the click: the picker and a permission request need the click's fresh user activation, which lapses
 * within seconds, long before a big map has been built and checked. Only a folder named Maps is accepted.
 * A closed picker is `cancelled`: nothing is saved and nothing is said. Another browser, or a refused
 * permission, is a `download`.
 */
export async function chooseSaveFolder(deps: SaveToTimberbornDeps = liveDeps): Promise<FolderChoice> {
  if (!deps.supported()) return { via: "download" };
  try {
    let folder = await deps.recall();
    if (folder && !isMapsFolder(folder.name)) folder = null; // a folder remembered before only Maps was accepted
    if (!folder) {
      const picked = await deps.pick();
      if (!isMapsFolder(picked.name)) return { via: "wrong-folder", picked: picked.name };
      await deps.remember(picked);
      folder = picked;
    }
    return { via: "folder", folder };
  } catch (e) {
    return isCancel(e) ? { via: "cancelled" } : { via: "download", failed: true };
  }
}

/**
 * Step two, once the map is built: write it into the folder `chooseSaveFolder` found. Never overwrites an
 * existing map: a taken name is saved as "name-2" (then "-3", and so on), reported back as `savedAs`. Other
 * browsers get the normal download - the same bytes, just not placed in the folder - and so does a failure
 * (a missing folder, the write failing). A cancel or a wrong folder writes nothing.
 */
export async function saveIntoFolder(choice: FolderChoice, bytes: Uint8Array, name: string, deps: SaveToTimberbornDeps = liveDeps): Promise<SaveToTimberbornResult> {
  if (choice.via === "cancelled" || choice.via === "wrong-folder") return choice;
  if (choice.via === "folder") {
    try {
      const savedName = await deps.freeName(choice.folder, name);
      await deps.write(choice.folder, savedName, bytes);
      return { via: "fsa", folder: choice.folder.name, ...(savedName !== name ? { savedAs: savedName } : {}) };
    } catch {
      // the folder could not be written: fall back to the download
      // (a remembered folder that is gone would fail every later save: forget it so the next save asks again)
      const forgotten = deps.forget ? await deps.forget().then(() => true, () => false) : false;
      deps.download(bytes, name);
      return { via: "download", failed: true, ...(forgotten ? { forgotten: true as const } : {}) };
    }
  }
  deps.download(bytes, name);
  return choice;
}

/** Both steps in a row, for a caller that already has the bytes (the Real places gallery builds the map after asking). */
export async function saveToTimberborn(bytes: Uint8Array, name: string, deps: SaveToTimberbornDeps = liveDeps): Promise<SaveToTimberbornResult> {
  return saveIntoFolder(await chooseSaveFolder(deps), bytes, name, deps);
}

export type ChooseMapsFolderResult = { via: "chosen"; folder: string } | { via: "cancelled" } | { via: "wrong-folder"; picked: string } | { via: "failed" };

/** File -> "Choose Maps folder...": pick (or change) the remembered folder without saving. A cancel or a folder not
 *  named Maps leaves the previous choice as it was. */
export async function chooseMapsFolder(deps: Pick<SaveToTimberbornDeps, "pick" | "remember"> = liveDeps): Promise<ChooseMapsFolderResult> {
  try {
    const picked = await deps.pick();
    if (!isMapsFolder(picked.name)) return { via: "wrong-folder", picked: picked.name };
    await deps.remember(picked);
    return { via: "chosen", folder: picked.name };
  } catch (e) {
    return isCancel(e) ? { via: "cancelled" } : { via: "failed" };
  }
}
