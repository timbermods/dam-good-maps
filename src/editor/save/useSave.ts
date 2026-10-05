// Export and save: the project file and the map for Timberborn; an opened file's import flags for the quiet dot.

import { proxy } from "comlink";
import { saveFile, saveToTimberborn } from "../../platform";
import type { CheckProgress } from "../../worker/session";
import { plain } from "../panels";
import type { ImportFlag } from "../../core/format/normalize";
import type { Ed } from "../ed";

export interface SaveSlice {
  exportProject: () => Promise<void>;
  saveMap: (kind: "timberborn" | "download") => Promise<void>;
  /** An opened file's import flags, each with its fix: the quiet dot lists them (Kyler, 2026-10-03). */
  flags: ImportFlag[];
}

export function useSave(ed: Ed): SaveSlice {
  const { api, info, setMessage, setDotOpen, saving, setSaving, enqueue } = ed;

  // ------------------------------------------------------------------------------ export

  async function exportProject() {
    // (in the edits' queue, as the .timber download is: a stroke already shown is in it; a force at work is kept
    // first, its land in the file as shown: investigation/page-qa F1)
    await ed.forcer.current?.stop();
    const p = await enqueue(() => api.project());
    saveFile(p.bytes, p.fileName, "application/gzip");
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
      // (a force at work is kept first: its land lives outside the map until then, investigation/page-qa F1)
      await ed.forcer.current?.stop();
      const onProgress = proxy((q: CheckProgress) => setSaving((s) => (s ? { ...s, progress: q } : s)));
      const r = await enqueue(() => api.exportTimber(true, onProgress));
      if (!r.ok) {
        setDotOpen(true);
        setMessage({ kind: "error", text: `Not saved: ${plain(r.errors[0] ?? "the map has problems to fix first")}` });
        return;
      }
      // (the core names the file: its seed-based name until the map is renamed, then `namedFile`, D443)
      const fileName = r.fileName;
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

  const flags = info.importReport?.flags ?? [];

  return { exportProject, saveMap, flags };
}
