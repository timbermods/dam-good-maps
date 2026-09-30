// Save to Timberborn (PLAN §20 D162, ROADMAP "Save to Timberborn"): the FSA write is exercised
// with fakes here (Node has no File System Access API); the real browser path - the picker, the
// remembered IndexedDB handle, and the fallback shown to a player - is tests/e2e/save-to-timberborn.spec.ts.
// fake-indexeddb/auto installs a real (in-memory) `indexedDB` global, for the one test below that
// needs the folder handle's own database to behave like the real thing.

import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { liveDeps, storage, saveToTimberborn, type Autosave, type SaveToTimberbornDeps } from "../../src/platform";

function fakeFolder(name: string, writes: { name: string; bytes: Uint8Array }[]): FileSystemDirectoryHandle {
  return {
    name,
    kind: "directory",
    async getFileHandle(fileName: string) {
      return {
        name: fileName,
        kind: "file",
        async createWritable() {
          return {
            async write(data: ArrayBuffer) {
              writes.push({ name: fileName, bytes: new Uint8Array(data) });
            },
            async close() {},
          };
        },
      };
    },
  } as unknown as FileSystemDirectoryHandle;
}

/** A folder that already holds the names in `existing`, for testing the free-name search
 *  (`liveDeps.freeName`) against a real `getFileHandle(name)` existence check. */
function fakeFolderWithFiles(name: string, existing: Set<string>, writes: { name: string; bytes: Uint8Array }[]): FileSystemDirectoryHandle {
  return {
    name,
    kind: "directory",
    async getFileHandle(fileName: string, opts?: { create?: boolean }) {
      if (!opts?.create && !existing.has(fileName)) throw new DOMException("not found", "NotFoundError");
      return {
        name: fileName,
        kind: "file",
        async createWritable() {
          return {
            async write(data: ArrayBuffer) {
              writes.push({ name: fileName, bytes: new Uint8Array(data) });
            },
            async close() {},
          };
        },
      };
    },
  } as unknown as FileSystemDirectoryHandle;
}

const neverCalled = async () => {
  throw new Error("should not be called");
};

describe("saveToTimberborn: the write is byte for byte", () => {
  it("writes exactly the bytes it was given, under the exported file name", async () => {
    const writes: { name: string; bytes: Uint8Array }[] = [];
    const folder = fakeFolder("Maps", writes);
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 250, 255]);
    const deps: SaveToTimberbornDeps = {
      supported: () => true,
      recall: async () => folder,
      remember: neverCalled,
      pick: neverCalled,
      freeName: async (_f, requested) => requested,
      write: async (f, name, b) => {
        const file = await f.getFileHandle(name, { create: true });
        const w = await file.createWritable();
        await w.write(b as unknown as ArrayBuffer);
        await w.close();
      },
      download: () => {
        throw new Error("should have saved to the folder, not fallen back");
      },
    };

    const r = await saveToTimberborn(bytes, "River Valley (1).timber", deps);

    expect(r).toEqual({ via: "fsa", folder: "Maps" });
    expect(writes).toHaveLength(1);
    expect(writes[0].name).toBe("River Valley (1).timber");
    expect(writes[0].bytes).toEqual(bytes);
    expect(writes[0].bytes).not.toBe(bytes); // travelled through a stream; still the same content
  });

  it("picks a folder only once, then reuses the remembered handle for later saves", async () => {
    const writes: { name: string; bytes: Uint8Array }[] = [];
    const folder = fakeFolder("Maps", writes);
    let picks = 0;
    let remembered: FileSystemDirectoryHandle | null = null;
    const deps: SaveToTimberbornDeps = {
      supported: () => true,
      recall: async () => remembered,
      remember: async (h) => {
        remembered = h;
      },
      pick: async () => {
        picks++;
        return folder;
      },
      freeName: async (_f, requested) => requested,
      write: async (f, name, b) => {
        writes.push({ name, bytes: b });
      },
      download: () => {
        throw new Error("should not be called");
      },
    };

    const first = await saveToTimberborn(new Uint8Array([1]), "a.timber", deps);
    const second = await saveToTimberborn(new Uint8Array([2]), "b.timber", deps);

    expect(picks).toBe(1); // the second save went straight to the remembered folder
    expect(first).toEqual({ via: "fsa", folder: "Maps" });
    expect(second).toEqual({ via: "fsa", folder: "Maps" });
    expect(writes.map((w) => w.name)).toEqual(["a.timber", "b.timber"]);
  });
});

