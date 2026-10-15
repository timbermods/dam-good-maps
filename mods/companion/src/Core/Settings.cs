using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace DGMCompanion
{
    // The companion's own settings file: the faction and difficulty the last new game used, and the reload
    // key. It is a file of the mod's, never the game's settings. A missing or damaged file reads as defaults.
    public sealed class CompanionSettings
    {
        public const string DefaultReloadKey = "Ctrl+Shift+R";

        // The faction id of the last new game (null until one started).
        public string Faction { get; set; }
        // The last difficulty, when it is one of the game's own ("Normal"); otherwise null.
        public string Mode { get; set; }
        // The last difficulty when the player customised it: every number of it, by name ("StartingAdults",
        // "DroughtDuration.Min"). Null when Mode is set or nothing is remembered.
        public Dictionary<string, double> CustomMode { get; set; }
        public string ReloadKey { get; set; } = DefaultReloadKey;
        // Read the maps from here instead of Documents\Timberborn\Maps (for tests and unusual setups).
        public string MapsFolder { get; set; }

        public static CompanionSettings Parse(string json)
        {
            CompanionSettings s = new CompanionSettings();
            if (!MiniJson.TryParseObject(json, out Dictionary<string, object> obj))
            {
                return s;
            }
            s.Faction = NonEmpty(MiniJson.GetString(obj, "faction"));
            s.Mode = NonEmpty(MiniJson.GetString(obj, "mode"));
            s.MapsFolder = NonEmpty(MiniJson.GetString(obj, "mapsFolder"));
            string key = NonEmpty(MiniJson.GetString(obj, "reloadKey"));
            if (key != null && KeyChord.TryParse(key, out KeyChord _))
            {
                s.ReloadKey = key;
            }
            if (obj.TryGetValue("customMode", out object custom) && custom is Dictionary<string, object> fields && s.Mode == null)
            {
                Dictionary<string, double> numbers = new Dictionary<string, double>();
                foreach (KeyValuePair<string, object> f in fields)
                {
                    if (f.Value is double d)
                    {
                        numbers[f.Key] = d;
                    }
                }
                s.CustomMode = numbers.Count > 0 ? numbers : null;
            }
            return s;
        }

        public string ToJson()
        {
            List<string> lines = new List<string>
            {
                "  \"faction\": " + (Faction == null ? "null" : MiniJson.Quote(Faction)),
                "  \"mode\": " + (Mode == null ? "null" : MiniJson.Quote(Mode)),
            };
            if (CustomMode != null && CustomMode.Count > 0)
            {
                lines.Add("  \"customMode\": {" + string.Join(", ", CustomMode.OrderBy(p => p.Key, StringComparer.Ordinal).Select(p => MiniJson.Quote(p.Key) + ": " + MiniJson.Number(p.Value))) + "}");
            }
            lines.Add("  \"reloadKey\": " + MiniJson.Quote(ReloadKey ?? DefaultReloadKey));
            if (MapsFolder != null)
            {
                lines.Add("  \"mapsFolder\": " + MiniJson.Quote(MapsFolder));
            }
            return "{\n" + string.Join(",\n", lines) + "\n}\n";
        }

        public static CompanionSettings Load(string file)
        {
            try
            {
                return File.Exists(file) ? Parse(File.ReadAllText(file, Encoding.UTF8)) : new CompanionSettings();
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
            {
                return new CompanionSettings();
            }
        }

        // Written through a temporary file, so a reader never sees half a file. False when the folder is not
        // writable: the companion carries on without remembering.
        public bool TrySave(string file)
        {
            try
            {
                Directory.CreateDirectory(System.IO.Path.GetDirectoryName(file));
                string temp = file + ".tmp";
                File.WriteAllText(temp, ToJson(), new UTF8Encoding(false));
                if (File.Exists(file))
                {
                    File.Delete(file);
                }
                File.Move(temp, file);
                return true;
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
            {
                return false;
            }
        }

        private static string NonEmpty(string s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
    }

    // A key and the modifiers held with it, as the settings file spells them: "Ctrl+Shift+R", "F9".
    public sealed class KeyChord
    {
        public bool Ctrl { get; private set; }
        public bool Shift { get; private set; }
        public bool Alt { get; private set; }
        // The key's name as Unity's Key enum spells it ("R", "F9", "Digit1").
        public string Key { get; private set; }

        public static bool TryParse(string text, out KeyChord chord)
        {
            chord = null;
            if (string.IsNullOrWhiteSpace(text))
            {
                return false;
            }
            KeyChord c = new KeyChord();
            foreach (string raw in text.Split('+'))
            {
                string part = raw.Trim();
                if (part.Length == 0)
                {
                    return false;
                }
                switch (part.ToLowerInvariant())
                {
                    case "ctrl":
                    case "control":
                        c.Ctrl = true;
                        break;
                    case "shift":
                        c.Shift = true;
                        break;
                    case "alt":
                        c.Alt = true;
                        break;
                    default:
                        if (c.Key != null)
                        {
                            return false;
                        }
                        c.Key = part.Length == 1 && char.IsLetter(part[0]) ? part.ToUpperInvariant() : part;
                        break;
                }
            }
            if (c.Key == null)
            {
                return false;
            }
            chord = c;
            return true;
        }

        public override string ToString()
        {
            return (Ctrl ? "Ctrl+" : "") + (Shift ? "Shift+" : "") + (Alt ? "Alt+" : "") + Key;
        }
    }
}
