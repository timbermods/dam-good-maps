// What the page gives the map generator's panel and Your maps (the page owns all of it, src/ui/App.tsx; the panels
// only show it).

import type { VersionParent } from "../../core/doc/document";
import type { SettingsProps } from "./hints";
import type { ShowcaseModel } from "./showcaseModel";

/** A map of Your maps: its picture, name and dimensions. */
export interface YourMapRow {
  id: string;
  name: string;
  size?: { w: number; h: number };
  /** Your maps' stored picture (a PNG data URL), or none yet. */
  thumbnail: string | null;
  /** A kept version: the map it came from and the History step it was taken at. */
  parent?: VersionParent;
  /** The kept version was edited after it was kept. */
  editedSince?: boolean;
}

/** What the page gives the generator and Your maps. */
export interface GeneratorModel extends SettingsProps {
  /** A map is being made or opened (the modal says which). */
  busy: boolean;
  /** The settings differ from the current map's. */
  changed: boolean;
  onGenerate(): void;
  onSurprise(): void;
  /** Another like this (D278 (1c)): a sibling of the open map, the same theme, settings and intentions on new land. */
  onAnother(): void;
  /** The open map is a generated one (Another like this works on those only; greyed otherwise). */
  canAnother: boolean;
  maps: YourMapRow[];
  /** The open map in Your maps. */
  current: string | null;
  onOpenMap(id: string): void;
  /** Open a real place in the editor (the map it replaces is kept in Your maps). */
  onOpenPlace(id: string, name?: string): void;
  /** A map of Your maps, open or not: its .timber downloaded; renamed (null, or why not); maps deleted (asked once). */
  onDownloadMap(id: string): void;
  onRenameMap(id: string, name: string): Promise<string | null>;
  onDeleteMaps(ids: readonly string[]): void;
  /** Compare a map of Your maps with the open one (the same size): the editor flips between them while a key is held. */
  onCompareMap(id: string): void;
  /** The open map's size (an unedited map is not in the list), for what compares with it. */
  openSize?: { w: number; h: number };
  /** The open map's name (the title's) and the name typed in the panel for the next map: null until one is typed. The
   *  typed name goes to the map the next Generate makes; the open map keeps its own (it is renamed from the title). */
  name: string;
  nextName: string | null;
  onNextName(name: string | null): void;
  /** Showcase mode (D488 (2)): the search for maps with an arc, its sheet and its cards. */
  showcase: ShowcaseModel;
}
