// The History's words (EDITOR_PLAN §3, History): every operation's label reads "Verb the thing" with a
// correct article and plural, the Items list's names ("Berry bush", "Water source", "Mine site"), a count
// written "Raise 806 tiles" (never "Raise, 806 tiles" or "Raise 1 tiles").

/** The Items list's name for a template, lower case, as a label reads it ("berry bush", "water source"). */
const ITEM_NAMES: Record<string, string> = {
  BlueberryBush: "berry bush",
  StartingLocation: "start",
  UndergroundRuins: "mine site",
  Thorns: "thorn",
  SmallRelic: "relic",
  MediumRelic: "relic",
  LargeRelic: "relic",
};

export function itemName(template: string): string {
  if (ITEM_NAMES[template]) return ITEM_NAMES[template];
  if (/^RuinColumnH\d+$/.test(template)) return "ruin";
  return template.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

/** The plural of a name: "pine" → "pines", "birch" → "birches", "berry bush" → "berry bushes". */
export function pluralOf(name: string): string {
  if (/(s|x|z|ch|sh)$/.test(name)) return `${name}es`;
  if (/[^aeiou]y$/.test(name)) return `${name.slice(0, -1)}ies`;
  return `${name}s`;
}

/** "a pine", "an oak". */
export function withArticle(name: string): string {
  return `${/^[aeiou]/.test(name) ? "an" : "a"} ${name}`;
}

/** "a pine" for one, "34 pines" for more; `many` is the plural where it is not just an s. */
export function counted(n: number, name: string, many = pluralOf(name)): string {
  return n === 1 ? withArticle(name) : `${n.toLocaleString("en-GB")} ${many}`;
}

/** "1 tile", "806 tiles". */
export function tileCount(n: number): string {
  return `${n.toLocaleString("en-GB")} tile${n === 1 ? "" : "s"}`;
}

/** "Plant a pine", "Plant 34 birches". */
export function plantLabel(template: string, n: number): string {
  return `Plant ${counted(n, itemName(template))}`;
}

/** "Place a water source", "Move a mine site". */
export function placeLabel(verb: "Place" | "Move", template: string): string {
  return `${verb} ${withArticle(itemName(template))}`;
}
