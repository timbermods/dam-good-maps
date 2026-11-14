// The top bar: the brushes, the forces, Select and the row beneath them.

import { showHelpPanel } from "../help/helpPanels";
import { FirstRun, saveFirstRun, type FirstStep } from "../FirstRun";
import type { EditorProps } from "../Editor";
import { TopBar } from "../TopBar";
import { tip } from "../../ui/Tooltip";
import { sizeMax } from "../brushes";
import { ObjectWindow } from "../ObjectWindow";
import type { Ed } from "../ed";

/** What is in hand from the objects, on one row: its picture, its name and Put it down (#1074; a phone's sheet, a
 *  tablet's window over the dock). */
export function heldLine(ed: Ed) {
  const item = ed.shelf;
  if (!item) return null;
  const picture = ed.icons[item.picture ? item.id : item.template] ?? null;
  return (
    <div class="held-line">
      {picture ? <img src={picture} alt="" width={36} height={36} draggable={false} /> : null}
      <span class="held-name">{item.name}</span>
      <button type="button" class="held-close" aria-label="Put it down" {...tip("Put it down", "X", "Esc")} onClick={() => ed.pickShelf(null)}>
        ×
      </button>
    </div>
  );
}

export function topBar(ed: Ed, props: EditorProps) {
  const {
    brushTool, tool, forcer, forceRow, unleashRow, firstRun, setFirstRun, brush, info, pickTop,
    setBrush, ready, selectRow, selectChip, selecting, selectingRef, brushToolRef, toolRef, closeSelect, openSelect, shelf, shelfRef,
    message, setMessage, compareNote, block, blockSettings, blockFlip, setBlockSettings, phone, phoneSheet, setPhoneSheet,
    phoneSelect, setPhoneSelect, tablet
  } = ed;
  // (a phone, or a tablet as a big phone: Select's settings closed at rest, the map the screen's)
  const sheets = !!phone || tablet;
  // (a phone: the object in hand's window takes the settings' sheet above the tool row)
  const objectPanel = phone && !unleashRow() ? (ed.shelfRow() ?? ed.pickedRow()) : null;
  // the object in hand from the objects' sheet: one row saying what it is (its picture, its name, Put it down), its
  // settings under it when the sheet is pulled up; a picked source or object on the map: its window as it is
  const heldItem = phone && shelf ? shelf : null;
  const objectSheet = heldItem ? (
    <div class="phone-held" role="group" aria-label={`${heldItem.name} in hand`}>
      {heldLine(ed)}
      {objectPanel && ed.sheetTall ? <ObjectWindow panel={{ ...objectPanel, onClose: undefined }} /> : null}
    </div>
  ) : objectPanel ? (
    <ObjectWindow panel={objectPanel} />
  ) : null;
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
      // (on a phone or a tablet Select rests in hand with its settings closed: a tap on it opens them, a tap again puts
      // them and any selection down; a selection made keeps them open)
      selectRow={sheets && !phoneSelect && !ed.selection.current.count ? null : selectRow()}
      selectChip={selectChip()}
      selecting={!!selecting && !brushTool && !tool && !shelf && !block}
      onSelect={() => {
        const resting = selectingRef.current && !brushToolRef.current && !toolRef.current && !shelfRef.current && !ed.blockRef.current;
        if (sheets) {
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
      // Put it down (×) on what is in hand's sheet (#1074): X's call; on a phone Select's sheet closes with it, as its
      // second tap does
      putDown={{
        run: () => {
          ed.putDown();
          if (sheets) setPhoneSelect(false);
        },
        select: !!ed.selection.current.count || (sheets && phoneSelect),
      }}
      phone={
        phone
          ? {
              tall: ed.sheetTall,
              onTall: ed.setSheetTall,
              objectsOpen: phoneSheet === "objects",
              holding: !!shelf,
              onObjects: () => setPhoneSheet(phoneSheet === "objects" ? null : "objects"),
              object: objectSheet,
              objectMore: !!heldItem && !!objectPanel?.groups.length,
            }
          : null
      }
    />
  );
}
