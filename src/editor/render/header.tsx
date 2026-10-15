// The editor's header: undo and redo, the checks' dot, save and the history button.

import { canSaveToTimberborn } from "../../platform";
import { LookMenu } from "../../ui/LookMenu";
import { ChecksDot, Header } from "../Header";
import type { Ed } from "../ed";
import type { EditorProps } from "../Editor";
import { Together } from "../collab/Together";

export function header(ed: Ed, props: EditorProps) {
  const {
    api, info, renderer, localUndo, localRedo, undo, redo, check, instant, busy, progress, flowing, dotOpen, setDotOpen,
    actions, saving, saveMap, exportProject, run, flashNote, showHistory, setShowHistory, together, collab
  } = ed;
  // (in a shared session Undo and Redo take back only this player's own actions: the session says when there is one)
  const shared = !!collab && collab.phase !== "alone";

  return (
    <Header
      info={info}
      saveState={props.saveState}
      canUndo={shared ? collab.canUndo || !!localUndo.current.length : info.canUndo || !!localUndo.current.length}
      canRedo={shared ? collab.canRedo || !!localRedo.current.length : info.canRedo || !!localRedo.current.length}
      onUndo={() => void undo()}
      onRedo={() => void redo()}
      dot={<ChecksDot check={check} instant={instant} busy={busy > 0} progress={progress} flowing={flowing} flags={ed.flags} badwaterRemoved={info.badwaterRemoved} open={dotOpen} onToggle={setDotOpen} actions={actions} />}
      canFolder={canSaveToTimberborn()}
      saving={saving}
      onSave={(kind) => void saveMap(kind)}
      onOpenFile={props.onOpenFile}
      onSaveProject={() => void exportProject()}
      onClearEverything={() => void run(() => api.clearEverything(), (u) => u.ok && flashNote("Cleared: undo brings it all back"))}
      historyOpen={showHistory}
      // (one left panel at a time: History opening closes Map Generator, Real places or Your maps)
      onHistory={() => {
        if (!showHistory && (props.drawerOpen || props.mapsOpen || props.placesOpen)) props.onDrawer(false);
        setShowHistory(!showHistory);
      }}
      name={props.name}
      onRename={props.onRename}
      drawerOpen={props.drawerOpen}
      onDrawer={() => props.onDrawer(!props.drawerOpen)}
      mapsOpen={props.mapsOpen}
      onMaps={() => props.onMaps(!props.mapsOpen)}
      placesOpen={props.placesOpen}
      onPlaces={() => props.onPlaces(!props.placesOpen)}
      look={<LookMenu renderer={renderer.current} buttonClass="ghost" />}
      together={together && collab ? <Together controller={together} state={collab} open={ed.togetherOpen} onOpen={ed.setTogetherOpen} /> : null}
      onTogether={together ? () => ed.setTogetherOpen(true) : undefined}
      togetherDot={collab && collab.other && collab.phase !== "alone" && collab.phase !== "inviting" && collab.phase !== "joining" ? collab.other.role : null}
    />
  );
}
