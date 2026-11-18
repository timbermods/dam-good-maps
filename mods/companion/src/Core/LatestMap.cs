using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using System.Text;

namespace DGMCompanion
{
    // A map file in the Maps folder, as far as the menu entry needs to know it.
    public sealed class MapCandidate
    {
        public string Path { get; set; }
        // The name the game shows: the file name without ".timber".
        public string Name { get; set; }
        public DateTime LastWriteUtc { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
        public string Description { get; set; }
    }

    // Which map is "the latest Dam Good Maps map": the newest .timber file in the Maps folder that Dam Good
    // Maps saved. The app names every file it saves "dgm-...", and puts "Made with Dam Good Maps" in the
    // description of every map it makes; either one counts, and so does a map_metadata.json key named
    // "DamGoodMaps", so a later app version can mark its files without breaking this. Whatever the name,
    // the file must have readable map metadata.
    public static class LatestMap
    {
        public const string Extension = ".timber";
        public const string MetadataEntry = "map_metadata.json";
        public const string Marker = "Dam Good Maps";
        public const string MarkerKey = "DamGoodMaps";
        public const string NamePrefix = "dgm-";

        public static bool IsDamGoodMapsName(string fileName)
        {
            return fileName != null && fileName.StartsWith(NamePrefix, StringComparison.OrdinalIgnoreCase);
        }

