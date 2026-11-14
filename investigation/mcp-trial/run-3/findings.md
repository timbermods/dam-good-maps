# MCP trial 3 (against e64fa962e)

A fresh agent, the same three asks, no source. Its hand-back, verbatim:

> Ask 1 fulfilled 2 vs 2. Ask 2 fulfilled with a real problem, 7 core calls vs 6 plus 12 diagnosing and restoring: Near
> Mount Fuji, crater at (104,16), undo, redo, check passes, but the edit drained the big central lake. Ask 3 fulfilled
> 14 vs 4: start moved to X84 Y44, needed a strength-8 WaterSource at (88,43) before check passed; saved; save's result
> gave the website steps.

What it found, and the cause of each (fix/mcp-trial-3):

1. Any edit on a real place drains its lakes. Core: a place's stored water is not what its sources keep. Opened, the
   map shows its file's own water; the first edit settles the whole map from its water model, the same result as that
   model settled with no edit. The page opens a place through the same core call and session, so it does the same.
   Reproduction: `placeWater.ts` here (Near Mount Fuji 2852 → 2371 wet tiles, Near Aso caldera 1327 → 968, Near
   Glencoe 1901 → 1920). The MCP now says it in apply's first note, with the numbers.
2. The start refused at (86,44) "under water" though that tile was dry, then landed at (83,43). MCP: the start's
   3×3 round (86,44) held water; and the MCP named an opened map's start by its object's corner, not its middle (the
   tile a move takes). The start is now its middle everywhere, and the words state the 3×3.
3. Craterize at (104,16) raised 336 tiles and lowered none. The ground there is level 1, the floor no force cuts below:
   no bowl can form. Core gives no word on it; the MCP adds a note.
4. The same craterize twice changed different land. MCP: its default seed came from the history's sequence number. The
   page starts a force at its row's seed (each verb's default); the MCP now does the same.
5. "Cyan outlines: lakes" with none drawn, and no features on a place. MCP: the legend now lists only what the picture
   shows; describe says an opened map has no generator's features.
6. Words: what clean water counts for the start (0.3 deep, under 5% badwater, fed or lasting, within 2 levels below a
   walked tile); a placed WaterSource's default strength (1, up to 8); every edit settles the whole map's water (a
   note when wet tiles drop by more than 10%); generate counts its lakes. The share link did carry Lakes: a theme's
   default (some on River Valley) is left out of the link and comes back as the default.
