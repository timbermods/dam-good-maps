// The top bar: the brushes, the forces, Select and the row beneath them.

import { showHelpPanel } from "../help/helpPanels";
import { FirstRun, saveFirstRun, type FirstStep } from "../FirstRun";
import type { EditorProps } from "../Editor";
import { TopBar } from "../TopBar";
import { tip } from "../../ui/Tooltip";
import { sizeMax } from "../brushes";
import { ObjectWindow } from "../ObjectWindow";
import type { Ed } from "../ed";

export function topBar(ed: Ed, props: EditorProps) {
  const {
    brushTool, tool, forcer, forceRow, unleashRow, firstRun, setFirstRun, brush, info, pickTop,
    setBrush, ready, selectRow, selectChip, selecting, selectingRef, brushToolRef, toolRef, closeSelect, openSelect, shelf, shelfRef,
    message, setMessage, compareNote, block, blockSettings, blockFlip, setBlockSettings, phone, phoneSheet, setPhoneSheet,
    phoneSelect, setPhoneSelect
  } = ed;
  // (a phone: the object in hand's window takes the settings' sheet above the tool row)
  const objectPanel = phone && !unleashRow() ? (ed.shelfRow() ?? ed.pickedRow()) : null;
  const notes =
    message || props.notice || props.compare ? (
      <>
        {props.notice ?? null}
        {compareNote()}
        {message ? (
          <div class={`editor-message ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
            {message.text}
            {message.action ? (
              <button type="button" class="linkish note-action" {...(message.action.step !== undefined ? tip(message.action.tip, "Ctrl+Z") : tip(message.action.tip))} onClick={() => {
                const run = message.action!.run;
                setMessage(null);
                run();
              }}>
                {message.action.label}
              </button>
            ) : null}
            <button type="button" class="icon-close" onClick={() => setMessage(null)} aria-label="Dismiss" title="Close">
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
          touch={!!phone}
          onHelp={() => showHelpPanel("help")}
          onClose={() => {
            const all = new Set<FirstStep>(["paint", "place", "water"]);
            saveFirstRun(all);
            setFirstRun(all);
          }}
        />
      }
      settings={brush}
      lakeFed={ed.lakeFed}
      block={block}
      blockSettings={blockSettings}
      blockFlip={blockFlip}
      onBlockSettings={setBlockSettings}
      sizeMax={sizeMax(info.W, info.H)}
      onPick={pickTop}
      onSettings={setBrush}
      loading={!ready}
      // (on a phone Select rests in hand with its sheet closed: a tap on it opens its settings, a tap again puts them and
      // any selection down; a selection made keeps them open)
      selectRow={phone && !phoneSelect && !ed.selection.current.count ? null : selectRow()}
      selectChip={selectChip()}
      selecting={!!selecting && !brushTool && !tool && !shelf && !block}
      onSelect={() => {
        const resting = selectingRef.current && !brushToolRef.current && !toolRef.current && !shelfRef.current && !ed.blockRef.current;
        if (phone) {
          setPhoneSheet(null);
          // (in hand with its settings open: put down, the selection with it, as X does)
          if (resting && (phoneSelect || ed.selection.current.count)) {
            closeSelect();
            return setPhoneSelect(false);
          }
          if (!resting) openSelect();
          return setPhoneSelect(true);
        }
        if (resting) closeSelect();
        else openSelect();
      }}
      phone={
        phone
          ? {
              tall: ed.sheetTall,
              onTall: ed.setSheetTall,
              objectsOpen: phoneSheet === "objects",
              holding: !!shelf,
              onObjects: () => setPhoneSheet(phoneSheet === "objects" ? null : "objects"),
              object: objectPanel ? <ObjectWindow panel={objectPanel} /> : null,
            }
          : null
      }
    />
  );
}