describe("saveToTimberborn: the fallback", () => {
  it("downloads instead in a browser with no folder access", async () => {
    const downloads: { bytes: Uint8Array; name: string }[] = [];
    const deps: SaveToTimberbornDeps = {
      supported: () => false,
      recall: neverCalled,
      remember: neverCalled,
      pick: neverCalled,
      freeName: neverCalled,
      write: neverCalled,
      download: (bytes, name) => downloads.push({ bytes, name }),
    };
    const bytes = new Uint8Array([9, 8, 7]);

    const r = await saveToTimberborn(bytes, "River Valley (1).timber", deps);

    expect(r).toEqual({ via: "download" });
    expect(downloads).toEqual([{ bytes, name: "River Valley (1).timber" }]);
  });

  it("downloads instead when the player cancels the folder picker", async () => {
    const downloads: { bytes: Uint8Array; name: string }[] = [];
    const deps: SaveToTimberbornDeps = {
      supported: () => true,
      recall: async () => null,
      remember: neverCalled,
      pick: async () => {
        throw new DOMException("The user aborted a request.", "AbortError");
      },
      freeName: neverCalled,
      write: neverCalled,
      download: (bytes, name) => downloads.push({ bytes, name }),
    };
    const bytes = new Uint8Array([9, 8, 7]);

    const r = await saveToTimberborn(bytes, "River Valley (1).timber", deps);

    expect(r).toEqual({ via: "download" });
    expect(downloads).toEqual([{ bytes, name: "River Valley (1).timber" }]);
  });

  it("downloads instead when permission has lapsed and the player declines it again", async () => {
    const downloads: { bytes: Uint8Array; name: string }[] = [];
    const deps: SaveToTimberbornDeps = {
      supported: () => true,
      // a lapsed, refused permission: recallFolder's own retry (queryPermission, then
      // requestPermission) already failed, so it reports no usable folder
      recall: async () => null,
      remember: neverCalled,
      pick: async () => {
        throw new DOMException("permission refused", "NotAllowedError");
      },
      freeName: neverCalled,
      write: neverCalled,
      download: (bytes, name) => downloads.push({ bytes, name }),
    };

    const r = await saveToTimberborn(new Uint8Array([1]), "a.timber", deps);

    expect(r).toEqual({ via: "download" });
    expect(downloads).toHaveLength(1);
  });

  it("downloads instead when the write itself fails, without touching the remembered folder again", async () => {
    const downloads: { bytes: Uint8Array; name: string }[] = [];
    const folder = { name: "Maps" } as unknown as FileSystemDirectoryHandle;
    const deps: SaveToTimberbornDeps = {
      supported: () => true,
      recall: async () => folder,
      remember: neverCalled,
      pick: neverCalled,
      freeName: async (_f, requested) => requested,
      write: async () => {
        throw new Error("disk full");
      },
      download: (bytes, name) => downloads.push({ bytes, name }),
    };
    const bytes = new Uint8Array([1, 2, 3]);

    const r = await saveToTimberborn(bytes, "a.timber", deps);

    expect(r).toEqual({ via: "download" });
    expect(downloads).toEqual([{ bytes, name: "a.timber" }]);
  });
});

