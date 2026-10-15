using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;

namespace DGMCompanion.Tests
{
    // Checks of the companion's own logic, run with `dotnet run --project mods/companion/tests`.
    // Exit code 0 when every check passes.
    public static class Program
    {
        private static int _failures;
        private static int _checks;

        public static int Main()
        {
            string root = Path.Combine(Path.GetTempPath(), "dgm-companion-tests-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(root);
            try
            {
                Json();
                Detection(root);
                Newest(root);
                Settings(root);
                Keys();
                Watch(root);
                Resaves(root);
            }
            finally
            {
                Directory.Delete(root, true);
            }
            Console.WriteLine(_failures == 0 ? $"All {_checks} checks passed." : $"{_failures} of {_checks} checks failed.");
            return _failures == 0 ? 0 : 1;
        }

        private static void Check(bool ok, string what)
        {
            _checks++;
            if (!ok)
            {
                _failures++;
                Console.WriteLine("FAIL: " + what);
            }
        }

        private static void Json()
        {
            Check(MiniJson.TryParseObject("{\"a\": \"x\\ny\", \"n\": -1.5e1, \"t\": true, \"z\": null, \"o\": {\"k\": [1, 2]}}", out var o) && MiniJson.GetString(o, "a") == "x\ny", "reads strings with escapes");
            Check(MiniJson.TryGetNumber(o, "n", out double n) && n == -15, "reads numbers");
            Check(!MiniJson.TryParseObject("{\"a\": ", out _), "a cut-off file is not an object");
            Check(!MiniJson.TryParseObject("[1]", out _), "an array is not an object");
            Check(MiniJson.TryParseObject("﻿{\"a\":\"b\"}", out var bom) && MiniJson.GetString(bom, "a") == "b", "reads past a byte-order mark");
            Check(MiniJson.Quote("a\"b\\c\u0001") == "\"a\\\"b\\\\c\\u0001\"", "quotes strings");
        }

        // A .timber is a zip; only map_metadata.json matters here.
        private static string Timber(string folder, string name, string metadataJson, DateTime writtenUtc)
        {
            string path = Path.Combine(folder, name);
            using (ZipArchive zip = ZipFile.Open(path, ZipArchiveMode.Create))
            {
                if (metadataJson != null)
                {
                    ZipArchiveEntry e = zip.CreateEntry("map_metadata.json");
                    using (StreamWriter w = new StreamWriter(e.Open(), new UTF8Encoding(false)))
                    {
                        w.Write(metadataJson);
                    }
                }
                ZipArchiveEntry v = zip.CreateEntry("version.txt");
                using (StreamWriter w = new StreamWriter(v.Open()))
                {
                    w.Write("1.1.2.4-52e959e-sw\r\n");
                }
            }
            File.SetLastWriteTimeUtc(path, writtenUtc);
            return path;
        }

        private static string Meta(string description, int size = 128, string extra = "")
        {
            return "{\"Width\":" + size + ",\"Height\":" + size + ",\"MapNameLocKey\":\"\",\"MapDescriptionLocKey\":\"\",\"MapDescription\":" + MiniJson.Quote(description) + ",\"IsRecommended\":false,\"IsUnconventional\":false,\"IsDev\":false" + extra + "}";
        }

        private static void Detection(string root)
        {
            Check(LatestMap.IsDamGoodMaps(Parse(Meta("Rolling hills, 128×128. Made with Dam Good Maps 0.8.0, seed 7."))), "a generated map's description is recognised");
            Check(LatestMap.IsDamGoodMaps(Parse(Meta("Made with Dam Good Maps from public elevation data."))), "a real place's description is recognised");
            Check(LatestMap.IsDamGoodMaps(Parse(Meta("Kyler's own words.", 96, ",\"DamGoodMaps\":\"0.9.0\""))), "the marker key is recognised");
            Check(!LatestMap.IsDamGoodMaps(Parse(Meta("A map from the Steam Workshop."))), "another map is not recognised");
            Check(!LatestMap.IsDamGoodMaps(null), "no metadata is not recognised");
            Check(LatestMap.IsDamGoodMapsName("dgm-river-valley-4.timber") && LatestMap.IsDamGoodMapsName("DGM-Real Place (2).timber") && !LatestMap.IsDamGoodMapsName("Valley.timber"), "the app's file names are recognised");
        }

        private static Dictionary<string, object> Parse(string json)
        {
            MiniJson.TryParseObject(json, out var o);
            return o;
        }

        private static void Newest(string root)
        {
            string folder = Path.Combine(root, "maps");
            Directory.CreateDirectory(folder);
            Check(LatestMap.Find(folder) == null, "an empty folder has no latest map");
            Check(LatestMap.Find(Path.Combine(root, "nowhere")) == null, "a missing folder has no latest map");

            DateTime t = new DateTime(2026, 10, 14, 12, 0, 0, DateTimeKind.Utc);
            Timber(folder, "Old Hills.timber", Meta("Made with Dam Good Maps 0.8.0, seed 1."), t.AddDays(-3));
            Timber(folder, "River Bend.timber", Meta("Made with Dam Good Maps 0.8.0, seed 2.", 192), t.AddDays(-1));
            Check(LatestMap.Find(folder)?.Name == "River Bend", "the newest Dam Good Maps file wins");
            Check(LatestMap.Find(folder)?.Width == 192, "its size is read from the metadata");
            Check(LatestMap.Caption(LatestMap.Find(folder)) == "River Bend, 192 × 192", "the caption has the name and size");

            Timber(folder, "dgm-renamed-by-hand-words.timber", Meta("Words the player wrote."), t.AddDays(-2));
            Check(LatestMap.Find(folder)?.Name == "River Bend", "a dgm- file with other words is older here, so it does not win");
            Timber(folder, "Workshop Map.timber", Meta("Somebody else's map."), t);
            Check(LatestMap.Find(folder)?.Name == "River Bend", "a newer map from elsewhere is skipped");

            Timber(folder, "DGM-Edited Words.timber", Meta("The player rewrote the description."), t.AddDays(-2));
            Check(LatestMap.Find(folder)?.Name == "River Bend", "still older, still River Bend");
            Timber(folder, "dgm-newest-edited.timber", Meta("The player rewrote the description."), t.AddHours(4));
            Check(LatestMap.Find(folder)?.Name == "dgm-newest-edited", "a dgm- file counts by its name when its description was rewritten");
            File.Delete(Path.Combine(folder, "dgm-newest-edited.timber"));
            File.WriteAllText(Path.Combine(folder, "Broken.timber"), "not a zip");
            File.SetLastWriteTimeUtc(Path.Combine(folder, "Broken.timber"), t.AddHours(1));
            Timber(folder, "No Metadata.timber", null, t.AddHours(2));
            Timber(folder, "Bad Metadata.timber", "{\"MapDescription\": ", t.AddHours(3));
            Check(LatestMap.Find(folder)?.Name == "River Bend", "broken files are skipped without an error");

            File.WriteAllText(Path.Combine(folder, "dgm-broken-zip.timber"), "not a zip");
            File.SetLastWriteTimeUtc(Path.Combine(folder, "dgm-broken-zip.timber"), t.AddHours(4));
            Check(LatestMap.Find(folder)?.Name == "River Bend", "a dgm- file that is not a readable map is skipped");
            File.WriteAllText(Path.Combine(folder, "Notes.txt"), "Made with Dam Good Maps");
            File.SetLastWriteTimeUtc(Path.Combine(folder, "Notes.txt"), t.AddDays(1));
            Timber(folder, "Upper.TIMBER", Meta("Made with Dam Good Maps 0.8.0, seed 3."), t.AddDays(2));
            Check(LatestMap.Find(folder)?.Name == "River Bend", "only the lower-case .timber extension counts, as in the game");

            Timber(folder, "Fresh Valley.timber", Meta("Made with Dam Good Maps 0.8.0, seed 4."), t.AddHours(5));
            Check(LatestMap.Find(folder)?.Name == "Fresh Valley", "a map saved later becomes the latest");
            // The same time on two files: the choice is the same every time.
            Timber(folder, "Fresh Valley 2.timber", Meta("Made with Dam Good Maps 0.8.0, seed 5."), t.AddHours(5));
            string first = LatestMap.Find(folder)?.Name;
            Check(first != null && first == LatestMap.Find(folder)?.Name, "a tie is broken the same way every time");

            // A file the app is still writing (open for writing) is still read.
            string busy = Timber(folder, "Busy.timber", Meta("Made with Dam Good Maps 0.8.0, seed 6."), t.AddDays(5));
            using (new FileStream(busy, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                Check(LatestMap.Find(folder)?.Name == "Busy", "a file open elsewhere is still read");
            }
        }

        private static void Settings(string root)
        {
            string file = Path.Combine(root, "home", "settings.json");
            Check(CompanionSettings.Load(file).Faction == null, "no settings file reads as defaults");
            CompanionSettings s = new CompanionSettings { Faction = "IronTeeth", Mode = "Hard" };
            Check(s.TrySave(file) && File.Exists(file) && !File.Exists(file + ".tmp"), "settings save, leaving no temporary file");
            CompanionSettings back = CompanionSettings.Load(file);
            Check(back.Faction == "IronTeeth" && back.Mode == "Hard" && back.ReloadKey == CompanionSettings.DefaultReloadKey, "settings read back");
            back.Mode = null;
            back.CustomMode = new Dictionary<string, double> { ["StartingAdults"] = 12, ["DroughtDuration.Min"] = 3.5 };
            back.TrySave(file);
            CompanionSettings custom = CompanionSettings.Load(file);
            Check(custom.Mode == null && custom.CustomMode != null && custom.CustomMode["StartingAdults"] == 12 && custom.CustomMode["DroughtDuration.Min"] == 3.5, "a custom difficulty reads back");
            File.WriteAllText(file, "{ broken");
            Check(CompanionSettings.Load(file).Faction == null, "a damaged file reads as defaults");
            File.WriteAllText(file, "{\"faction\": \"Folktails\", \"reloadKey\": \"Banana+\"}");
            CompanionSettings bad = CompanionSettings.Load(file);
            Check(bad.Faction == "Folktails" && bad.ReloadKey == CompanionSettings.DefaultReloadKey, "a bad reload key falls back to the default");
            File.WriteAllText(file, "{\"faction\": \"Folktails\", \"mode\": \"Easy\", \"customMode\": {\"StartingAdults\": 4}}");
            Check(CompanionSettings.Load(file).CustomMode == null, "a named difficulty wins over a custom one");
            Check(!new CompanionSettings().TrySave(Path.Combine(file, "inside-a-file", "s.json")), "an unwritable place is reported, not thrown");
            File.WriteAllText(file, "{ \"faction\": \"Folktails\", oops");
            CompanionSettings hand = CompanionSettings.Load(file);
            Check(hand.Damaged && hand.Faction == null, "a hand edit with a JSON error loads as defaults, marked damaged");
            hand.Faction = "IronTeeth";
            Check(!hand.TrySave(file) && File.ReadAllText(file).Contains("oops"), "a damaged file is never overwritten");
            File.WriteAllText(file, "");
            Check(!CompanionSettings.Load(file).Damaged, "an empty file is not damaged");
        }

        private static void Resaves(string root)
        {
            string folder = Path.Combine(root, "resaves");
            Directory.CreateDirectory(folder);
            DateTime t = new DateTime(2026, 10, 14, 12, 0, 0, DateTimeKind.Utc);
            string one = Timber(folder, "dgm-river-valley-7.timber", Meta("Made with Dam Good Maps 0.8.0, seed 7."), t.AddHours(-5));
            Timber(folder, "dgm-river-valley-8.timber", Meta("Made with Dam Good Maps 0.8.0, seed 8."), t.AddHours(1));
            var start = MapFileWatch.Take(one);

            var offer = MapFileWatch.Check(one, start);
            Check(offer.Change == FileChange.Unchanged && offer.Target == null, "a map with no re-save is unchanged (another seed's newer file is not its re-save)");

            // The app saves the same map again as a new file, "-2".
            string two = Timber(folder, "dgm-river-valley-7-2.timber", Meta("Made with Dam Good Maps 0.8.0, seed 7."), t);
            offer = MapFileWatch.Check(one, start);
            Check(offer.Change == FileChange.Changed && offer.Target?.Name == "dgm-river-valley-7-2", "a re-save as a new file (-2) is offered");
            Check(offer.Target?.Path == two, "the offer carries the new file's path");

            // Playing the -2 file: nothing newer, then a -3.
            var startTwo = MapFileWatch.Take(two);
            Check(MapFileWatch.Check(two, startTwo).Change == FileChange.Unchanged, "playing the newest save is unchanged (the older original is not offered)");
            Timber(folder, "dgm-river-valley-7-3.timber", Meta("Made with Dam Good Maps 0.8.0, seed 7."), t.AddHours(2));
            Check(MapFileWatch.Check(two, startTwo).Target?.Name == "dgm-river-valley-7-3", "playing -2, the -3 save is offered");
            Check(MapFileWatch.Check(one, start).Target?.Name == "dgm-river-valley-7-3", "playing the original, the newest of the family is offered");

            // The family stays apart from other maps with similar names.
            Timber(folder, "dgm-river-valley-7-9x.timber", Meta("Made with Dam Good Maps 0.8.0, seed 7."), t.AddHours(9));
            Timber(folder, "dgm-river-valley-70.timber", Meta("Made with Dam Good Maps 0.8.0, seed 70."), t.AddHours(9));
            Check(MapFileWatch.Check(one, start).Target?.Name == "dgm-river-valley-7-3", "a name that only starts the same is not the same map");

            // The same file saved again in place (a copy over it) is still seen.
            string lone = Timber(folder, "dgm-lone.timber", Meta("Made with Dam Good Maps 0.8.0, seed 1."), t.AddHours(-9));
            var startLone = MapFileWatch.Take(lone);
            File.SetLastWriteTimeUtc(lone, t);
            offer = MapFileWatch.Check(lone, startLone);
            Check(offer.Change == FileChange.Changed && offer.Target?.Path == lone, "the same file saved again in place is offered");

            // Gone, with and without a re-save.
            File.Delete(lone);
            Check(MapFileWatch.Check(lone, startLone).Change == FileChange.Missing, "a deleted map with no re-save is missing");
            File.Delete(one);
            Check(MapFileWatch.Check(one, start).Target?.Name == "dgm-river-valley-7-3", "a deleted original still finds its re-save");

            // Root detection.
            Check(LatestMap.FamilyRoot("x-7-2", new[] { "x-7", "x-7-2" }) == "x-7", "x-7-2 belongs to x-7 when x-7 is there");
            Check(LatestMap.FamilyRoot("dgm-river-valley-2", new[] { "dgm-river-valley-2" }) == "dgm-river-valley-2", "a seed name whose root is absent is its own root");
            Check(LatestMap.FamilyRoot("x-7-1", new[] { "x-7", "x-7-1" }) == "x-7-1", "-1 is a seed, not a re-save");
            Check(LatestMap.IsDamGoodMapsFile(two) && !LatestMap.IsDamGoodMapsFile(Path.Combine(folder, "nowhere.timber")), "a Dam Good Maps file is recognised by path");
        }

        private static void Keys()
        {
            Check(KeyChord.TryParse("Ctrl+Shift+R", out var c) && c.Ctrl && c.Shift && !c.Alt && c.Key == "R", "parses Ctrl+Shift+R");
            Check(KeyChord.TryParse("f9", out var f) && !f.Ctrl && f.Key == "f9", "parses a bare key");
            Check(KeyChord.TryParse(" alt + r ", out var a) && a.Alt && a.Key == "R" && a.ToString() == "Alt+R", "ignores spaces and case");
            Check(!KeyChord.TryParse("Ctrl+", out _) && !KeyChord.TryParse("R+T", out _) && !KeyChord.TryParse("", out _) && !KeyChord.TryParse("Ctrl", out _), "rejects a chord with no key or two keys");
        }

        private static void Watch(string root)
        {
            string file = Path.Combine(root, "watched.timber");
            File.WriteAllText(file, "one");
            var start = MapFileWatch.Take(file);
            Check(MapFileWatch.Compare(start, MapFileWatch.Take(file)) == FileChange.Unchanged, "an untouched file is unchanged");
            File.WriteAllText(file, "two!");
            Check(MapFileWatch.Compare(start, MapFileWatch.Take(file)) == FileChange.Changed, "a re-saved file is changed");
            var again = MapFileWatch.Take(file);
            File.SetLastWriteTimeUtc(file, again.LastWriteUtc.AddMinutes(5));
            Check(MapFileWatch.Compare(again, MapFileWatch.Take(file)) == FileChange.Changed, "a newer time alone counts as changed");
            File.Delete(file);
            Check(MapFileWatch.Compare(start, MapFileWatch.Take(file)) == FileChange.Missing, "a deleted file is missing");
            Check(MapFileWatch.Compare(default(MapFileWatch.Stamp), MapFileWatch.Take(Path.Combine(root, "never.timber"))) == FileChange.Missing, "a file that never existed is missing");
        }
    }
}
