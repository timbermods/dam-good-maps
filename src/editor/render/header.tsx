// The editor's header: undo and redo, the checks' dot, save and the history button.

import { canSaveToTimberborn } from "../../platform";
import { LookMenu } from "../../ui/LookMenu";
import { ChecksDot, Header } from "../Header";
import type { Ed } from "../ed";
import type { EditorProps } from "../Editor";
import { Together } from "../collab/Together";
import { plain } from "../panels";
import { canDrawPicture, canRecordTimelapse } from "../timelapse/can";

export function header(ed: Ed, props: EditorProps) {
  const {
    api, info, renderer, edits, undo, redo, check, instant, busy, progress, flowing, dotOpen, setDotOpen,
    actions, saving, saveMap, exportProject, exportPicture, run, flashNote, showHistory, setShowHistory, together, collab
  } = ed;
  // (in a shared session Undo and Redo take back only this player's own actions: the session says when there is one)
  const shared = !!collab && collab.phase !== "alone";
  // (alone: the history as it stands once the edits on their way are answered, the edit queue's)
  const steps = edits.current.history();

  /** The description written beside the name: the setDescription operation, one undo step; null when stored, else the core's one-line reason. */
  const describe = (text: string) =>
    new Promise<string | null>((done) => {
      let answer: string | null = "The map is busy: try again in a moment";
      void run(
        (w) => w.apply({ op: "setDescription", params: { text } } as never, "user", text ? "Write the description" : "Clear the description"),
        (u) => {
          answer = u.ok ? null : plain(u.errors[0] ?? "That description was not kept");
          // (said under the name, not twice)
          if (!u.ok) ed.setMessage(null);
        },
      ).then(() => done(answer));
    });

  return (
    <Header
      info={info}
      saveState={props.saveState}
      canUndo={shared ? collab.canUndo || edits.current.pending() > 0 : steps.cursor >= 0}
      canRedo={shared ? collab.canRedo : steps.cursor + 1 < steps.rows.length}
      onUndo={() => void undo()}
      onRedo={() => void redo()}
      dot={<ChecksDot check={check} instant={instant} busy={busy > 0} progress={progress} flowing={flowing} flags={ed.flags} badwaterRemoved={info.badwaterRemoved} easyShort={info.easyShort} open={dotOpen} onToggle={setDotOpen} actions={actions} />}
      canFolder={canSaveToTimberborn()}
      saving={saving}
      onSave={(kind) => void saveMap(kind)}
      onChooseFolder={() => void ed.chooseFolder()}
      onOpenFile={props.onOpenFile}
      onNewBlank={props.onNewBlank}
      onSaveProject={() => void exportProject()}
      onSavePicture={canDrawPicture() ? () => void exportPicture() : undefined}
      onClearEverything={() => void run((w) => w.clearEverything(), (u) => u.ok && flashNote("Cleared: undo brings it all back"))}
      historyOpen={showHistory}
      // (one left panel at a time: History opening closes Map Generator, Real places or Your maps)
      onHistory={() => {
        if (!showHistory && (props.drawerOpen || props.mapsOpen || props.placesOpen)) props.onDrawer(false);
        setShowHistory(!showHistory);
      }}
      name={props.name}
      onRename={props.onRename}
      renameLocked={collab?.role === "guest" && (collab.phase === "live" || collab.phase === "paused") ? "The host names and describes the shared map" : undefined}
      onDescribe={describe}
      drawerOpen={props.drawerOpen}
      onDrawer={() => props.onDrawer(!props.drawerOpen)}
      mapsOpen={props.mapsOpen}
      onMaps={() => props.onMaps(!props.mapsOpen)}
      placesOpen={props.placesOpen}
      onPlaces={() => props.onPlaces(!props.placesOpen)}
      phone={ed.phone}
      look={<LookMenu renderer={renderer.current} buttonClass="ghost" />}
      together={together && collab ? <Together controller={together} state={collab} /> : null}
      timelapse={
        canRecordTimelapse()
          ? {
              steps: info.history.filter((h) => h.applied).length,
              // (as Download project's: a force at work kept first, a force's rolls ended, in the edits' queue)
              project: async () => {
                await ed.forcer.current?.stop();
                ed.endRolls?.();
                const p = await ed.enqueue(() => api.project(1));
                return { bytes: p.bytes, fileName: p.fileName };
              },
            }
          : undefined
      }
      togetherEntry={together && collab ? { role: collab.other?.role ?? "guest", name: collab.other?.name ?? "the other player", paused: collab.phase === "paused", other: !!collab.other && collab.phase !== "alone" && collab.phase !== "inviting" && collab.phase !== "joining" } : null}
    />
  );
}