describe("saveToTimberborn: never overwrites an existing map", () => {
  it("keeps the plain name when it's free", async () => {
    const writes: { name: string; bytes: Uint8Array }[] = [];
    const folder = fakeFolderWithFiles("Maps", new Set(), writes);
    const bytes = new Uint8Array([1, 2, 3]);
    const deps: SaveToTimberbornDeps = {
      supported: () => true,
      recall: async () => folder,
      remember: neverCalled,
      pick: neverCalled,
      freeName: liveDeps.freeName,
      write: async (f, name, b) => {
        writes.push({ name, bytes: b });
      },
      download: () => {
        throw new Error("should have saved to the folder, not fallen back");
      },
    };

    const r = await saveToTimberborn(bytes, "dgm-river-valley-7.timber", deps);

    expect(r).toEqual({ via: "fsa", folder: "Maps" }); // no savedAs: the name didn't change
    expect(writes).toEqual([{ name: "dgm-river-valley-7.timber", bytes }]);
  });

  it("saves as 'name-2' when the plain name is already taken, with the same bytes", async () => {
    const writes: { name: string; bytes: Uint8Array }[] = [];
    const folder = fakeFolderWithFiles("Maps", new Set(["dgm-river-valley-7.timber"]), writes);
    const bytes = new Uint8Array([1, 2, 3, 250, 255]);
    const deps: SaveToTimberbornDeps = {
      supported: () => true,
      recall: async () => folder,
      remember: neverCalled,
      pick: neverCalled,
      freeName: liveDeps.freeName,
      write: async (f, name, b) => {
        writes.push({ name, bytes: b });
      },
      download: () => {
        throw new Error("should have saved to the folder, not fallen back");
      },
    };

    const r = await saveToTimberborn(bytes, "dgm-river-valley-7.timber", deps);

    expect(r).toEqual({ via: "fsa", folder: "Maps", savedAs: "dgm-river-valley-7-2.timber" });
    expect(writes).toEqual([{ name: "dgm-river-valley-7-2.timber", bytes }]);
  });

  it("keeps counting up when '-2' is taken too", async () => {
    const writes: { name: string; bytes: Uint8Array }[] = [];
    const folder = fakeFolderWithFiles("Maps", new Set(["dgm-river-valley-7.timber", "dgm-river-valley-7-2.timber"]), writes);
    const bytes = new Uint8Array([1, 2, 3]);
    const deps: SaveToTimberbornDeps = {
      supported: () => true,
      recall: async () => folder,
      remember: neverCalled,
      pick: neverCalled,
      freeName: liveDeps.freeName,
      write: async (f, name, b) => {
        writes.push({ name, bytes: b });
      },
      download: () => {
        throw new Error("should have saved to the folder, not fallen back");
      },
    };

    const r = await saveToTimberborn(bytes, "dgm-river-valley-7.timber", deps);

    expect(r).toEqual({ via: "fsa", folder: "Maps", savedAs: "dgm-river-valley-7-3.timber" });
    expect(writes).toEqual([{ name: "dgm-river-valley-7-3.timber", bytes }]);
  });
});

describe("the folder handle has its own database, apart from the autosave", () => {
  it("still opens the autosave database at version 1 after the folder has been saved", async () => {
    // the live path, not a fake: it opens and writes to the folder's own IndexedDB database
    await liveDeps.remember({ name: "Maps" } as unknown as FileSystemDirectoryHandle);

    // the autosave database - a different name, still at version 1 - opens and works as before;
    // if the folder handle had been added as a second store on that same database (bumping its
    // version), an older tab or cached build still asking for version 1 would fail here instead
    const autosave: Autosave = { bytes: new Uint8Array([1, 2, 3]), name: "a.timber", savedAt: new Date().toISOString(), kind: "generated", screen: "settings" };
    expect(await storage.save(autosave)).toBe(true);
    const loaded = await storage.load();
    expect(loaded?.name).toBe("a.timber");
    expect(loaded?.bytes).toEqual(autosave.bytes);
  });
});
