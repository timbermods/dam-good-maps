// What the page gives the map generator's panel and Your maps (the page owns all of it, src/ui/App.tsx; the panels
// only show it).

import type { VersionParent } from "../../core/doc/document";
import type { SettingsProps } from "./hints";

/** A map of Your maps: its picture, name and dimensions. */
export interface YourMapRow {
  id: string;
  name: string;
  size?: { w: number; h: number };
  /** Your maps' stored picture (a PNG data URL), or none yet. */
  thumbnail: string | null;
  /** A kept version: the map it came from and the History step it was taken at. */
  parent?: VersionParent;
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
  onOpenPlace(id: string): void;
  /** A map of Your maps, open or not: its .timber downloaded; renamed (null, or why not); maps deleted (asked once). */
  onDownloadMap(id: string): void;
  onRenameMap(id: string, name: string): Promise<string | null>;
  onDeleteMaps(ids: readonly string[]): void;
  /** Compare a map of Your maps with the open one (the same size): the editor flips between them while a key is held. */
  onCompareMap(id: string): void;
  /** The map's name (the title's), and renaming it through the core: null, or why not. */
  name: string;
  onRename(name: string): Promise<string | null>;
}
