// The words of the real places (ROADMAP "Real places"; Kyler, 2026-09-25, D155, D174): each
// landform family's name on the page and how it plays, and each place's title and the place in the
// description's sentence, from the landscape survey's own name. Plain ASCII: the game's handling of
// other characters is not yet checked.

/** Each family's name on the page and how it plays: the survey's "play value" for the family
 *  (investigation/landscapes/FAMILIES.md), in plain words. A family label names the region the
 *  survey sampled, so the line says what the landform tends to give. Per-map lines wait for M9c's
 *  names and descriptions. */
export const FAMILIES: Record<string, { name: string; plays: string }> = {
  archipelago: { name: "Archipelago", plays: "Islands split the land into many routes; plan how you cross." },
  badlands: { name: "Badlands", plays: "Gullies cut many small narrows and walls; flat land for farms is scarce." },
  braided: { name: "Braided river", plays: "Channels split around gravel islands, so you have several places to dam." },
  caldera: { name: "Caldera", plays: "A volcanic bowl; a dam on its outlet can hold a large lake." },
  canyon: { name: "Canyon", plays: "Narrow places to dam and high ground to claim; flat land is scarce." },
  coast: { name: "Coast", plays: "Cliffs and small basins along the shore." },
  cone: { name: "Volcano", plays: "Land falls away from a peak on every side, so you build upward." },
  confluence: { name: "River junction", plays: "Rivers meet, so dam sites and routes out compete." },
  delta: { name: "Delta", plays: "Many small channels and islands; storage is shallow and flooding is a risk." },
  escarpment: { name: "Escarpment", plays: "A steep face splits high and low ground, with a few ways through." },
  falls: { name: "Waterfall", plays: "Drops in the river give height and power; storage depends on the pools above them." },
  fan: { name: "Alluvial fan", plays: "Dry land fans out from a valley mouth; irrigation decides where you grow." },
  fjord: { name: "Fjord", plays: "Steep shores and wide water to store." },
  glacial: { name: "Glacial valley", plays: "Wide valley floors under high ground, with side valleys hanging above." },
  gorge: { name: "Gorge", plays: "Short dams and falls; room beside the water is tight." },
  karst: { name: "Karst", plays: "Steep hills around separate basins; routes between them take planning." },
  lakes: { name: "Lakes", plays: "Chains of lakes store water; their outlets decide how far each can grow." },
  meander: { name: "Winding river", plays: "A winding river; cut-off bends can keep water through a drought." },
  mesa: { name: "Mesa", plays: "Flat-topped heights that are hard to reach; the gaps between them make dam sites." },
  plateau: { name: "Plateau", plays: "Broad high ground to build on; deep water may be hard to reach." },
};

/** Titles (Kyler, 2026-09-25): the survey's name without "Near", the "(… sample)" suffix and the
 *  scale. Titles that still read awkwardly are tidied here, keyed by that shortened name.
 *  "Badwater" is a place name in Death Valley, and a hazard in Timberborn: that map has none. */
const TIDY: Record<string, string> = {
  "Thousand Islands Saint Lawrence": "Thousand Islands",
  "Lena delta": "Lena Delta",
  "Death Valley Badwater fan": "Death Valley",
  "English Lake District": "Lake District",
  "Aso caldera": "Aso Caldera",
  "Danube delta": "Danube Delta",
  "Western Ghats Mahabaleshwar": "Mahabaleshwar, Western Ghats",
  "Roaring River fan": "Roaring River Fan",
  "Chilean Aysen fjord": "Aysen Fjord",
  "Finnish Saimaa": "Lake Saimaa",
  "Ennedi plateau": "Ennedi Plateau",
  "Grand Canyon Colorado": "Grand Canyon",
  "Na Pali coast": "Na Pali Coast",
  "Godavari delta": "Godavari Delta",
  "Niagara escarpment Hamilton": "Niagara Escarpment",
  "Taklimakan Kunlun fan": "Kunlun Alluvial Fan",
  "Dinaric karst Plitvice": "Plitvice Lakes",
  "Lower Mississippi oxbows": "Mississippi Oxbows",
  "Skeidara outwash": "Skeidara Outwash",
  "Blue Mountains Jamison": "Blue Mountains",
  "Atacama fan": "Atacama Fan",
  "Kenai Aialik Bay": "Aialik Bay",
  "Aoraki Hooker Valley": "Hooker Valley",
  "Li River Yangshuo": "Li River",
  "Goosenecks San Juan": "Goosenecks of the San Juan",
  "Brahmaputra near Majuli": "Majuli, Brahmaputra",
  "Ilulissat icefjord": "Ilulissat Icefjord",
  "Tsingy Bemaraha": "Tsingy de Bemaraha",
  // the survey's regions the first round left out
  "Mississippi birdfoot": "Mississippi Delta",
  "Okavango delta": "Okavango Delta",
  "Kosi fan": "Kosi Fan",
  "Canadian Shield Temagami": "Temagami",
  "Mazurian lakes": "Masurian Lakes",
  "Patagonian Nahuel Huapi": "Nahuel Huapi",
  "Rio Negro and Solimoes": "Rio Negro and Solimoes",
  "Etretat cliffs": "Etretat Cliffs",
  "Stockholm archipelago": "Stockholm Archipelago",
  "Dalmatian Kornati": "Kornati",
};

