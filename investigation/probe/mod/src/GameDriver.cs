using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Timberborn.Autosaving;
using Timberborn.Beavers;
using Timberborn.Bots;
using Timberborn.Characters;
using Timberborn.EntitySystem;
using Timberborn.ErrorReporting;
using Timberborn.GameDistricts;
using Timberborn.MainMenuSceneLoading;
using Timberborn.SingletonSystem;
using Timberborn.TickSystem;
using Timberborn.TimeSystem;
using Timberborn.UILayoutSystem;
using UnityEngine;

namespace DGMProbe
{
    // One map, from the moment the game shows its interface to the end day: fast time, the job's weather,
    // records at the job's moments, screenshots, then back to the main menu. Records are taken inside the
    // game's tick, so a moment is caught at the first tick on or after its time whatever the speed.
    public class GameDriver : ILoadableSingleton, ITickableSingleton, IUpdatableSingleton, IUnloadableSingleton
    {
        private const float SlowSpeed = 7f;
        private const double SlowDownAhead = 0.15;

        private readonly EventBus _eventBus;
        private readonly Autosaver _autosaver;
        private readonly SpeedManager _speedManager;
        private readonly IDayNightCycle _clock;
        private readonly ILoadingIssueService _loadingIssues;
        private readonly EntityComponentRegistry _components;
        private readonly EntityRegistry _entities;
        private readonly EntityService _entityService;
        private readonly MainMenuSceneLoader _mainMenu;
        private readonly Recorder _recorder;
        private readonly WeatherForcer _weather;
        private readonly ShotTaker _shots;
        private readonly PanelCloser _panels;
        private readonly PerfMeter _perf;

        private JobMap _map;
        private MapResult _result;
        private bool _ready;
        private bool _finishing;
        private bool _finished;
        private float _startReal;
        private float _runStartReal;
        private int _ticks;
        private double _nextSample;
        private readonly HashSet<string> _momentsDone = new HashSet<string>();
        private readonly HashSet<int> _actionsDone = new HashSet<int>();
        private readonly Queue<Moment> _pendingShots = new Queue<Moment>();
        private readonly Queue<int> _pendingActions = new Queue<int>();
        private float _speed;
        private int _slowFrames;
        private bool _slowedForShot;
        // The frame-time phases (PerfMeter): asked for in the tick, run in the frame, done once.
        private bool _perfWanted;
        private bool _perfDone;

        public GameDriver(EventBus eventBus, Autosaver autosaver, SpeedManager speedManager, IDayNightCycle clock, ILoadingIssueService loadingIssues,
            EntityComponentRegistry components, EntityRegistry entities, EntityService entityService, MainMenuSceneLoader mainMenu,
            Recorder recorder, WeatherForcer weather, ShotTaker shots, PanelCloser panels, PerfMeter perf)
        {
            _eventBus = eventBus;
            _autosaver = autosaver;
            _speedManager = speedManager;
            _clock = clock;
            _loadingIssues = loadingIssues;
            _components = components;
            _entities = entities;
            _entityService = entityService;
            _mainMenu = mainMenu;
            _recorder = recorder;
            _weather = weather;
            _shots = shots;
            _panels = panels;
            _perf = perf;
        }

        private double Day => _clock.DayNumber + (double)_clock.DayProgress;

        public void Load()
        {
            _map = Probe.CurrentMap;
            _result = Probe.Current;
            _startReal = Time.realtimeSinceStartup;
            // No save of any kind while the probe plays: neither the periodic autosave nor the exit save.
            _autosaver.Suspend();
            Application.runInBackground = true;
            Probe.Phase = "loading-game";
            _eventBus.Register(this);
        }

        public void Unload()
        {
            GraphicsDimmer.Restore();
        }

        [OnEvent]
        public void OnShowPrimaryUI(ShowPrimaryUIEvent e)
        {
            if (_map == null || _result == null || _ready)
            {
                return;
            }
            try
            {
                foreach ((LoadingIssueMessage issue, int count) in _loadingIssues.GetIssues())
                {
                    _result.LoadingIssues.Add($"{issue.MessageLocKey}{(issue.MessageParam != null ? ": " + issue.MessageParam : "")}{(count > 1 ? $" ({count})" : "")}");
                }
                RecordStart();
                _result.EntitiesAtStart = _recorder.Entities();
                _recorder.StartWatchingPlants();
                _weather.RecordFirstCycle();
            }
            catch (Exception ex)
            {
                _result.Notes.Add("start records failed: " + ex.Message);
                Debug.LogWarning(Probe.Tag + ex);
            }
            _ready = true;
            _runStartReal = Time.realtimeSinceStartup;
            _result.LoadSeconds = Probe.LoadStartedReal > 0 ? _runStartReal - Probe.LoadStartedReal : 0;
            _result.WorkingSetAtLoadMb = System.Diagnostics.Process.GetCurrentProcess().WorkingSet64 / 1048576.0;
            _nextSample = Day;
            Probe.Day = Day;
            Probe.Phase = "running";
            _speed = Probe.Job.Settings.Speed;
            GraphicsDimmer.Dim();
            Probe.Log($"map ready at day {Day:0.000}: {_result.EntitiesAtStart.Count} objects, {_result.LoadingIssues.Count} loading issues");
            // Moments at or before the start (the loaded state) are taken now.
            CheckMoments();
            if (_pendingShots.Count == 0)
            {
                _speedManager.ChangeSpeed(_speed);
            }
        }

