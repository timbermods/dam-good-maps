// The words a check's message is made of (Kyler, 2026-10-03: the messages are player text). An
// object is named as the game shows it ("Geothermal field", "Water source", "Ruin", the names the
// editor's readout uses, `describeObject`), then what is wrong in a few words, then where it is,
// "X 105 · Y 7 · Z 11" (the game's order; Z is the height). One line per object. The ids and the
// coordinates stay in a check's data (`where`); only the text changes.

import { describeObject } from "../doc/describeTile";

/** The game's name for a template: "Geothermal field", "Water source", "Ruin", "Pine" … */
export const nameOf = (template: string): string => describeObject({ template }).name;

/** A place the way the game counts it: "X 105 · Y 7 · Z 11". */
export const placeOf = (x: number, y: number, z: number): string => `X ${x} · Y ${y} · Z ${z}`;

/** "1 source", "3 sources" (a plural that is not just an s goes in `many`). */
export const counted = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** "1 source's", "3 sources'". */
export const possessive = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? `${one}'s` : `${many}'`}`;

/** The first letter capital. */
export const cap = (s: string): string => s[0].toUpperCase() + s.slice(1);

/** One line for an object: its name, what is wrong, its place ("Geothermal field floating · X 105 · Y 7 · Z 11"). */
export const objectLine = (template: string, wrong: string, x: number, y: number, z: number): string => `${nameOf(template)} ${wrong} · ${placeOf(x, y, z)}`;

/** Lines, one per object, at most `max` of them and then "and 3 more". */
export function lines(all: readonly string[], max = 6): string {
  return all.length > max ? [...all.slice(0, max), `and ${all.length - max} more`].join("\n") : all.join("\n");
}
