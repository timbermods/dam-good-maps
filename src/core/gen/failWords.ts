// Why an attempt failed, in a player's words: the making dialog says it beside the attempt, so a slow
// map says why it is slow (#236, the 256² audit). One short phrase for the first reason an attempt
// records (`GenerateResult.failures`' ids: a generator stage's reason, or a blocking check's id).

/** A generator stage's reason, or a check's id, as a short plain phrase. */
const PHRASES: Record<string, string> = {
  // the land stage, before the land is shown
  "promise (planned)": "the land missed its theme's promise",
  "water story (planned)": "the planned water told no story",
  "a drained sea (planned)": "the sea drained away",
  "an island to expand to (planned)": "no island to expand to",
  "a river's water leaves its course": "a river left its course",
  "a river's head under a lake": "a river began under a lake",
  "a sea over its shelf": "a sea stood over a wide shelf",
  "an edge wall": "a wall stood along an edge",
  "no rivers": "no river found its way",
  rivers: "too few rivers reached the edge",
  "one place for a start": "only one place for a start",
  "no room for the mine sites": "no room for the mine sites",
  "mine pair (pre-fill)": "the start couldn't reach two mine sites",
  "no place for badwater": "no place for the badwater",
  "above 16": "the land rose too high",
  "ruler-straight channel": "a channel ran ruler-straight",
  "water.straight_channel": "a channel ran ruler-straight",
  // the start, on the settled water
  "no start": "no place for the start",
  "start water moved": "the start's water moved",
  "start water a sealed puddle": "the start's water was a sealed puddle",
  "start walk too small": "too little land round the start",
  "mine pair (settled)": "the start couldn't reach two mine sites",
  "source in a flow": "a source stood in flowing water",
  // the checks on the finished map
  "start.badwater": "badwater too near the start",
  "start.water": "the start's water fell short",
  "start.wood": "too little wood near the start",
  "start.wood_floor": "too little wood near the start",
  "start.food": "too little food near the start",
  "start.reach": "the start couldn't reach enough land",
  "start.level_land": "too little level land at the start",
  "start.farmland": "too little farmland at the start",
  "water.settles": "the water didn't settle",
  "water.source_in_flow": "a source stood in flowing water",
  "water.no_flood": "the water flooded too much land",
  "water.badwater_contained": "the badwater ran into the clean water",
  "water.outflow": "the water found no way out",
  "terrain.dam_wall": "the water stood against a wall",
  "terrain.edge_wall": "a wall stood along an edge",
  "terrain.max_height": "the land rose too high",
  "resources.mine_site": "the start couldn't reach two mine sites",
  "resources.trees": "too few trees",
  "resources.bushes": "too few berry bushes",
  "resources.badwater_source": "no place for the badwater",
};

/** The words of a family of checks no phrase above names. */
const FAMILIES: [string, string][] = [
  ["start.", "the start missed one of its rules"],
  ["water.", "the water missed a check"],
  ["terrain.", "the land missed a check"],
  ["resources.", "too few resources"],
  ["plants.", "the plants missed a check"],
];

/** A failed attempt's first reason (its ids, as `GenerateResult.failures` records them) in a short
 *  plain phrase, lower case, for the making dialog: "the start's water moved". */
export function failurePhrase(ids: readonly string[]): string {
  for (const id of ids) if (PHRASES[id]) return PHRASES[id];
  for (const id of ids) for (const [prefix, words] of FAMILIES) if (id.startsWith(prefix)) return words;
  return "a check failed";
}
