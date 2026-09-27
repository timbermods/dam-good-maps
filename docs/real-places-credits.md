# Real places: credits by link

Kyler, 2026-09-25: each real place's in-game description is short (its title, one line, and
"Credits: <link>"), and the full notices go on the gallery page and on a credits page. First check
that every provider accepts credit by link, and keep in the file only the notices that must be
there.

The credits page is https://timbermods.github.io/dam-good-maps/real-places/credits/ (the gallery
shows the same credits). It lists the source (Terrain Tiles on AWS), what was changed, that the
providers do not endorse the maps, and every provider's notice from the Terrain Tiles attribution
(tilezen/joerd `docs/attribution.md`; `investigation/landscapes/ATTRIBUTION.md`) verbatim, each with
a link to its licence. The code is `src/core/places/attribution.ts`; the page is
`src/places/Credits.tsx`.

Each provider's licence or terms were read on 2026-09-25, from the official pages.

| Provider | Licence or terms | Verdict | Deciding words |
|---|---|---|---|
| ArcticDEM (Polar Geospatial Center) | [PGC acknowledgement policy](https://www.pgc.umn.edu/guides/user-services/acknowledgement-policy/); the data is now CC BY 4.0 on the AWS registry, and was "unlicensed" when Terrain Tiles was made | Link | The policy asks for credit "as close to the product as possible": a request, not a licence condition. CC BY 4.0 allows a link (below). |
| Australia (Geoscience Australia) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Link | §3(a)(2): "it may be reasonable to satisfy the conditions by providing a URI or hyperlink to a resource that includes the required information." |
| Austria (data.gv.at, DGM Österreich) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): data.gv.at offers the same dataset (b5de6975…) under it today; Terrain Tiles listed CC BY 3.0 AT | Link | As Australia. Under 3.0 AT (§4.a, a licence URI "with every copy") a link is not confirmed, so the maps use the data under 4.0. No real place lies in Austria. |
| Canada (CDEM) | [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada) | Link | "Acknowledge the source … by including any attribution statement": it names no place for it. |
| Europe (EU-DEM, Copernicus) | [Copernicus data policy](https://land.copernicus.eu/en/data-policy); Regulation (EU) 1159/2013, Article 8 | Link | "Users shall inform the public of the source": no place is named. It also asks to say the data was modified, and not to suggest EU endorsement: the credits page does both. |
| ETOPO1 (NOAA) | [Public domain](https://www.ncei.noaa.gov/products/etopo-global-relief-model) | Link | Not subject to copyright in the United States. 17 U.S.C. 403 applies only to works that carry a copyright notice; the maps carry none. |
| Mexico (INEGI) | [INEGI terms of free use](https://www.inegi.org.mx/inegi/terminos.html) | Link | Credit INEGI and cite the source "where technically possible"; no place is named. It asks to tell the user about changes: the credits page does. |
| New Zealand (LINZ) | [CC BY 3.0 NZ](https://creativecommons.org/licenses/by/3.0/nz/), as Terrain Tiles listed it | **In the file**, for maps in New Zealand | "make reference to this Licence … on all copies of the Work and Adaptations." LINZ now offers its 8 m DEM under CC BY 4.0, but Terrain Tiles' layer no longer resolves, so the older terms are kept. |
| Norway (Kartverket) | [Kartverket's terms (CC BY 4.0)](https://www.kartverket.no/api-og-data/vilkar-for-bruk) | **In the file**, for maps in Norway | "Kartverkets namn skal visast i alle samanhengar der produkta … blir brukt … på følgjande måte: © Kartverket": its name, as "© Kartverket", wherever its data is used. |
| United Kingdom (Environment Agency) | [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) | Link | "acknowledge the source … by including or linking to any attribution statement". |
| United States (USGS: 3DEP, GMTED2010, SRTM) | [Public domain](https://www.usgs.gov/information-policies-and-instructions/crediting-usgs) | Link | "we ask that proper credit be given". GMTED2010 asks to describe the changes and not to imply USGS endorsement: the credits page does both. |

Kyler confirmed the two judgement calls (2026-09-25): Austria's data under CC BY 4.0, and New
Zealand's notice kept in the file.

## The water data (D271)

Since Kyler's D271 (2026-09-27: a place's water follows the real place), the conversion puts water
sources only where ESA WorldCover 10 m 2021 v200 shows permanent water (class 80), as Pick a place's
signature water does (D192, `investigation/pickplace-water2/ATTRIBUTION.md`). No WorldCover data is
in the maps themselves: it decides where the sources go, and the water is simulated on the map's
terrain. The credits page has its own "Water data" section (`src/places/Credits.tsx`,
`attribution.ts` `WATER_*`).

| Provider | Licence or terms | Verdict | Deciding words |
|---|---|---|---|
| ESA WorldCover (ESA, VITO and the WorldCover consortium) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [the provider's data access page](https://esa-worldcover.org/en/data-access) | Link | As Australia (§3(a)(2)). The provider's notice, verbatim: "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium". The credits page says how the data was used and that the provider does not endorse the maps. |

Not needed: Mapzen (only for Mapzen's hosted service; the data came from AWS), and Natural Earth
(public domain, and used only for the survey's random-land controls, which are not published).

## What each file carries

Every map: its title; "Inspired by the land near <place>, at Timberborn's scale; not a replica.";
"Credits: https://timbermods.github.io/dam-good-maps/real-places/credits/". The credits line is what
makes credit by link work for every provider, so the page stays at that address.

A map whose place lies in a region below also carries that provider's notice ("Elevation data: …").
The mosaic's sources are regional: a map inside the region may draw on the provider, one outside
cannot (the region boxes in `attribution.ts` err wide).

| Provider | Carried text | Maps now |
|---|---|---|
| Kartverket | Norway terrain data (c) Kartverket | Geirangerfjord, Geirangerfjord East, Lofoten |
| LINZ | New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government (All rights reserved), licensed under CC BY 3.0 NZ, https://creativecommons.org/licenses/by/3.0/nz/ | Waimakariri River, Waimakariri River Southwest, Milford Sound, Hooker Valley, Hooker Valley East, Mount Taranaki, Mount Taranaki North, Kawarau and Shotover |

The descriptions are plain ASCII: whether the game shows other characters is checked in a future
probe batch, asked for first (D117). Until then Kartverket's line has "(c)" where its terms ask for
"©"; once the probe shows the game displays "©", the line takes it.
