# Dam Good Maps for Claude

Ask Claude for a Timberborn map. Claude makes it with the Dam Good Maps engine, shapes it, shows you pictures of it
and saves it into Timberborn's Maps folder. The map plays in the game as it shows here.

## Install in Claude Desktop

1. Download [dam-good-maps.mcpb](https://github.com/timbermods/dam-good-maps/releases/latest/download/dam-good-maps.mcpb).
2. Double-click it. Claude Desktop opens it. Click **Install**.
3. Start a new chat and ask for a map.

Maps save to `Documents\Timberborn\Maps`. To change that: **Settings → Extensions → Dam Good Maps → Timberborn's Maps
folder**.

## Install in another app

You need [Node.js](https://nodejs.org/) 20 or later. Add this server to the app's MCP settings:

```json
{
  "mcpServers": {
    "dam-good-maps": {
      "command": "npx",
      "args": ["-y", "--package=https://github.com/timbermods/dam-good-maps/releases/latest/download/dam-good-maps-mcp.tgz", "dam-good-maps-mcp"]
    }
  }
}
```

In Claude Code:

```bash
claude mcp add dam-good-maps -- npx -y --package=https://github.com/timbermods/dam-good-maps/releases/latest/download/dam-good-maps-mcp.tgz dam-good-maps-mcp
```

## What to ask

- "Make me a river valley map with the start under a cliff, water below."
- "Make me a Lake stair map, 128 tiles."
- "Which real places have a volcano? Open one."
- "Make it harder: less flat land near the start."
- "Carve a river from the hills in the north-east down to the lake."
- "Put an eruption where the badwater is, and show me."
- "Move the start next to the river, then save it."
- "Open my map from yesterday and add a crater lake."
- "Undo that. No, put it back."

Claude tells you what the generator made and what it didn't. If a wish didn't come out, ask for another seed. Claude offers each wish only on the themes where it comes out often, and says when to stop trying.

A premise is the idea a map is built around, as on the website. A real place is a map made from real land, from the
website's **Real places**.

If you do not ask for a theme or a premise, Claude makes the map that the website makes by default: the Any theme, with
no premise.

A large map (256 tiles a side) can take a few minutes to make. Claude checks on it until it is ready.

Claude's pictures mark waterfalls in orange and outline lakes in cyan.

Claude also gives the website address of each map. A map you have not edited opens there from the link. An edited map
opens there from its saved project file.

## Play the map

Start Timberborn, choose **New game** and pick the map from the custom maps.

Each save writes two files: the map (`.timber`) and its project (`.damgoodmaps.json`). A save never replaces a file:
a second map with the same name gets `-2`. To keep editing, ask Claude to open the project, or open it on the
[Dam Good Maps website](https://timbermods.github.io/dam-good-maps/) from **File → Open…**.

Dam Good Maps is free software under the AGPL. The maps you make are yours. Timberborn is a game by Mechanistry; this
project is not affiliated with Mechanistry.
