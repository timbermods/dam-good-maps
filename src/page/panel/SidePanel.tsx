// The side panel (docs/UI-BRIEF.md §2, §3; PLAN §20 D330): everything about the map as a whole,
// choosing, comparing and keeping. Collapsible to a thin strip; open on the first visit, then as it
// was left. Top to bottom: the switch (Generate · Real places · Pick a place) with the chosen mode's
// controls, the candidates strip, the map card, Your maps. The page passes each part in; this
// component only lays them out and owns the collapse and the switch's markup.

import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { loadPanelOpen, PANEL_MODES, savePanelOpen, type PanelMode } from "./panelState";
import "../page.css";

export interface SidePanelProps {
  mode: PanelMode;
  onMode(mode: PanelMode): void;
  /** Each mode's controls: the generator's settings with Generate (`GenerateControls`), the Real
   *  places gallery with its search, and Pick a place's search and framing square (null until it
   *  is built: its switch button is then disabled). */
  controls: { generate: ComponentChildren; places: ComponentChildren; pick?: ComponentChildren | null };
  /** The candidates strip (generated maps only; it renders nothing otherwise). */
  strip?: ComponentChildren;
  card?: ComponentChildren;
  yourMaps?: ComponentChildren;
  /** Controlled open state; by default the panel keeps its own and remembers it. */
  open?: boolean;
  onOpenChange?(open: boolean): void;
}

export function SidePanel(p: SidePanelProps) {
  const [own, setOwn] = useState(loadPanelOpen);
  const open = p.open ?? own;
  const setOpen = (v: boolean) => {
    savePanelOpen(v);
    setOwn(v);
    p.onOpenChange?.(v);
  };

  if (!open)
    return (
      <aside class="pg-panel pg-panel-collapsed" aria-label="Map panel">
        <button type="button" class="ghost pg-panel-toggle" aria-expanded="false" aria-controls="pg-panel-body" title="Open the panel" onClick={() => setOpen(true)}>
          <span aria-hidden="true">›</span>
          <span class="pg-sr">Open the panel</span>
        </button>
      </aside>
    );

  const pickReady = p.controls.pick !== undefined && p.controls.pick !== null;
  return (
    <aside class="pg-panel" aria-label="Map panel">
      <div class="pg-panel-head">
        <div class="pg-switch" role="tablist" aria-label="Where the map comes from">
          {PANEL_MODES.map(({ mode, label }) => {
            const disabled = mode === "pick" && !pickReady;
            return (
              <button
                type="button"
                role="tab"
                key={mode}
                id={`pg-tab-${mode}`}
                aria-selected={p.mode === mode}
                aria-controls="pg-panel-mode"
                disabled={disabled}
                title={disabled ? "Coming later" : undefined}
                tabIndex={p.mode === mode ? 0 : -1}
                onClick={() => p.onMode(mode)}
                onKeyDown={(e) => {
                  // arrow keys move along the switch, as in any tab list
                  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                  e.preventDefault();
                  const live = PANEL_MODES.filter((m) => m.mode !== "pick" || pickReady);
                  const k = live.findIndex((m) => m.mode === p.mode);
                  const next = live[(k + (e.key === "ArrowRight" ? 1 : live.length - 1)) % live.length];
                  p.onMode(next.mode);
                  (e.currentTarget.parentElement?.querySelector(`#pg-tab-${next.mode}`) as HTMLElement | null)?.focus();
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <button type="button" class="ghost pg-panel-toggle" aria-expanded="true" aria-controls="pg-panel-body" title="Collapse the panel" onClick={() => setOpen(false)}>
          <span aria-hidden="true">‹</span>
          <span class="pg-sr">Collapse the panel</span>
        </button>
      </div>
      <div class="pg-panel-body" id="pg-panel-body">
        <div class="pg-panel-mode" id="pg-panel-mode" role="tabpanel" aria-labelledby={`pg-tab-${p.mode}`}>
          {p.mode === "generate" ? p.controls.generate : p.mode === "places" ? p.controls.places : p.controls.pick}
        </div>
        {p.strip}
        {p.card}
        {p.yourMaps}
      </div>
    </aside>
  );
}
