// The editor's frame before any map is on show (a share link, a reload, a real place opened first): the header, the
// tool bar and the shelf as they will be, held still, with the first look of the land in the map's place; the page
// puts its progress dialog over it. Nothing looks frozen or empty while the first map is made (PERFECT §4: something
// visible at once). It shows the real header, bar and shelf, so it follows them; nothing in it takes a click.

import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { softwareRendering } from "../render3d/renderer";
import { canSaveToTimberborn } from "../platform";
import type { SessionInfo } from "../worker/session";
import type { ItemActions } from "./panels";
import { ChecksDot, Header } from "./Header";
import { Shelf } from "./Shelf";
import { TopBar, type PhoneBar } from "./TopBar";
import { shelfIcons } from "./shelf/iconCache";
import { DEFAULT_BRUSH } from "./brushes";
import { TogetherFace } from "./collab/Together";
import { DEFAULT_BLOCK } from "./block/blockTool";
import { useFrameDockRoom } from "./view/useBandLayout";
import { useRoom } from "./view/usePhone";

const nothing = () => undefined;
const NO_ACTIONS: ItemActions = { onFix: nothing, onShow: nothing, canShow: () => false };
/** A phone's tool row while the map is made: no sheet open, nothing in hand. */
const PHONE_BAR: PhoneBar = { tall: false, onTall: nothing, objectsOpen: false, holding: false, onObjects: nothing };

export interface LoadingFrameProps {
  /** The title while the map is made. */
  name: string;
  /** Its second line: the size asked for, or empty. */
  subtitle: string;
  /** The map's place: the first look of the land. */
  children?: ComponentChildren;
}

export function LoadingFrame(p: LoadingFrameProps) {
  // (the editor's Look button is there unless the browser draws in software, where the view has only the light look)
  useFrameDockRoom();
  const [look] = useState(() => !(softwareRendering() && !window.dgmLookTest?.gpu));
  // (a phone's frame is the phone's layout, as the editor will be: the desktop's bar, wider than the screen, would make the
  // browser zoom the page out while the first map is made, #1074)
  const phone = useRoom();
  return (
    <div class="editor loading-frame" data-phone={phone ?? undefined} inert aria-busy="true">
      <Header
        phone={phone}
        info={{ kind: "import", W: 0, H: 0 } as SessionInfo}
        name={p.name}
        onRename={() => Promise.resolve(null)}
        onDescribe={() => Promise.resolve(null)}
        saveState={p.subtitle}
        canUndo={false}
        canRedo={false}
        onUndo={nothing}
        onRedo={nothing}
        dot={<ChecksDot check={null} instant={[]} busy progress={null} flowing={false} open={false} onToggle={nothing} actions={NO_ACTIONS} />}
        canFolder={canSaveToTimberborn()}
        saving={null}
        onSave={nothing}
        onChooseFolder={nothing}
        onOpenFile={nothing}
        onNewBlank={nothing}
        onSaveProject={nothing}
        onClearEverything={nothing}
        historyOpen={false}
        onHistory={nothing}
        drawerOpen={false}
        onDrawer={nothing}
        mapsOpen={false}
        onMaps={nothing}
        placesOpen={false}
        onPlaces={nothing}
        look={
          look ? (
            <button type="button" class="ghost" tabIndex={-1}>
              <span class="look-words">
                <span>
                  Look<span class="look-state">: Standard</span>
                </span>
              </span>
            </button>
          ) : null
        }
        together={
          <div class="together-wrap">
            <button type="button" class="ghost together-button" tabIndex={-1}>
              <TogetherFace />
            </button>
          </div>
        }
      />
      <div class="editor-main">
        <section class="editor-map" aria-label="Map">
          <div class="editor-map-area">
            <div class="view3d-frame legend-none editor-view">
              <div class="view3d loading-view">{p.children}</div>
              <TopBar active={null} settings={DEFAULT_BRUSH} onPick={nothing} onSettings={nothing} onSelect={nothing} blockSettings={DEFAULT_BLOCK} loading phone={phone ? PHONE_BAR : null} />
              {phone ? null : (
                <div class="objects-dock">
                  <Shelf picked={null} onPick={nothing} onDragStart={nothing} onDrop={nothing} icon={(t) => shelfIcons()[t] ?? null} loading />
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