        public static bool IsDamGoodMaps(Dictionary<string, object> metadata)
        {
            if (metadata == null)
            {
                return false;
            }
            if (metadata.ContainsKey(MarkerKey))
            {
                return true;
            }
            string description = MiniJson.GetString(metadata, "MapDescription");
            return description != null && description.IndexOf(Marker, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        // The map_metadata.json of a .timber file, or null when the file is not a readable zip with one.
        public static Dictionary<string, object> ReadMetadata(string timberFile)
        {
            try
            {
                using (FileStream stream = new FileStream(timberFile, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                using (ZipArchive zip = new ZipArchive(stream, ZipArchiveMode.Read))
                {
                    ZipArchiveEntry entry = zip.GetEntry(MetadataEntry);
                    if (entry == null)
                    {
                        return null;
                    }
                    using (StreamReader reader = new StreamReader(entry.Open(), new UTF8Encoding(false)))
                    {
                        return MiniJson.TryParseObject(reader.ReadToEnd(), out Dictionary<string, object> obj) ? obj : null;
                    }
                }
            }
            catch (Exception)
            {
                // an odd zip can throw more than IO errors (NotSupported, Argument, InvalidData ...)
                return null;
            }
        }

        // The newest Dam Good Maps file in the folder, looking at files newest first and stopping at the
        // first match; null when there is none.
        public static MapCandidate Find(string folder)
        {
            if (string.IsNullOrEmpty(folder) || !Directory.Exists(folder))
            {
                return null;
            }
            IEnumerable<FileInfo> files = new DirectoryInfo(folder).GetFiles("*" + Extension)
                .Where(f => string.Equals(f.Extension, Extension, StringComparison.Ordinal))
                .OrderByDescending(f => f.LastWriteTimeUtc)
                .ThenBy(f => f.Name, StringComparer.Ordinal);
            foreach (FileInfo file in files)
            {
                Dictionary<string, object> metadata = ReadMetadata(file.FullName);
                if (metadata == null || !(IsDamGoodMaps(metadata) || IsDamGoodMapsName(file.Name)))
                {
                    continue;
                }
                return Candidate(file, metadata);
            }
            return null;
        }

        private static MapCandidate Candidate(FileInfo file, Dictionary<string, object> metadata)
        {
            MiniJson.TryGetNumber(metadata, "Width", out double width);
            MiniJson.TryGetNumber(metadata, "Height", out double height);
            return new MapCandidate
            {
                Path = file.FullName,
                Name = System.IO.Path.GetFileNameWithoutExtension(file.Name),
                LastWriteUtc = file.LastWriteTimeUtc,
                Width = (int)width,
                Height = (int)height,
                Description = MiniJson.GetString(metadata, "MapDescription") ?? "",
            };
        }

        // Whether this file is a readable map from Dam Good Maps (by its name, description or marker key).
        public static bool IsDamGoodMapsFile(string path)
        {
            Dictionary<string, object> metadata = ReadMetadata(path);
            return metadata != null && (IsDamGoodMaps(metadata) || IsDamGoodMapsName(System.IO.Path.GetFileName(path)));
        }

        // The number a re-save takes: " (2)" as the app writes it now (D443, 2026-11-18), "-2" as it did before.
        private static readonly Regex ResaveSuffix = new Regex(@"^(.*)(?:-(\d+)| \((\d+)\))$", RegexOptions.CultureInvariant);

        // The app never overwrites a map: saving the same map again gives "name (2).timber", then "(3)" (D162, D443;
        // "name-2" in older saves). The family of a map file is the original name and those numbered names. A played
        // file "Lake (2)" belongs to the family of "Lake" when that file is in the folder; a played "Lake" (or a
        // "dgm-river-valley-2" seed name whose root file is not there) is its own root.
        public static string FamilyRoot(string stem, ICollection<string> stemsInFolder)
        {
            Match m = ResaveSuffix.Match(stem);
            string digits = m.Success ? (m.Groups[2].Success ? m.Groups[2].Value : m.Groups[3].Value) : null;
            if (m.Success && int.Parse(digits, CultureInfo.InvariantCulture) >= 2 && stemsInFolder.Contains(m.Groups[1].Value, StringComparer.OrdinalIgnoreCase))
            {
                return m.Groups[1].Value;
            }
            return stem;
        }

        public static bool InFamily(string stem, string root)
        {
            if (string.Equals(stem, root, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            if (stem.Length > root.Length + 1 && stem.StartsWith(root + "-", StringComparison.OrdinalIgnoreCase)
                && int.TryParse(stem.Substring(root.Length + 1), NumberStyles.None, CultureInfo.InvariantCulture, out int n) && n >= 2)
            {
                return true;
            }
            // "root (2)", "root (3)": the number inside the brackets, nothing after them
            return stem.Length > root.Length + 3 && stem.StartsWith(root + " (", StringComparison.OrdinalIgnoreCase) && stem.EndsWith(")", StringComparison.Ordinal)
                && int.TryParse(stem.Substring(root.Length + 2, stem.Length - root.Length - 3), NumberStyles.None, CultureInfo.InvariantCulture, out int k) && k >= 2;
        }

        // The newest save of the map being played: the newest readable Dam Good Maps file of its family in the
        // folder (the played file itself included); null when the family has none.
        public static MapCandidate NewestSave(string playingPath)
        {
            string folder = System.IO.Path.GetDirectoryName(playingPath);
            if (string.IsNullOrEmpty(folder) || !Directory.Exists(folder))
            {
                return null;
            }
            List<FileInfo> files = new DirectoryInfo(folder).GetFiles("*" + Extension).Where(f => string.Equals(f.Extension, Extension, StringComparison.Ordinal)).ToList();
            List<string> stems = files.Select(f => System.IO.Path.GetFileNameWithoutExtension(f.Name)).ToList();
            string root = FamilyRoot(System.IO.Path.GetFileNameWithoutExtension(playingPath), stems);
            foreach (FileInfo file in files.Where(f => InFamily(System.IO.Path.GetFileNameWithoutExtension(f.Name), root)).OrderByDescending(f => f.LastWriteTimeUtc).ThenBy(f => f.Name, StringComparer.Ordinal))
            {
                Dictionary<string, object> metadata = ReadMetadata(file.FullName);
                if (metadata != null && (IsDamGoodMaps(metadata) || IsDamGoodMapsName(file.Name)))
                {
                    return Candidate(file, metadata);
                }
            }
            return null;
        }

        // The text under the menu entry: "Name, 128 x 128".
        public static string Caption(MapCandidate map)
        {
            return map.Width > 0 && map.Height > 0 ? $"{map.Name}, {map.Width} × {map.Height}" : map.Name;
        }
    }

    // Whether a map's file changed since a game started on it (the reload key's check).
    public enum FileChange
    {
        Unchanged,
        Changed,
        Missing,
    }

    // What the reload key finds: nothing new, the file gone, or a save to offer (Target: the same file saved
    // again, or a newer file of the same map, which is how the app saves a repeat).
    public sealed class ReloadOffer
    {
        public FileChange Change { get; set; }
        public MapCandidate Target { get; set; }
    }

    public static class MapFileWatch
    {
        public static ReloadOffer Check(string playingPath, Stamp atStart)
        {
            Stamp now = Take(playingPath);
            MapCandidate newest = LatestMap.NewestSave(playingPath);
            if (newest != null && !string.Equals(newest.Path, playingPath, StringComparison.OrdinalIgnoreCase) && (!atStart.Exists || newest.LastWriteUtc > atStart.LastWriteUtc))
            {
                return new ReloadOffer { Change = FileChange.Changed, Target = newest };
            }
            FileChange change = Compare(atStart, now);
            MapCandidate target = null;
            if (change == FileChange.Changed)
            {
                target = newest ?? new MapCandidate { Path = playingPath, Name = System.IO.Path.GetFileNameWithoutExtension(playingPath), LastWriteUtc = now.LastWriteUtc };
            }
            return new ReloadOffer { Change = change, Target = target };
        }

        public struct Stamp
        {
            public bool Exists;
            public DateTime LastWriteUtc;
            public long Length;
        }

        public static Stamp Take(string path)
        {
            try
            {
                FileInfo info = new FileInfo(path);
                return info.Exists ? new Stamp { Exists = true, LastWriteUtc = info.LastWriteTimeUtc, Length = info.Length } : default(Stamp);
            }
            catch (Exception)
            {
                return default(Stamp);
            }
        }

        public static FileChange Compare(Stamp atStart, Stamp now)
        {
            if (!now.Exists)
            {
                return FileChange.Missing;
            }
            return atStart.Exists && atStart.LastWriteUtc == now.LastWriteUtc && atStart.Length == now.Length ? FileChange.Unchanged : FileChange.Changed;
        }
    }
}