        private void RecordStart()
        {
            DistrictCenter dc = _components.GetAll<DistrictCenter>().FirstOrDefault();
            if (dc != null)
            {
                EntityComponent entity = dc.GetComponent<EntityComponent>();
                _result.Start.DistrictCenter = entity != null ? _recorder.Record(entity) : null;
            }
            foreach (EntityComponent entity in _entities.Entities)
            {
                if (entity == null || entity.GetComponent<Character>() == null)
                {
                    continue;
                }
                if (entity.GetComponent<Bot>() != null)
                {
                    _result.Start.Bots++;
                }
                else if (entity.GetComponent<Child>() != null)
                {
                    _result.Start.Children++;
                }
                else
                {
                    _result.Start.Adults++;
                }
            }
        }

        public void Tick()
        {
            if (!_ready || _finishing)
            {
                return;
            }
            _ticks++;
            double day = Day;
            Probe.Day = day;
            Probe.Tick = _ticks;
            // While the frame times are measured nothing else is recorded (a snapshot would be a hitch of its own):
            // the moments, samples and the end wait until the phases are done.
            if (_perfWanted || _perf.Running)
            {
                return;
            }
            if (_map.Perf != null && !_perfDone && day >= _map.Perf.StartDay && _pendingShots.Count == 0 && !_shots.Busy
                && _map.Moments.All(m => _momentsDone.Contains(m.Id) || m.Day > _map.Perf.StartDay))
            {
                _perfWanted = true;
                return;
            }
            if (day >= _nextSample)
            {
                SampleRow row = new SampleRow { Day = day, Tick = _ticks, Weather = _weather.CurrentWeather() };
                foreach (int[] t in _map.Tiles)
                {
                    row.Tiles.Add(_recorder.Sample(t[0], t[1]));
                }
                _result.Samples.Add(row);
                _nextSample += Math.Max(1.0 / 96, _map.SampleHours / 24.0);
            }
            if (_ticks % 8 == 0)
            {
                List<PlantDeath> deaths = _recorder.NewDeaths(day);
                if (deaths != null)
                {
                    _result.PlantDeaths.AddRange(deaths);
                }
            }
            for (int i = 0; i < _map.Actions.Count; i++)
            {
                if (!_actionsDone.Contains(i) && day >= _map.Actions[i].Day)
                {
                    _actionsDone.Add(i);
                    _pendingActions.Enqueue(i);
                }
            }
            CheckMoments();
            // Slow down ahead of a screenshot, so the pause lands within a few ticks of its moment.
            Moment nextShot = _map.Moments.Where(m => !_momentsDone.Contains(m.Id) && m.Shots.Count > 0).OrderBy(m => m.Day).FirstOrDefault();
            if (!_slowedForShot && nextShot != null && nextShot.Day - day < SlowDownAhead && _speed > SlowSpeed)
            {
                _slowedForShot = true;
                _speedManager.ChangeSpeed(SlowSpeed);
            }
            if (day >= _map.EndDay)
            {
                _finishing = true;
                _speedManager.ChangeSpeed(0f);
            }
        }

        private void CheckMoments()
        {
            double day = Day;
            foreach (Moment m in _map.Moments)
            {
                if (_momentsDone.Contains(m.Id) || day < m.Day)
                {
                    continue;
                }
                _momentsDone.Add(m.Id);
                if (m.Snapshot)
                {
                    try
                    {
                        string file = $"{Probe.SafeName(_map.Id)}-{Probe.SafeName(m.Id)}.snapshot.json.gz";
                        Probe.WriteGzipJson(Path.Combine(Probe.ResultsDir, file), _recorder.Snapshot(m.Id, day, _ticks, _weather.CurrentWeather()));
                        _result.Snapshots.Add(file);
                    }
                    catch (Exception e)
                    {
                        _result.Notes.Add($"snapshot {m.Id} failed: {e.Message}");
                    }
                }
                if (m.Shots.Count > 0)
                {
                    _pendingShots.Enqueue(m);
                    _speedManager.ChangeSpeed(0f);
                }
            }
        }

