// The camera bookmarks (D205): nine slots of saved views, kept with the project. The keys keep the view in a slot
// (Ctrl+Shift+1–9) and glide back to it (Alt+1–9, keyboard/useKeyboard.ts); a finger has the same slots in Show's
// Camera section on a phone or a tablet (#1074 slice 7): a saved slot's tap glides to it, an empty slot's tap keeps the
// view there, and **Save** arms every slot to keep the view, over a saved one too. A finger's save and glide close Show
// first and wait for the view to slide into the room it leaves (`usePhone`), so a view is always kept and shown with the
// map at rest, as it is under the keys.

import { useEffect, useState } from "preact/hooks";
import { tip } from "../../ui/Tooltip";
import type { Ed } from "../ed";
import type { EditorProps } from "../Editor";

/** The slots, as the number keys give them. */
export const VIEW_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** The key that keeps the view in `slot`, and the one that glides back to it. */
export const saveViewKey = (slot: number) => `Ctrl+Shift+${slot}`;
export const goViewKey = (slot: number) => `Alt+${slot}`;

/** Keep the view as it is now in `slot` (its saved one replaced), saved with the project; no edit, no undo step. */
export function keepView(ed: Ed, props: EditorProps, slot: number, ev?: MouseEvent): void {
  const r = ed.renderer.current;
  if (!r) return;
  const v = r.getView();
  const views = [...ed.infoRef.current.views.filter((b) => b.slot !== slot), { slot, ...v }].sort((a, b) => a.slot - b.slot);
  void ed.api.setViews(views).then((i) => {
    ed.infoRef.current = { ...ed.infoRef.current, views: i.views };
    ed.setInfo((cur) => ({ ...cur, views: i.views }));
    props.onChange({ ...ed.infoRef.current, views: i.views });
  });
  ed.flashNote(`View ${slot} saved`, ev);
}

/** Glide to the view kept in `slot`, or say there is none. */
export function showView(ed: Ed, slot: number, ev?: MouseEvent): void {
  const r = ed.renderer.current;
  if (!r) return;
  const b = ed.infoRef.current.views.find((v) => v.slot === slot);
  if (b) r.glideTo(b);
  else ed.flashNote(`No view ${slot} saved yet`, ev);
}

/** Close the phone's sheet and run `then` once the view has slid into the room it leaves (at once with none open). */
function atRest(ed: Ed, then: () => void): void {
  if (!ed.phoneSheet) return then();
  ed.setPhoneSheet(null);
  const started = performance.now();
  const wait = () => {
    // (a slide that never comes, a renderer gone: four seconds at the most, a slow device's few frames of the slide)
    if (ed.roomSettled() || performance.now() - started > 4000) then();
    else requestAnimationFrame(wait);
  };
  // (a frame first: the page draws the closed sheet and the slide is wanted before it is asked whether it is done)
  requestAnimationFrame(() => requestAnimationFrame(wait));
}

/** Show's saved views (a phone's or a tablet's): the nine slots and Save, five to a row. */
export function SavedViews(p: { ed: Ed; props: EditorProps }) {
  const { ed, props } = p;
  const [arming, setArming] = useState(false);
  const saved = new Set(ed.info.views.map((v) => v.slot));
  // (Show closed, the slots rest: Save is armed for one tap at a time)
  useEffect(() => {
    if (ed.phoneSheet !== "show") setArming(false);
  }, [ed.phoneSheet]);
  const tap = (slot: number, ev: MouseEvent) => {
    const keep = arming || !saved.has(slot);
    setArming(false);
    atRest(ed, () => (keep ? keepView(ed, props, slot, ev) : showView(ed, slot, ev)));
  };
  return (
    <div class={`ps-grid ps-views${arming ? " arming" : ""}`} role="group" aria-label="Saved views">
      {VIEW_SLOTS.map((slot) => {
        const has = saved.has(slot);
        const keep = arming || !has;
        const words = keep ? (has ? `Save this view over view ${slot}` : `Save this view as view ${slot}`) : `Go to view ${slot}`;
        return (
          <button type="button" key={slot} class={`view-slot${has ? " saved" : ""}`} aria-label={words} {...tip(words, keep ? saveViewKey(slot) : goViewKey(slot))} onClick={(e) => tap(slot, e)}>
            {slot}
          </button>
        );
      })}
      <button type="button" class="view-save" aria-pressed={arming} {...tip(arming ? "Keep the slots as they are" : "Save this view in a slot, over a saved one too", "Ctrl+Shift+1–9")} onClick={() => setArming(!arming)}>
        Save
      </button>
    </div>
  );
}
