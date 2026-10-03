// Export and save: the project file, the map for Timberborn, and the quiet notices.

import { proxy } from "comlink";
import { saveFile, saveToTimberborn } from "../../platform";
import type { CheckProgress } from "../../worker/session";
import { plain } from "../panels";
import { namedFile } from "../../core/gen/pack";
import type { ImportFlag } from "../../core/format/normalize";
import type { Ed } from "../ed";

/** What the editor says once the map's last badwater spring is gone (D213). */
const NO_BADWATER_LINE = "No badwater: you removed the map's last badwater spring, so this is a peaceful map now. Badtides still come.";

export interface SaveSlice {
  exportProject: () => Promise<void>;
  saveMap: (kind: "timberborn" | "download") => Promise<void>;
  notices: string[];
  flags: ImportFlag[];
  importChanges: number;
}

/** The file's name: the worker's own (dgm-<theme>-<seed>, D345 B10) until the map is renamed, then the name
 *  Kyler gave it (`namedFile`). */
function named(fileName: string, info: { name: string }, name: string, ext: string): string {
  return name && name !== info.name ? namedFile(name).replace(/\.timber$/, ext) : fileName;
}

export function useSave(ed: Ed, name: string): SaveSlice {
  const { api, info, setMessage, setDotOpen, saving, setSaving, enqueue } = ed;

  // ------------------------------------------------------------------------------ export

  async function exportProject() {
    const p = await api.project();
    saveFile(p.bytes, named(p.fileName, info, name, ".damgoodmaps.json"), "application/gzip");
  }

  /** Save the map for Timberborn (D184): the canonical settle and every check, with progress on the
   *  button; problems that would stop the map loading open the quiet dot's list instead; warnings
   *  go into the map's description (never a confirmation). Into the game's Maps folder where the
   *  browser can, else a download. */
  async function saveMap(kind: "timberborn" | "download") {
    if (saving) return;
    setSaving({ kind, progress: null });
    setMessage(null);
    try {
      const onProgress = proxy((q: CheckProgress) => setSaving((s) => (s ? { ...s, progress: q } : s)));
      const r = await enqueue(() => api.exportTimber(true, onProgress));
      if (!r.ok) {
        setDotOpen(true);
        setMessage({ kind: "error", text: `Not saved: ${plain(r.errors[0] ?? "the map has problems to fix first")}` });
        return;
      }
      const fileName = named(r.fileName, info, name, ".timber");
      if (kind === "download") {
        saveFile(r.bytes, fileName);
        setMessage({ kind: "info", text: `Saved ${fileName}. Move the file to Documents\\Timberborn\\Maps, then start a new game and pick the map.` });
        return;
      }
      const v = await saveToTimberborn(r.bytes, fileName);
      setMessage({ kind: "info", text: v.via === "fsa" ? `Saved ${v.savedAs ?? fileName} to ${v.folder}. It'll show up in Timberborn's custom maps.` : `Saved ${fileName}. Move the file to Documents\\Timberborn\\Maps, then start a new game and pick the map.` });
    } catch (e) {
      setMessage({ kind: "error", text: String(e instanceof Error ? e.message : e) });
    } finally {
      setSaving(null);
    }
  }

  // D213: removing the map's last badwater spring makes it a No badwater map, said in a quiet line
  const notices = [...(info.badwaterRemoved ? [NO_BADWATER_LINE] : []), ...info.notices, ...(info.importReport?.changes.filter((c) => c.level === "warning").map((c) => c.message) ?? [])];
  const flags = info.importReport?.flags ?? [];
  const importChanges = info.importReport?.changes.length ?? 0;

  return { exportProject, saveMap, notices, flags, importChanges };
}
