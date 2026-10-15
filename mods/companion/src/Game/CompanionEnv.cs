using System;
using System.IO;
using Timberborn.MapRepositorySystem;
using UnityEngine;

namespace DGMCompanion
{
    // Where the companion reads and writes, and whether the automatic in-game test is on. Normal play never
    // has the test argument; the test (the DGM Probe runner's companion mode, investigation/probe/runner/companion.ts) passes it with a scratch folder
    // that is not inside Documents\Timberborn.
    public static class CompanionEnv
    {
        public const string Tag = "[DGMCompanion] ";
        public const string TestArgument = "-dgmcompanionTest";

        public static bool Testing { get; private set; }
        public static string TestDir { get; private set; }

        static CompanionEnv()
        {
            try
            {
                string[] args = Environment.GetCommandLineArgs();
                int at = Array.IndexOf(args, TestArgument);
                if (at >= 0 && at + 1 < args.Length && !string.IsNullOrWhiteSpace(args[at + 1]))
                {
                    string dir = Path.GetFullPath(args[at + 1]);
                    string docs = Path.GetFullPath(DocumentsTimberborn()).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                    if ((dir.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar).StartsWith(docs, StringComparison.OrdinalIgnoreCase))
                    {
                        Log(dir + " is inside the game's own folder; the test stays off.");
                    }
                    else if (Directory.Exists(dir))
                    {
                        Testing = true;
                        TestDir = dir;
                    }
                }
            }
            catch (Exception e)
            {
                Debug.LogWarning(Tag + "could not read the launch arguments: " + e.Message);
            }
        }

        public static string DocumentsTimberborn() => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Timberborn");

        // The mod's own folder, beside the game's folders and outside Mods (a Workshop update replaces a mod's
        // folder). The test keeps it in its scratch folder.
        public static string HomeDir => Testing ? Path.Combine(TestDir, "home") : Path.Combine(DocumentsTimberborn(), "DGMCompanion");

        public static string SettingsFile => Path.Combine(HomeDir, "settings.json");

        public static CompanionSettings LoadSettings() => CompanionSettings.Load(SettingsFile);

        // Maps the game lists as the player's own: Documents\Timberborn\Maps.
        public static string MapsFolder(CompanionSettings settings)
        {
            if (Testing)
            {
                return Path.Combine(TestDir, "maps");
            }
            return settings.MapsFolder ?? MapRepository.UserMapsDirectory;
        }

        public static void Log(string message) => Debug.Log(Tag + message);

        public static void Warn(string message) => Debug.LogWarning(Tag + message);
    }
}
