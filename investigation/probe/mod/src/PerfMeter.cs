using System;
using System.Collections.Generic;
using System.Linq;
using Timberborn.CameraSystem;
using Timberborn.TimeSystem;
using UnityEngine;

namespace DGMProbe
{
    // How smoothly the game runs a map (PLAN §20 D357 (9)): after the map's first day, each of the job's phases holds
    // one game speed for some real seconds while the camera pans over the whole map, and every frame's time is kept.
    // A phase reports its frames' median, 95th and 99th percentile and longest time, the frames over 50 and 100 ms,
    // and the game speed actually reached. Phases run with the player's own graphics (the probe's lower graphics are
    // put back afterwards), at the camera's own zoom and angles: only its target moves, along rows down the map's long
    // axis, so the pan crosses every part of the map once per phase.
    public class PerfMeter
    {
        private readonly CameraService _camera;
        private readonly SpeedManager _speed;
        private readonly IDayNightCycle _clock;

        private PerfSpec _spec;
        private int _width;
        private int _height;
        private List<Vector2> _path;
        private float _pathLength;
        private int _phase = -1;
        private float _phaseStart;
        private double _dayAtMeasure;
        private float _measureStart;
        private readonly List<float> _frames = new List<float>();
        private CameraState _saved;
        private PerfResult _result;

        public bool Running => _phase >= 0 && _result != null;

        public PerfMeter(CameraService camera, SpeedManager speed, IDayNightCycle clock)
        {
            _camera = camera;
            _speed = speed;
            _clock = clock;
        }

        private double Day => _clock.DayNumber + (double)_clock.DayProgress;

        public void Begin(PerfSpec spec, int width, int height, PerfResult into)
        {
            _spec = spec;
            _width = width;
            _height = height;
            _result = into;
            _saved = _camera.GetCurrentState();
            _path = PanPath(width, height, spec.RowSpacing > 0 ? spec.RowSpacing : 96f);
            _pathLength = 0f;
            for (int i = 1; i < _path.Count; i++)
            {
                _pathLength += Vector2.Distance(_path[i - 1], _path[i]);
            }
            _result.Environment = Environment();
            _result.Camera = $"zoom {_saved.ZoomLevel:0.00}, horizontal {_saved.HorizontalAngle:0}°, vertical {_saved.VerticalAngle:0}°; pan {_pathLength:0} tiles a phase";
            GraphicsDimmer.Restore();
            StartPhase(0);
        }

        // Rows along the long axis, from one end to the other and back, spaced so the view covers the whole map.
        private static List<Vector2> PanPath(int w, int h, float spacing)
        {
            bool alongY = h >= w;
            float along = alongY ? h : w, across = alongY ? w : h;
            int rows = Mathf.Max(1, Mathf.CeilToInt(across / spacing));
            List<Vector2> path = new List<Vector2>();
            for (int r = 0; r < rows; r++)
            {
                float c = across * (r + 0.5f) / rows;
                float a0 = r % 2 == 0 ? 8f : along - 8f, a1 = r % 2 == 0 ? along - 8f : 8f;
                path.Add(alongY ? new Vector2(c, a0) : new Vector2(a0, c));
                path.Add(alongY ? new Vector2(c, a1) : new Vector2(a1, c));
            }
            return path;
        }

        private Vector2 PointAt(float fraction)
        {
            float target = Mathf.Clamp01(fraction) * _pathLength;
            for (int i = 1; i < _path.Count; i++)
            {
                float seg = Vector2.Distance(_path[i - 1], _path[i]);
                if (target <= seg || i == _path.Count - 1)
                {
                    return Vector2.Lerp(_path[i - 1], _path[i], seg > 0 ? Mathf.Clamp01(target / seg) : 0f);
                }
                target -= seg;
            }
            return _path[_path.Count - 1];
        }

