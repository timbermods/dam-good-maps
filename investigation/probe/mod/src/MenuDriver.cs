using System;
using System.IO;
using System.Linq;
using Timberborn.ApplicationLifetime;
using Timberborn.FactionSystem;
using Timberborn.GameSceneLoading;
using Timberborn.MapRepositorySystem;
using Timberborn.NewGameConfigurationSystem;
using Timberborn.SingletonSystem;
using UnityEngine;

namespace DGMProbe
{
    // In the main menu: start the next map of the job as a new game, or quit when none is left.
    public class MenuDriver : IPostLoadableSingleton, IUpdatableSingleton
    {
        private readonly GameSceneLoader _gameSceneLoader;
        private readonly GameModeSpecService _gameModeSpecService;
        private readonly FactionSpecService _factionSpecService;
        private float _readyAt = -1f;
        private bool _acted;

        public MenuDriver(GameSceneLoader gameSceneLoader, GameModeSpecService gameModeSpecService, FactionSpecService factionSpecService)
        {
            _gameSceneLoader = gameSceneLoader;
            _gameModeSpecService = gameModeSpecService;
            _factionSpecService = factionSpecService;
        }

        public void PostLoad()
        {
            Application.runInBackground = true;
            Probe.Phase = "menu";
            // A map whose game scene never reported back (it left without finishing) is recorded as failed.
            if (Probe.MapInProgress && Probe.Current != null)
            {
                FinishFailed(Probe.Current, "The game returned to the main menu before the map finished.");
            }
            _readyAt = Time.realtimeSinceStartup + 2f;
        }

        public void UpdateSingleton()
        {
            if (_acted || _readyAt < 0 || Time.realtimeSinceStartup < _readyAt)
            {
                return;
            }
            _acted = true;
            try
            {
                StartNext();
            }
            catch (Exception e)
            {
                Debug.LogWarning(Probe.Tag + "could not start the next map: " + e);
                if (Probe.Current != null && Probe.MapInProgress)
                {
                    FinishFailed(Probe.Current, "The game could not be started: " + e.Message);
                }
                // Try the one after it on the next frame.
                _acted = false;
                _readyAt = Time.realtimeSinceStartup + 1f;
            }
        }

        private void StartNext()
        {
            int next = Probe.NextMapIndex();
            if (next < 0)
            {
                Probe.Phase = "done";
                Probe.WriteText(Path.Combine(Probe.ResultsDir, "done.json"), Probe.ToJson(new { at = Probe.Now(), maps = Probe.Job.Maps.Count }));
                ProbeHost.Instance?.WriteHeartbeat();
                Probe.Log("every map is done");
                if (Probe.Job.Settings.QuitWhenDone)
                {
                    GameQuitter.Quit();
                }
                return;
            }
            Probe.MapIndex = next;
            JobMap map = Probe.Job.Maps[next];
            Probe.Current = new MapResult
            {
                RunId = Probe.Job.RunId,
                MapId = map.Id,
                Title = map.Title,
                MapFile = map.MapFile,
                GameVersion = Application.version,
                ModVersion = typeof(Probe).Assembly.GetName().Version.ToString(3),
                StartedAt = Probe.Now(),
            };
            Probe.MapInProgress = true;
            Probe.Day = 0;
            Probe.Tick = 0;
            ProbeHost.ResetLogForMap();
            Probe.Phase = "loading";
            if (!File.Exists(map.MapFile))
            {
                throw new FileNotFoundException("The map file is missing", map.MapFile);
            }
            GameModeSpec mode = ForcedMode(ModeSpec(map.Mode), map.Cycles.Count > 0 ? map.Cycles[0] : null);
            string faction = _factionSpecService.Factions.Any(f => f.Id == map.Faction) ? map.Faction : "Folktails";
            // A settlement name is required (an empty one asks the player); no save is ever written under it.
            string settlement = "DGMProbe " + Probe.SafeName(map.Id);
            Probe.Log($"starting map {next + 1}/{Probe.Job.Maps.Count}: {map.Title} ({faction}, {map.Mode})");
            Probe.LoadStartedReal = Time.realtimeSinceStartup;
            _gameSceneLoader.StartNewGame(new NewGameConfiguration(faction, MapFileReference.FromDisk(map.MapFile), mode, settlement));
        }

        private GameModeSpec ModeSpec(string mode)
        {
            string name = "GameMode." + mode;
            foreach (GameModeSpec spec in _gameModeSpecService.GetSpecsOrdered())
            {
                if (spec.Blueprint != null && spec.Blueprint.Name == name)
                {
                    return spec;
                }
            }
            return _gameModeSpecService.GetDefaultSpec();
        }

        // The difficulty's own settings (beavers, food, water), with the first cycle's weather fixed: the game
        // draws each duration from a range whose ends are equal, and picks the hazard with a chance of 0 or 1.
        public static GameModeSpec ForcedMode(GameModeSpec spec, Cycle cycle)
        {
            if (cycle == null)
            {
                return spec;
            }
            bool badtide = cycle.Hazard == "badtide" && cycle.HazardDays > 0;
            int drought = !badtide ? cycle.HazardDays : 0;
            int bad = badtide ? cycle.HazardDays : 0;
            return spec with
            {
                TemperateWeatherDuration = new MinMaxSpec<int> { Min = cycle.TemperateDays, Max = cycle.TemperateDays },
                DroughtDuration = new MinMaxSpec<int> { Min = drought, Max = drought },
                DroughtDurationHandicapMultiplier = 1f,
                DroughtDurationHandicapCycles = 0,
                BadtideDuration = new MinMaxSpec<int> { Min = bad, Max = bad },
                BadtideDurationHandicapMultiplier = 1f,
                BadtideDurationHandicapCycles = 0,
                CyclesBeforeRandomizingBadtide = 0,
                ChanceForBadtide = badtide ? 1f : 0f,
            };
        }

        private static void FinishFailed(MapResult r, string why)
        {
            ProbeHost.FlushLog(r);
            r.Status = "failed";
            r.Failure = why;
            r.EndedAt = Probe.Now();
            Probe.WriteText(Probe.ResultPath(r.MapId), Probe.ToJson(r));
            Probe.MapInProgress = false;
        }
    }
}
