// The editor's header: undo and redo, the checks' dot, save and the history button.

import { canSaveToTimberborn } from "../../platform";
import { LookMenu } from "../../ui/LookMenu";
import { ChecksDot, Header } from "../Header";
import type { Ed } from "../ed";
import type { EditorProps } from "../Editor";

export function header(ed: Ed, props: EditorProps) {
  const {
    api, info, renderer, localUndo, localRedo, undo, redo, check, instant, busy, progress, flowing, dotOpen, setDotOpen,
    actions, saving, saveMap, exportProject, run, flashNote, showHistory, setShowHistory
  } = ed;

  return (
    <Header
      info={info}
      saveState={props.saveState}
      canUndo={info.canUndo || !!localUndo.current.length}
      canRedo={info.canRedo || !!localRedo.current.length}
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
      onHistory={() => setShowHistory(!showHistory)}
      name={props.name}
      onRename={props.onRename}
      onAnother={props.onAnother ? () => props.onAnother!(info) : undefined}
      drawerOpen={props.drawerOpen}
      onDrawer={() => props.onDrawer(!props.drawerOpen)}
      look={<LookMenu renderer={renderer.current} buttonClass="ghost" />}
    />
  );
}