        private void StartPhase(int index)
        {
            _phase = index;
            PerfPhase p = _spec.Phases[index];
            _phaseStart = Time.realtimeSinceStartup;
            _measureStart = -1f;
            _frames.Clear();
            _speed.ChangeSpeed(p.Speed > 0 ? p.Speed : Probe.Job.Settings.Speed);
            Probe.Phase = "perf:" + p.Id;
            Probe.Log($"perf phase {p.Id}: speed {(p.Speed > 0 ? p.Speed : Probe.Job.Settings.Speed):0}, {p.Seconds:0} s");
        }

        // Called once a frame while running. Returns true when every phase is done (the game is then paused, the
        // camera back where it was and the probe's graphics lowered again).
        public bool Update()
        {
            PerfPhase p = _spec.Phases[_phase];
            float now = Time.realtimeSinceStartup;
            float t = now - _phaseStart;
            // the camera's target along the path: the whole path once in the phase's seconds
            Vector2 at = PointAt(t / Mathf.Max(1f, p.Seconds));
            float y = _saved.Target.y;
            _camera.RestoreState(new CameraState(new Vector3(at.x, y, at.y), _saved.ZoomLevel, _saved.HorizontalAngle, _saved.VerticalAngle));
            if (t >= p.Warmup)
            {
                if (_measureStart < 0)
                {
                    _measureStart = now;
                    _dayAtMeasure = Day;
                }
                else
                {
                    _frames.Add(Time.unscaledDeltaTime);
                }
            }
            if (t < p.Seconds)
            {
                return false;
            }
            _result.Phases.Add(Summarise(p, now));
            if (_phase + 1 < _spec.Phases.Count)
            {
                StartPhase(_phase + 1);
                return false;
            }
            _phase = -1;
            _speed.ChangeSpeed(0f);
            _camera.RestoreState(_saved);
            GraphicsDimmer.Dim();
            return true;
        }

        private PerfPhaseResult Summarise(PerfPhase p, float now)
        {
            float seconds = _measureStart > 0 ? now - _measureStart : 0f;
            List<float> ms = _frames.Select(f => f * 1000f).OrderBy(f => f).ToList();
            float Q(double q) => ms.Count == 0 ? 0f : ms[Math.Min(ms.Count - 1, (int)Math.Floor(q * ms.Count))];
            double days = Day - _dayAtMeasure;
            return new PerfPhaseResult
            {
                Id = p.Id,
                Speed = p.Speed > 0 ? p.Speed : Probe.Job.Settings.Speed,
                Seconds = seconds,
                Frames = ms.Count,
                MedianMs = Q(0.5),
                P95Ms = Q(0.95),
                P99Ms = Q(0.99),
                MaxMs = ms.Count == 0 ? 0f : ms[ms.Count - 1],
                Over50Ms = ms.Count(f => f > 50f),
                Over100Ms = ms.Count(f => f > 100f),
                Days = days,
                // game seconds a real second (1 at normal speed when the game keeps up)
                SpeedReached = seconds > 0 ? days * _clock.DayLengthInSeconds / seconds : 0,
                WorkingSetMb = System.Diagnostics.Process.GetCurrentProcess().WorkingSet64 / 1048576.0,
            };
        }

        private static PerfEnvironment Environment()
        {
            return new PerfEnvironment
            {
                Screen = $"{Screen.width}×{Screen.height}",
                VSync = QualitySettings.vSyncCount,
                TargetFrameRate = Application.targetFrameRate,
                QualityLevel = QualitySettings.names.Length > QualitySettings.GetQualityLevel() ? QualitySettings.names[QualitySettings.GetQualityLevel()] : QualitySettings.GetQualityLevel().ToString(),
                Gpu = SystemInfo.graphicsDeviceName,
                Cpu = $"{SystemInfo.processorType} ({SystemInfo.processorCount} threads)",
                MemoryMb = SystemInfo.systemMemorySize,
            };
        }
    }
}
