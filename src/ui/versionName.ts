// The name a kept version gets in Your maps (History's Keep this version and Branch from here): given, never asked. Its own
// name, or numbered ("<name> (2)", "(3)", ...) when Your maps already holds it, the way saved files are numbered rather
// than overwritten (D345 B10, D360).

/** The longest a map's name may be (the same the tile's rename field allows). */
const NAME_MAX = 80;

export function numberedName(name: string, taken: readonly string[]): string {
  const held = new Set(taken);
  if (!held.has(name)) return name;
  for (let n = 2; ; n++) {
    const tail = ` (${n})`;
    const numbered = name.length + tail.length <= NAME_MAX ? name + tail : `${name.slice(0, NAME_MAX - tail.length - 1).trimEnd()}…${tail}`;
    if (!held.has(numbered)) return numbered;
  }
}
