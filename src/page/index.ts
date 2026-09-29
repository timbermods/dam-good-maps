// "The page is the editor", part 1 (PLAN §20 D330, docs/UI-BRIEF.md): the side panel's parts, built
// on their own before the workspace puts them together (after the forces' release, with item 34's
// split of the editor into feature folders). They are views (D342): the questions they answer are
// core functions (src/core/analysis/legend.ts and levers.ts, src/core/spec/differ.ts,
// src/core/library/), and Your maps' storage is a platform adapter (src/platform/yourMaps.ts). What
// the workspace wires is listed in EDITOR_PLAN.md §8, "The page is the editor: the parts built".

export { SidePanel, type SidePanelProps } from "./panel/SidePanel";
export { GenerateControls, type GenerateControlsProps } from "./panel/GenerateControls";
export { generateOnEnter } from "./panel/enter";
export { loadPanelOpen, savePanelOpen, PANEL_MODES, type PanelMode } from "./panel/panelState";
export { MapCard, type MapCardProps } from "./card/MapCard";
export { generatedCard, placeCard, type CardInput, type LegendHighlight } from "./card/cardModel";
export { YourMaps, type YourMapsProps } from "./yourMaps/YourMaps";
export { QuietNote, ReplacedNote, replacedText } from "./QuietNote";
export { CandidatesStrip, type CandidatesStripProps } from "./candidates/CandidatesStrip";
export { loadFirstVisit } from "./firstVisit/load";
export { thumbnailDataUrl } from "./thumbnail";
