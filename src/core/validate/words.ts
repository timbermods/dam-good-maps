// The words a message is made of (Kyler, 2026-10-03: the messages are player text). An object is named
// as the game shows it ("Geothermal field", "Water source", "Ruin", the names the editor's readout uses,
// `describeObject`); counts take correct plurals. The checks' own messages are written in Rust
// (rust/checks/src/words.rs, the same rules); the importer's notes use these.

import { describeObject } from "../doc/describeTile";

/** The game's name for a template: "Geothermal field", "Water source", "Ruin", "Pine" … */
export const nameOf = (template: string): string => describeObject({ template }).name;

/** "1 source", "3 sources" (a plural that is not just an s goes in `many`). */
export const counted = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
