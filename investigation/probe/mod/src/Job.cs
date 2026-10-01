using System.Collections.Generic;

namespace DGMProbe
{
    // The job the runner writes (runner/job.ts mirrors these shapes; keep the two in step).
    // Game days count as the game does: day 1 starts at 00:00, a new game starts at day 1 + 4/24.

    public class Job
    {
        public int Version;
        public string RunId;
        public string CreatedAt;
        public JobSettings Settings = new JobSettings();
        public List<JobMap> Maps = new List<JobMap>();
    }

    public class JobSettings
    {
        public float Speed = 99f;
        public bool LowGraphics = true;
        public float HeartbeatSeconds = 2f;
        public float MapTimeoutSeconds = 1800f;
        public bool QuitWhenDone = true;
    }

    public class Cycle
    {
        public int TemperateDays;
        public string Hazard = "drought";
        public int HazardDays;
    }

    public class Pose
    {
        public string Id;
        // "look": our 3D view's orbit camera (view world: x east, y up, z = -north), reproduced exactly.
        // "game": the same numbers, but the game's own field of view is kept.
        // "current": the camera exactly as the game has it (the new-game view), no numbers used.
        public string Kind = "game";
        public float[] Target = new float[3];
        public float Yaw;
        public float Pitch;
        public float Distance;
        public float FovY = 40f;
        public int Width = 1280;
        public int Height = 800;
        public string LookCapture;
    }

    public class Moment
    {
        public string Id;
        public double Day;
        public bool Snapshot;
        public List<string> Shots = new List<string>();
    }

    public class ProbeAction
    {
        public double Day;
        public string Kind;
        public string Template;
        public List<int[]> Tiles;
    }

    public class JobMap
    {
        public string Id;
        public string Title;
        public string MapFile;
        public string Faction = "Folktails";
        public string Mode = "Normal";
        public List<Cycle> Cycles = new List<Cycle>();
        public double EndDay;
        // Real seconds this map may take (0: the job's default).
        public float TimeoutSeconds;
        public List<int[]> Tiles = new List<int[]>();
        public double SampleHours = 1;
        public List<Moment> Moments = new List<Moment>();
        public List<ProbeAction> Actions = new List<ProbeAction>();
        public List<Pose> Poses = new List<Pose>();
        // How smoothly the game runs the map (PerfMeter): null for most maps.
        public PerfSpec Perf;
    }

    // Frame times after the map's first day: each phase holds a game speed (0: the job's speed) for some real
    // seconds while the camera pans over the whole map; the first Warmup seconds of a phase are not counted.
    public class PerfSpec
    {
        // The game day the phases start at (the moments before it are taken first).
        public double StartDay;
        // The distance between the pan's rows, in tiles (the view's width at the game's opening zoom).
        public float RowSpacing = 96f;
        public List<PerfPhase> Phases = new List<PerfPhase>();
    }

    public class PerfPhase
    {
        public string Id;
        public float Speed;
        public float Seconds = 30f;
        public float Warmup = 3f;
    }
}
