// The credits of the real places (ROADMAP "Real places", PLAN §20 D136). The credits page
// (real-places/credits/) and the gallery show them in full: the source, what was changed, that the
// providers do not endorse the maps, and every provider's notice, verbatim, with its licence (the
// Terrain Tiles attribution, tilezen/joerd docs/attribution.md, "Required attribution";
// investigation/landscapes/ATTRIBUTION.md), and the water data's (ESA WorldCover, D271). Each map's in-game description links to the credits
// page, and carries a provider's notice itself only where the provider's terms need it in the file
// (Kyler, 2026-09-25). Each provider's verdict, with its licence and the deciding words, is in
// docs/real-places-credits.md.

/** The credits page, as a map's description links to it. */
export const CREDITS_URL = "https://timbermods.github.io/dam-good-maps/real-places/credits/";

/** Where the heights come from. */
export const ELEVATION_SOURCE = "Terrain Tiles, on the Registry of Open Data on AWS";
export const ELEVATION_SOURCE_URL = "https://registry.opendata.aws/terrain-tiles/";

/** What was changed to make a playable map (ATTRIBUTION.md, "Changes"), in plain words. */
export const CHANGES =
  "The heights were resampled, cropped and fitted to 16 levels. Water sources were added where the real place has water, trees, bushes and ruins were added, and the water settled.";

/** Where the water comes from (Kyler, 2026-09-27, D271: a place's water follows the real place):
 *  ESA WorldCover's permanent water bodies, as Pick a place uses it (D192). CC BY 4.0: credit by
 *  link (docs/real-places-credits.md), its notice verbatim from the provider. */
export const WATER_SOURCE = "ESA WorldCover 10 m 2021 v200";
export const WATER_SOURCE_URL = "https://registry.opendata.aws/esa-worldcover-vito/";
export const WATER_NOTICE = "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium";
export const WATER_LICENCE = "CC BY 4.0";
export const WATER_LICENCE_URL = "https://creativecommons.org/licenses/by/4.0/";
/** Rivers WorldCover misses (a narrow river, one in a gorge's shade): OpenStreetMap's permanent
 *  rivers (D271). ODbL: "© OpenStreetMap contributors", credit by link. */
export const RIVERS_SOURCE = "OpenStreetMap";
export const RIVERS_SOURCE_URL = "https://www.openstreetmap.org/";
export const RIVERS_NOTICE = "© OpenStreetMap contributors";
export const RIVERS_LICENCE = "ODbL";
export const RIVERS_LICENCE_URL = "https://www.openstreetmap.org/copyright";
/** What the water data was used for, in plain words. */
export const WATER_USE = "Their permanent water decides where water sources go; the water is then simulated on the map. The providers do not endorse these maps.";

export const NOT_ENDORSED = "The data providers do not endorse these maps.";

/** Latitude and longitude bounds, in degrees: [south, north, west, east]. */
export type Box = readonly [number, number, number, number];

export interface Provider {
  /** The provider's required notice, verbatim. */
  notice: string;
  /** The licence or terms the data is used under. */
  licence: string;
  licenceUrl: string;
  /** Where the provider's terms need its notice in the map file itself: the plain text the file
   *  carries, and the region the provider covers. The mosaic's sources are regional, so a map whose
   *  place lies in the region may draw on it, and one outside cannot. The boxes err wide. */
  inFile?: { text: string; region: readonly Box[] };
}

export const PROVIDERS: readonly Provider[] = [
  {
    notice: "ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and funded under National Science Foundation awards 1043681, 1559691, and 1542736",
    licence: "PGC acknowledgement policy",
    licenceUrl: "https://www.pgc.umn.edu/guides/user-services/acknowledgement-policy/",
  },
  {
    notice: "Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
  },
  {
    notice: "Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
  },
  {
    notice: "Canada terrain data contains information licensed under the Open Government Licence – Canada",
    licence: "Open Government Licence – Canada",
    licenceUrl: "https://open.canada.ca/en/open-government-licence-canada",
  },
  {
    notice: "Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers",
    licence: "Copernicus data policy",
    licenceUrl: "https://land.copernicus.eu/en/data-policy",
  },
  {
    notice: "Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration",
    licence: "Public domain",
    licenceUrl: "https://www.ncei.noaa.gov/products/etopo-global-relief-model",
  },
  {
    notice: "Mexico terrain data source: INEGI, Continental relief, 2016",
    licence: "INEGI terms of free use",
    licenceUrl: "https://www.inegi.org.mx/inegi/terminos.html",
  },
  {
    notice: "New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government (All rights reserved)",
    licence: "CC BY 3.0 NZ",
    licenceUrl: "https://creativecommons.org/licenses/by/3.0/nz/",
    // CC BY 3.0 NZ asks for a reference to the licence on every copy of an adaptation
    inFile: {
      text: "New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government (All rights reserved), licensed under CC BY 3.0 NZ, https://creativecommons.org/licenses/by/3.0/nz/",
      region: [[-47.5, -34, 166, 179]],
    },
  },
  {
    notice: "Norway terrain data © Kartverket",
    licence: "Kartverket's terms (CC BY 4.0)",
    licenceUrl: "https://www.kartverket.no/api-og-data/vilkar-for-bruk",
    // Kartverket's name must be shown wherever its data is used. "(c)" stands for "©" until the
    // game's handling of other characters is checked.
    inFile: {
      text: "Norway terrain data (c) Kartverket",
      region: [
        [57.8, 65, 4.3, 13.2],
        [65, 71.4, 10.9, 31.3],
        [70.8, 81, -9.5, 34],
      ],
    },
  },
  {
    notice: "United Kingdom terrain data © Environment Agency copyright and/or database right 2015. All rights reserved",
    licence: "Open Government Licence v3.0",
    licenceUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
  },
  {
    notice: "United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey",
    licence: "Public domain",
    licenceUrl: "https://www.usgs.gov/information-policies-and-instructions/crediting-usgs",
  },
];

/** Every provider's notice, verbatim. */
export const PROVIDER_NOTICES: readonly string[] = PROVIDERS.map((p) => p.notice);

const inBox = (lat: number, lon: number, [s, n, w, e]: Box) => lat >= s && lat <= n && lon >= w && lon <= e;

/** The notices a map file carries itself: those of the providers whose region holds its place. */
export function fileNotices(lat: number, lon: number): string[] {
  return PROVIDERS.flatMap((p) => (p.inFile && p.inFile.region.some((b) => inBox(lat, lon, b)) ? [p.inFile.text] : []));
}