        public void UpdateSingleton()
        {
            if (_map == null || _result == null || _finished)
            {
                return;
            }
            float now = Time.realtimeSinceStartup;
            float timeout = _map.TimeoutSeconds > 0 ? _map.TimeoutSeconds : Probe.Job.Settings.MapTimeoutSeconds;
            if (now - _startReal > timeout)
            {
                _result.Status = "timeout";
                _result.Failure = $"The map took longer than {timeout:0} s.";
                Finish();
                return;
            }
            if (!_ready)
            {
                return;
            }
            string closed = _panels.CloseTopPausingPanel();
            if (closed != null)
            {
                _result.Notes.Add($"closed a panel that paused the game at day {Day:0.000}: {closed}");
                Probe.Log("closed " + closed);
                if (!_shots.Busy && _pendingShots.Count == 0 && !_finishing)
                {
                    _speedManager.ChangeSpeed(_slowedForShot ? SlowSpeed : _speed);
                }
            }
            while (_pendingActions.Count > 0)
            {
                ProbeAction a = _map.Actions[_pendingActions.Dequeue()];
                int removed = a.Kind == "deleteEntities" ? _recorder.Delete(_entityService, a.Template, a.Tiles) : 0;
                _result.Actions.Add(new ActionRecord { Day = Day, Kind = a.Kind, Template = a.Template, Removed = removed });
                Probe.Log($"{a.Kind} {a.Template}: {removed} removed at day {Day:0.000}");
            }
            if (_shots.Busy)
            {
                Probe.Phase = "shots";
                return;
            }
            if (_pendingShots.Count > 0)
            {
                Moment m = _pendingShots.Dequeue();
                _slowedForShot = false;
                bool more = _pendingShots.Count > 0 || _finishing;
                ProbeHost.Instance.StartCoroutine(_shots.Take(m.Id, _map.Poses, m.Shots, _result, more ? 0f : _speed));
                return;
            }
            if (_finishing)
            {
                Finish();
                return;
            }
            if (_perfWanted)
            {
                _perfWanted = false;
                _result.Perf = new PerfResult();
                Probe.Log($"frame times from day {Day:0.000}");
                _perf.Begin(_map.Perf, _recorder.Width, _recorder.Height, _result.Perf);
                return;
            }
            if (_perf.Running)
            {
                if (_perf.Update())
                {
                    _perfDone = true;
                    // (the game days the phases ran are skipped by the samples; the moments after them are taken at once)
                    _nextSample = Math.Max(_nextSample, Day);
                    _slowedForShot = false;
                    _speedManager.ChangeSpeed(_speed);
                    Probe.Log($"frame times done at day {Day:0.000}: " + string.Join("; ", _result.Perf.Phases.Select(x => $"{x.Id} median {x.MedianMs:0.0} ms, p95 {x.P95Ms:0.0} ms, speed {x.SpeedReached:0.0}")));
                }
                return;
            }
            Probe.Phase = "running";
            Probe.Speed = _speedManager.CurrentSpeed;
            // The highest stable speed: if frames get very long, step down (never below the UI's fastest).
            if (Time.unscaledDeltaTime > 2.5f && _speedManager.CurrentSpeed > SlowSpeed)
            {
                if (++_slowFrames >= 3)
                {
                    _speed = Mathf.Max(SlowSpeed, _speed * 0.6f);
                    _speedManager.ChangeSpeed(_speed);
                    _result.Notes.Add($"frames over 2.5 s: speed lowered to {_speed:0} at day {Day:0.00}");
                    _slowFrames = 0;
                }
            }
            else
            {
                _slowFrames = 0;
            }
        }

        private void Finish()
        {
            if (_finished)
            {
                return;
            }
            _finished = true;
            Probe.Phase = "finishing";
            try
            {
                _speedManager.ChangeSpeed(0f);
                _result.EntitiesAtEnd = _recorder.Entities();
                List<PlantDeath> deaths = _recorder.NewDeaths(Day);
                if (deaths != null)
                {
                    _result.PlantDeaths.AddRange(deaths);
                }
            }
            catch (Exception e)
            {
                _result.Notes.Add("end records failed: " + e.Message);
            }
            float running = Time.realtimeSinceStartup - (_ready ? _runStartReal : _startReal);
            _result.Ticks = _ticks;
            _result.RealSeconds = Time.realtimeSinceStartup - _startReal;
            _result.MeanSpeed = running > 0 ? _ticks * 0.6 / running : 0;
            if (_result.Status == "running")
            {
                _result.Status = "done";
            }
            _result.EndedAt = Probe.Now();
            ProbeHost.FlushLog(_result);
            Probe.WriteText(Probe.ResultPath(_result.MapId), Probe.ToJson(_result));
            Probe.MapInProgress = false;
            Probe.Log($"map {_result.MapId} {_result.Status}: {_ticks} ticks in {_result.RealSeconds:0} s");
            GraphicsDimmer.Restore();
            Probe.Phase = "returning";
            // Straight back to the menu, with no exit save (the autosaver is suspended as well).
            _mainMenu.OpenMainMenu();
        }
    }
}
