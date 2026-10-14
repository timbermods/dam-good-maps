// Export and save: the project file and the map for Timberborn; an opened file's import flags for the quiet dot.

import { proxy } from "comlink";
import { chooseMapsFolder, chooseSaveFolder, saveFile, saveIntoFolder, TIMBERBORN_MAPS_PATH, wrongFolderNote } from "../../platform";
import type { CheckProgress } from "../../worker/session";
import { plain } from "../panels";
import { NO_START, NO_START_REFUSAL } from "../../core/doc/checkItems";
import type { ImportFlag } from "../../core/format/normalize";
import type { Ed } from "../ed";

const MOVE_IT = `Move the file to ${TIMBERBORN_MAPS_PATH}, then start a new game and pick the map.`;

export interface SaveSlice {
  exportProject: () => Promise<void>;
  saveMap: (kind: "timberborn" | "download") => Promise<void>;
  /** File -> Choose Maps folder…: pick or change the folder Save to Timberborn writes to. */
  chooseFolder: () => Promise<void>;
  /** An opened file's import flags, each with its fix: the quiet dot lists them (Kyler, 2026-10-03). */
  flags: ImportFlag[];
}

export function useSave(ed: Ed): SaveSlice {
  const { api, info, instant, check, setMessage, setDotOpen, saving, setSaving, enqueue } = ed;

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
   *  browser can, else a download. The folder is found first, straight from the click: the picker needs the
   *  click's fresh user activation, which lapses within seconds, long before a big map is built. */
  async function saveMap(kind: "timberborn" | "download") {
    if (saving) return;
    setSaving({ kind, progress: null });
    setMessage(null);
    try {
      // (a map without a start is refused before the folder is asked for: nobody should pick a folder to be told no)
      if ([...instant, ...(check?.blocking ?? [])].some((c) => c.id === "start.count" && c.message === NO_START)) {
        setDotOpen(true);
        setMessage({ kind: "error", text: `Not saved: ${NO_START_REFUSAL}` });
        return;
      }
      const choice = kind === "timberborn" ? await chooseSaveFolder() : null;
      if (choice?.via === "cancelled") return; // the picker was closed: no file, no note
      if (choice?.via === "wrong-folder") {
        setMessage({ kind: "error", text: wrongFolderNote(choice.picked) });
        return;
      }
      // (a force at work is kept first: its land lives outside the map until then, investigation/page-qa F1)
      await ed.forcer.current?.stop();
      // (tests only: a slow build, to show the folder was asked for first)
      if (window.dgmSaveDelayMs) await new Promise((done) => setTimeout(done, window.dgmSaveDelayMs));
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
        setMessage({ kind: "info", text: `Saved ${fileName}. ${MOVE_IT}` });
        return;
      }
      const v = await saveIntoFolder(choice!, r.bytes, fileName);
      if (v.via === "fsa") setMessage({ kind: "info", text: `Saved ${v.savedAs ?? fileName} to ${v.folder}. It'll show up in Timberborn's custom maps.` });
      else if (v.via === "download" && v.failed) setMessage({ kind: "info", text: `Couldn't save to the Maps folder, so ${fileName} was downloaded. Move the file to ${TIMBERBORN_MAPS_PATH}.${v.forgotten ? " Save asks for the folder again next time." : ""}` });
      else setMessage({ kind: "info", text: `Saved ${fileName}. ${MOVE_IT}` });
    } catch (e) {
      setMessage({ kind: "error", text: String(e instanceof Error ? e.message : e) });
    } finally {
      setSaving(null);
    }
  }

  async function chooseFolder() {
    setMessage(null);
    const r = await chooseMapsFolder();
    if (r.via === "chosen") setMessage({ kind: "info", text: "Maps folder set. Save to Timberborn saves there." });
    else if (r.via === "wrong-folder") setMessage({ kind: "error", text: wrongFolderNote(r.picked) });
    else if (r.via === "failed") setMessage({ kind: "error", text: "Couldn't use that folder. Try choosing it again." });
  }

  const flags = info.importReport?.flags ?? [];

  return { exportProject, saveMap, chooseFolder, flags };
}
