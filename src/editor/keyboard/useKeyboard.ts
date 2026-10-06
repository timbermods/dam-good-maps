// The keyboard.

import { useEffect } from "preact/hooks";
import { FORCES, forceShown } from "../TopBar";
import { keyHabit } from "../forceSize";
import { BRUSHES } from "../brushes";
import type { Ed } from "../ed";
import type { EditorProps } from "../Editor";

export function useKeyboard(ed: Ed, props: EditorProps): void {
  const {
    api, setInfo, renderer, setTool, flipRef, forceEscRef, setTurn, setClearWater, selectingRef, selection,
    setPicked, setPickedObject, pickedObjectRef, pickedRef, infoRef, shelfRef, turnRef, run, brushRef, brushToolRef,
    setBrush, painter, undo, redo, pickTop, putDown, pickBrush, pickShelf, targetSpot, sourceInfo, sourceGrab,
    pickedSources, removeSources, flashNote, shelfTile, shelfHover, deleteCalls, quakeUiRef, setQuakeUi, forcer,
    unleash, forceSizing, fHeld, stepHabit, startForceSize, endForceSize, openSelect, closeSelect, selectAll,
    selectCalls, toolRef, startGrab
  } = ed;

  // ------------------------------------------------------------------------------ keyboard

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (document.querySelector<HTMLElement>(".editor")?.inert) return;
      const target = ev.target as HTMLElement | null;
      // typing in a field or choosing from a list keeps its keys; a toggle just clicked does not
      const toggle = target?.tagName === "INPUT" && ["checkbox", "radio", "button"].includes((target as HTMLInputElement).type);
      if (target && !toggle && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
      const mod = ev.ctrlKey || ev.metaKey;
      // (F held: the wheel sets the strength, D368 (11), even while a painted Lift is drawn)
      if (!mod && !ev.altKey && ev.key.toLowerCase() === "f") fHeld.current = true;
      // a force at work (D199, D202, D203, D206): Ctrl+Z (or Z) takes all of it back at any moment;
      // Esc cancels a painted Lift still being drawn, and skips a playing force to its end, kept as one
      // step (D344, A4; amends D341 (2)); Space holds a carve, V flips a painted Lift's side as it goes;
      // the other tools wait. In Slow forces (D321, item 29) a key of a new gesture jumps it to its end too
      const c = forcer.current;
      if (c?.running) {
        const watching = c.status!.speed === "watch" && !c.status!.painting;
        if (!ev.altKey && !ev.shiftKey && ev.key.toLowerCase() === "z") {
          ev.preventDefault();
          c.cancel();
          return;
        }
        if (ev.key === "Escape") {
          ev.preventDefault();
          // (a painted Lift cancelled: its stroke goes too)
          if (c.escape() === "cancelled") forceEscRef.current?.();
          return;
        }
        if (ev.key === " ") {
          ev.preventDefault();
          c.pause(!c.status!.paused);
          return;
        }
        if (!mod && ev.key.toLowerCase() === "v" && toolRef.current === "quake") {
          flipRef.current?.();
          return;
        }
        // (a new gesture's key in Slow forces: the force jumps to its final land first)
        if (watching && !mod && !ev.altKey && /^Digit[1-7]$/.test(ev.code)) {
          void c.jump();
          return;
        }
        if (mod || /^Digit[0-9]$/.test(ev.code) || ["x", "z", "c", "v", "r", "f", "delete", "backspace", "arrowup", "arrowdown"].includes(ev.key.toLowerCase())) return;
      }
      // a fault or a fissure still being drawn: Esc lets it go
      if (ev.key === "Escape" && forceEscRef.current?.()) return;
      // camera bookmarks (D205): Ctrl+Shift+1–9 keeps the view in that slot, Alt+1–9 glides back to it (Kyler,
      // 2026-10-06: Shift and a number pick a force; the number keys alone pick Select and the brushes)
      const digit = /^Digit([1-9])$/.exec(ev.code);
      if (digit && ((mod && ev.shiftKey && !ev.altKey) || (ev.altKey && !mod && !ev.shiftKey))) {
        ev.preventDefault();
        const slot = Number(digit[1]);
        const r = renderer.current;
        if (!r) return;
        if (mod) {
          const v = r.getView();
          const views = [...infoRef.current.views.filter((b) => b.slot !== slot), { slot, ...v }].sort((a, b) => a.slot - b.slot);
          void api.setViews(views).then((i) => {
            infoRef.current = { ...infoRef.current, views: i.views };
            setInfo((cur) => ({ ...cur, views: i.views }));
            props.onChange({ ...infoRef.current, views: i.views });
          });
          flashNote(`View ${slot} saved: Alt+${slot} comes back to it`);
        } else {
          const b = infoRef.current.views.find((v) => v.slot === slot);
          if (b) r.glideTo(b);
          else flashNote(`No view in ${slot} yet: Ctrl+Shift+${slot} keeps this one`);
        }
        return;
      }
      // the tools by their place in the bar (Kyler, 2026-10-06), on the key's code so any keyboard layout works: 1 Select
      // (again: its selection goes), 2–6 the brushes (again: it stays out), Shift+1–7 the forces in the bar's order
      // (again: put it away); { and } size a brush, Esc cancels a stroke, then puts it away
      const place = !mod && !ev.altKey ? /^Digit([1-7])$/.exec(ev.code) : null;
      if (place && !ev.shiftKey) {
        const n = Number(place[1]);
        if (n === 1) {
          if (selectingRef.current && !brushToolRef.current && !toolRef.current && !shelfRef.current) closeSelect();
          else openSelect();
          return;
        }
        const b = BRUSHES.find((x) => x.key === String(n))?.tool;
        if (b && painter.current && brushToolRef.current !== b) pickBrush(b);
        if (b) return;
      }
      const forceKey = place && ev.shiftKey ? FORCES.find((f) => f.key === `Shift+${place[1]}`) : undefined;
      if (forceKey && painter.current && forceShown(forceKey.id)) {
        ev.preventDefault();
        pickTop(toolRef.current === forceKey.id ? null : forceKey.id);
        return;
      }
      // M: Markers on or off, as the Show row's toggle does it
      if (!mod && !ev.altKey && !ev.shiftKey && ev.code === "KeyM") {
        ed.markersToggle.current?.();
        return;
      }
      // Ctrl+A (D264): the whole map, in the Select tool or with any brush out
      if (mod && !ev.altKey && ev.key.toLowerCase() === "a" && (selectingRef.current || brushToolRef.current)) {
        ev.preventDefault();
        selectAll();
        return;
      }
      // one key habit for every tool (D368 (1), swapping D344 A1's): { and } step the Size, [ and ] the
      // strength (a force's Power; Smooth and Naturalize's strength; nothing on Raise, Lower and Flatten,
      // whose target level is theirs), each beside the pointer; a force's Size set so is off Auto
      const habit = !mod && !ev.altKey ? keyHabit(ev.key) : null;
      if (habit && stepHabit(habit)) {
        ev.preventDefault();
        return;
      }
      // F: hold and move the mouse to size the brush, a click sets it (D205); held, the wheel sets the
      // strength (D368 (11))
      if (!mod && !ev.altKey && ev.key.toLowerCase() === "f") {
        ev.preventDefault();
        if (!ev.repeat && brushToolRef.current) painter.current?.startResize();
        else if (!ev.repeat) startForceSize();
        return;
      }
      if (ev.key === "Escape" && painter.current?.sizing) {
        painter.current.endResize(false);
        return;
      }
      if (ev.key === "Escape" && forceSizing.current) {
        endForceSize(false);
        return;
      }
      if (ev.key === "Escape" && painter.current?.painting) {
        painter.current.cancel();
        return;
      }
      if (ev.key === "Escape" && sourceGrab.current) {
        sourceGrab.current.cancel();
        return;
      }
      if (ev.key === "Escape" && startGrab.current) {
        startGrab.current.cancel();
        return;
      }
      // R turns the shelf's object (D184)
      if (!mod && !ev.altKey && ev.key.toLowerCase() === "r" && shelfRef.current) {
        if (shelfRef.current.turns) {
          const next = (turnRef.current + 1) % 4;
          turnRef.current = next;
          setTurn(next);
          const at = shelfTile.current;
          if (at) shelfHover(at[0], at[1]);
        }
        return;
      }
      // (with Quake picked, V flips the side of the fault that moves; X was its key before D323 item 16)
      if (!mod && !ev.altKey && ev.key.toLowerCase() === "v" && toolRef.current === "quake") {
        if (flipRef.current) flipRef.current();
        else setQuakeUi({ ...quakeUiRef.current, side: quakeUiRef.current.side === 1 ? -1 : 1 });
        return;
      }
      if (ev.key === "Escape" && shelfRef.current) {
        pickShelf(null);
        return;
      }
      if (ev.key === "Escape" && selection.current.count) {
        closeSelect();
        return;
      }
      // Esc: a target set by hand follows the ground again (D322), then the brush goes
      if (ev.key === "Escape" && brushToolRef.current && brushRef.current.target !== null) {
        setBrush({ ...brushRef.current, target: null }, false);
        return;
      }
      if (ev.key === "Escape" && brushToolRef.current) {
        pickBrush(null);
        return;
      }
      // Z undoes and C redoes; X closes the selection as Esc does (D323 item 16); Ctrl+Z, Ctrl+Y and
      // Ctrl+Shift+Z keep working too. (Fields ignore all of them, above.)
      if (!mod && !ev.altKey && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        void undo();
        return;
      }
      if (!mod && !ev.altKey && ev.key.toLowerCase() === "c") {
        ev.preventDefault();
        void redo();
        return;
      }
      // X puts down whatever is held (D345, B7): a brush, a force, the shelf's object, the selection, a picked
      // source or object: Select is left in hand (Kyler's choice at the v4 verdict)
      if (!mod && !ev.altKey && ev.key.toLowerCase() === "x" && (brushToolRef.current || toolRef.current || shelfRef.current || selectingRef.current || selection.current.count || pickedRef.current || pickedObjectRef.current)) {
        ev.preventDefault();
        putDown();
        return;
      }
      // ← and → while a weather day is held: a day back or on, as the stepper's arrows do (Kyler, 2026-10-04)
      if (!mod && !ev.altKey && (ev.key === "ArrowLeft" || ev.key === "ArrowRight") && ed.weatherRef.current) {
        ev.preventDefault();
        ed.stepWeather(ev.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      // Up and Down with a selection open: raise or lower it one level, as the buttons do (D323 item 6)
      if (!mod && !ev.altKey && (ev.key === "ArrowUp" || ev.key === "ArrowDown") && selection.current.count && !painter.current?.painting && !brushToolRef.current && !toolRef.current) {
        ev.preventDefault();
        selectCalls.current.action(ev.key === "ArrowUp" ? "raise" : "lower");
        return;
      }
      if (mod && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        void (ev.shiftKey ? redo() : undo());
      } else if (mod && ev.key.toLowerCase() === "y") {
        ev.preventDefault();
        void redo();
      } else if (ev.key === "Escape") {
        setTool(null);
        setPicked(null);
        setPickedObject(null);
      } else if ((ev.key === "Delete" || ev.key === "Backspace") && selection.current.count && !painter.current?.painting) {
        // Select and Delete (D288): everything inside the selection, the start aside, one step
        ev.preventDefault();
        deleteCalls.current.deleteSelection();
      } else if ((ev.key === "Delete" || ev.key === "Backspace") && pickedObjectRef.current && !pickedRef.current) {
        // an object picked with the plain pointer (D345, B7)
        ev.preventDefault();
        const o = pickedObjectRef.current;
        setPickedObject(null);
        void run(() => api.applyAll([{ op: "deleteEntities", params: { entities: [o.id] } }], "Remove an object"));
      } else if ((ev.key === "Delete" || ev.key === "Backspace") && pickedSources().length) {
        // a picked source: its water recedes live (D196)
        ev.preventDefault();
        removeSources(pickedSources());
      } else if ((ev.key === "Delete" || ev.key === "Backspace") && targetSpot.current && renderer.current?.hoverHit && !painter.current?.painting) {
        // the source the pointer targets, whatever tool is picked (D249): one step, its water
        // receding live
        ev.preventDefault();
        const t = targetSpot.current;
        void sourceInfo(t.x, t.y).then((e) => e && removeSources([e]));
      } else if ((ev.key === "Delete" || ev.key === "Backspace") && renderer.current?.hoverHit && !painter.current?.painting) {
        // what the pointer is on (D288, D323 item 1): an object goes, one step; on bare ground, its
        // top level
        const hit = renderer.current.hoverHit;
        ev.preventDefault();
        deleteCalls.current.deleteHere([hit.y * infoRef.current.W + hit.x]);
      } else if (!mod && !ev.altKey && ev.key.toLowerCase() === "u" && pickedSources().length && !forcer.current?.running) {
        // U: a picked source carves its own course (D239)
        ev.preventDefault();
        unleash(pickedSources()[0]);
      } else if (!mod && !ev.altKey && ev.key.toLowerCase() === "t") {
        // T: clear water, as the game (D196)
        setClearWater((on) => !on);
      }
    };
    // F let go: the size is set
    const onKeyUp = (ev: KeyboardEvent) => {
      if (ev.key.toLowerCase() === "f") {
        fHeld.current = false;
        painter.current?.endResize(true);
        endForceSize(true);
      }
    };
    // the window loses focus (a screenshot tool, Alt+Tab): the keyup never comes, so F's size is set here
    // (the renderer lets go of the camera keys and ends a stroke in progress; D361, item 5)
    const onBlur = () => onKeyUp({ key: "f" } as KeyboardEvent);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  });
}
