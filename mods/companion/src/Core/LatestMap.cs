using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
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
            catch (Exception e) when (e is IOException || e is InvalidDataException || e is UnauthorizedAccessException)
            {
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

    public static class MapFileWatch
    {
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
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
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
