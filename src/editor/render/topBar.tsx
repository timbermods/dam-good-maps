// The top bar: the brushes, the forces, Select and the row beneath them.

import { FirstRun, saveFirstRun, type FirstStep } from "../FirstRun";
import type { EditorProps } from "../Editor";
import { TopBar } from "../TopBar";
import { sizeMax } from "../brushes";
import type { Ed } from "../ed";

export function topBar(ed: Ed, props: EditorProps) {
  const {
    brushTool, tool, forcer, forceRow, unleashRow, firstRun, setFirstRun, brush, info, pickTop,
    setBrush, ready, selectRow, selectChip, selecting, selectingRef, brushToolRef, toolRef, closeSelect, openSelect, shelf, shelfRef,
    message, setMessage
  } = ed;
  const notes =
    message || props.notice ? (
      <>
        {props.notice ?? null}
        {message ? (
          <div class={`editor-message ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
            {message.text}
            <button type="button" class="linkish" onClick={() => setMessage(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ) : null}
      </>
    ) : null;

  return (
    <TopBar
      active={brushTool}
      force={tool}
      forceAtWork={!!forcer.current?.running}
      forceRow={forceRow()}
      row={unleashRow()}
      notes={notes}
      hints={
        <FirstRun
          done={firstRun}
          onClose={() => {
            const all = new Set<FirstStep>(["paint", "place", "water"]);
            saveFirstRun(all);
            setFirstRun(all);
          }}
        />
      }
      settings={brush}
      sizeMax={sizeMax(info.W, info.H)}
      onPick={pickTop}
      onSettings={setBrush}
      loading={!ready}
      selectRow={selectRow()}
      selectChip={selectChip()}
      selecting={!!selecting && !brushTool && !tool && !shelf}
      onSelect={() => (selectingRef.current && !brushToolRef.current && !toolRef.current && !shelfRef.current ? closeSelect() : openSelect())}
    />
  );
}