/** How a title reads in the description's sentence, "Inspired by the land near …": the titles that
 *  take "the", and two that need more words. The rest read as they are. */
const THE = new Set([
  "Thousand Islands", "Toklat River", "Colca Canyon", "Twelve Apostles", "Rhine and Moselle", "Lena Delta", "Drakensberg Amphitheatre",
  "Geirangerfjord", "Lake District", "Uvac River", "Ethiopian Highlands", "Tagliamento River", "Blyde River Canyon", "Cliffs of Moher",
  "Alaknanda and Bhagirathi", "Danube Delta", "Roaring River Fan", "Aysen Fjord", "Verdon Gorge", "Chocolate Hills", "Kinabatangan River",
  "Ennedi Plateau", "Deccan Plateau", "Bardenas Reales", "Waimakariri River", "Grand Canyon", "Na Pali Coast", "Godavari Delta",
  "Niagara Escarpment", "Kunlun Alluvial Fan", "Plitvice Lakes", "Mississippi Oxbows", "Bungle Bungle", "Tibetan Plateau",
  "Painted Desert", "Skeidara Outwash", "Fish River Canyon", "Blue Mountains", "Atacama Fan", "Hooker Valley", "Todgha Gorge",
  "Li River", "Goosenecks of the San Juan", "Colorado Plateau", "Ilulissat Icefjord", "Tara Gorge", "Tsingy de Bemaraha",
  "Mamore River", "Altiplano", "Mississippi Delta", "Okavango Delta", "Kosi Fan", "Masurian Lakes", "Green and Colorado",
  "Rio Negro and Solimoes", "Kawarau and Shotover", "Etretat Cliffs", "Cape of Good Hope", "Stockholm Archipelago", "Kornati",
]);
const NEAR: Record<string, string> = {
  "Mahabaleshwar, Western Ghats": "Mahabaleshwar, in the Western Ghats",
  "Majuli, Brahmaputra": "Majuli, on the Brahmaputra",
};

/** The part of a named place the survey sampled, as a title's last word. */
const PART: Record<string, string> = { east: "East", north: "North", southwest: "Southwest" };

/** Second maps named by their own land (Kyler, 2026-09-26, D214): a real feature inside the map's
 *  square (checked against OpenStreetMap's named features in it), else a plain position ("Upper
 *  Valley", "South Rim"), keyed by the survey patch (`<location>-<size>-<metres>`). A second map
 *  at a place's centre needs one; one from a sampled part may have one. */
const SECOND: Record<string, string> = {
  // the river's wide bed and the town of San Daniele del Friuli on its hills
  "n064-256-30": "San Daniele, Tagliamento River",
  // the plateau's eastern edge at Kate's Point, east of Mahabaleshwar
  "n277-256-30": "Kate's Point, Western Ghats",
  // every corner on Samosir, the island in the lake
  "n132-96-30": "Samosir, Lake Toba",
};

/** A survey name, "Near Grand Canyon Colorado (southwest sample), 60 m per tile": the map's title,
 *  the place in a sentence, and the part of the place sampled. `part` names a second map of one
 *  place by its own land: its `SECOND` title (by `patch`), else the part sampled ("Colca Canyon
 *  North"). */
export function title(surveyName: string, part = false, patch = ""): { name: string; place: string; sample?: string } {
  const m = /^Near (.+?)(?: \((north|south|east|west|northeast|northwest|southeast|southwest) sample\))?, \d+ m per tile$/.exec(surveyName);
  if (!m) throw new Error(`unexpected survey name ${surveyName}`);
  const base = TIDY[m[1]] ?? m[1];
  const place = NEAR[base] ?? (THE.has(base) ? `the ${base}` : base);
  let name = base;
  if (part) {
    const own = SECOND[patch];
    const word = PART[m[2] ?? ""];
    if (!own && !word) throw new Error(`${surveyName}: a second map at the place's centre needs its own title (SECOND in tools/places/titles.ts, under ${patch || "its patch"})`);
    // "Majuli North, Brahmaputra": the part stays with the place it names
    const comma = base.indexOf(",");
    name = own ?? (comma > 0 ? `${base.slice(0, comma)} ${word}${base.slice(comma)}` : `${base} ${word}`);
  }
  return { name, place, ...(m[2] ? { sample: m[2] } : {}) };
}

/** A title's id: its slug. */
export function slug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
