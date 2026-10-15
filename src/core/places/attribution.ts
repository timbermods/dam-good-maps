// The credits every real place carries (ROADMAP "Real places", PLAN §20 D136), on the gallery page
// and in each map's in-game description. They follow investigation/landscapes/ATTRIBUTION.md: the
// source, what was changed, that the providers do not endorse the maps, and the providers'
// required notices, verbatim (tilezen/joerd docs/attribution.md, "Required attribution").

/** Where the heights come from. */
export const ELEVATION_SOURCE = "Terrain Tiles, on the Registry of Open Data on AWS";
export const ELEVATION_SOURCE_URL = "https://registry.opendata.aws/terrain-tiles/";

/** What was changed to make a playable map (ATTRIBUTION.md, "Changes"), in plain words. */
export const CHANGES =
  "The heights were resampled, cropped and fitted to 16 levels. Water sources, trees, bushes and ruins were added, and the water settled.";

export const NOT_ENDORSED = "The data providers do not endorse these maps.";

/** The providers' required notices, verbatim. The source is a regional mosaic, so every notice
 *  applies to every map. */
export const PROVIDER_NOTICES: readonly string[] = [
  "ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and funded under National Science Foundation awards 1043681, 1559691, and 1542736",
  "Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017",
  "Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich",
  "Canada terrain data contains information licensed under the Open Government Licence – Canada",
  "Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers",
  "Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration",
  "Mexico terrain data source: INEGI, Continental relief, 2016",
  "New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government (All rights reserved)",
  "Norway terrain data © Kartverket",
  "United Kingdom terrain data © Environment Agency copyright and/or database right 2015. All rights reserved",
  "United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey",
];
