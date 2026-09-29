// "The page is the editor", part 1 (PLAN §20 D330, docs/UI-BRIEF.md): the side panel's parts, built
// on their own before the workspace puts them together (after the forces' release, with item 34's
// split of the editor into feature folders). What the workspace wires is listed in EDITOR_PLAN.md
// §8, "The page is the editor: the parts built".

export { SidePanel, type SidePanelProps } from "./panel/SidePanel";
export { GenerateControls, type GenerateControlsProps } from "./panel/GenerateControls";
export { generateOnEnter, settingsDiffer, settingsKey } from "./panel/generate";
export { loadPanelOpen, savePanelOpen, PANEL_MODES, type PanelMode } from "./panel/panelState";
export { MapCard, type MapCardProps } from "./card/MapCard";
export { generatedCard, placeCard, legendItems, legendTiles, leverMarks, type CardInput, type LegendHighlight, type Levers, type WalkReach } from "./card/cardModel";
export { YourMaps, type YourMapsProps } from "./yourMaps/YourMaps";
export { openYourMaps, newMapId, storeProblem, KEEP, type YourMapEntry, type YourMapsStore, type StoreResult, type Removed } from "./yourMaps/store";
export { YourMapsSaver, type Snapshot } from "./yourMaps/saver";
export { QuietNote, ReplacedNote, replacedText } from "./QuietNote";
export { CandidatesStrip, type CandidatesStripProps } from "./candidates/CandidatesStrip";
export { strip, EMPTY_STRIP, candidateId, nextVariation, type StripState, type StripEvent, type StripItem, type CandidateMap, type VersionOffer } from "./candidates/strip";
export { pickFirstVisit, type FirstVisitIndex, type FirstVisitMap } from "./firstVisit/format";
export { loadFirstVisit } from "./firstVisit/load";
export { thumbnailDataUrl, thumbnailPixels } from "./thumbnail";
