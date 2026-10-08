using System.Collections.Generic;

namespace DGMProbe
{
    // What the mod records for one map (runner/job.ts `MapResult` mirrors it).

    public class TileSample
    {
        public int X;
        public int Y;
        // Every water column on the tile, bottom up: floor, depth, contamination, overflow.
        public List<float[]> Columns = new List<float[]>();
        public float Moisture;
        public float SoilContamination;
        // On a tile with more than one terrain column (caves, overhangs): every terrain column, bottom up:
        // floor, ceiling, moisture, soil contamination. Left out on other tiles.
        public List<float[]> Runs;
    }

    public class SampleRow
    {
        public double Day;
        public int Tick;
        public string Weather;
        public List<TileSample> Tiles = new List<TileSample>();
    }

    public class PlantState
    {
        public bool Dead;
        public bool Dry;
        public bool Flooded;
        public bool Contaminated;
        public float Growth;
    }

    public class SourceState
    {
        public float Specified;
        public float Current;
        public float Contamination;
    }

    public class EntityRecord
    {
        public string Id;
        public string Template;
        public int X;
        public int Y;
        public int Z;
        public string Orientation;
        public PlantState Plant;
        public SourceState Source;
    }

    public class PlantDeath
    {
        public string Id;
        public string Template;
        public int X;
        public int Y;
        public double Day;
        public string Cause;
    }

    public class WeatherCycle
    {
        public int Cycle;
        public int TemperateDays;
        public string Hazard;
        public int HazardDays;
    }

    public class WeatherEvent
    {
        public double Day;
        public string Event;
    }

    public class StartInfo
    {
        public EntityRecord DistrictCenter;
        public int Adults;
        public int Children;
        public int Bots;
    }

    public class ShotRecord
    {
        public string MomentId;
        public string Pose;
        public string File;
        public double Day;
    }

    public class LogLine
    {
        public string RealTime;
        public string Type;
        public string Message;
        public string Stack;
    }

    public class ActionRecord
    {
        public double Day;
        public string Kind;
        public string Template;
        public int Removed;
    }

    public class MapResult
    {
        public string RunId;
        public string MapId;
        public string Title;
        public string MapFile;
        public string Status = "running";
        public string Failure;
        public string GameVersion;
        public string ModVersion;
        public string StartedAt;
        public string EndedAt;
        public double RealSeconds;
        public int Ticks;
        public double MeanSpeed;
        public List<WeatherCycle> Weather = new List<WeatherCycle>();
        public List<WeatherEvent> WeatherEvents = new List<WeatherEvent>();
        public List<string> LoadingIssues = new List<string>();
        public StartInfo Start = new StartInfo();
        public List<EntityRecord> EntitiesAtStart = new List<EntityRecord>();
        public List<EntityRecord> EntitiesAtEnd = new List<EntityRecord>();
        public List<PlantDeath> PlantDeaths = new List<PlantDeath>();
        public List<SampleRow> Samples = new List<SampleRow>();
        public List<string> Snapshots = new List<string>();
        public List<ShotRecord> Shots = new List<ShotRecord>();
        public List<LogLine> Log = new List<LogLine>();
        public List<ActionRecord> Actions = new List<ActionRecord>();
        public List<string> Notes = new List<string>();
        // Real seconds from starting the new game to the game's interface, and the game's memory then.
        public double LoadSeconds;
        public double WorkingSetAtLoadMb;
        public PerfResult Perf;
    }

    public class PerfResult
    {
        public PerfEnvironment Environment;
        public string Camera;
        public List<PerfPhaseResult> Phases = new List<PerfPhaseResult>();
    }

    public class PerfPhaseResult
    {
        public string Id;
        public float Speed;
        public float Seconds;
        public int Frames;
        public float MedianMs;
        public float P95Ms;
        public float P99Ms;
        public float MaxMs;
        public int Over50Ms;
        public int Over100Ms;
        public double Days;
        public double SpeedReached;
        public double WorkingSetMb;
    }

    public class PerfEnvironment
    {
        public string Screen;
        public int VSync;
        public int TargetFrameRate;
        public string QualityLevel;
        public string Gpu;
        public string Cpu;
        public int MemoryMb;
    }

    // A whole-map record at one moment (written gzipped beside the result).
    public class MapSnapshot
    {
        public string MomentId;
        public double Day;
        public int Tick;
        public string Weather;
        public int Width;
        public int Height;
        // Per tile, row-major from the south-west corner: the top water column's depth, contamination
        // and floor (-1 where there is no water), and the soil of the top terrain column.
        public float[] Depth;
        public float[] Contamination;
        public float[] Floor;
        public float[] Moisture;
        public float[] SoilContamination;
        // The terrain as the game holds it after its terrain physics: the top terrain column's ceiling (the
        // first air level, where objects stand) and how many terrain columns the tile has (1 without caves).
        public int[] Terrain;
        public int[] TerrainColumns;
        // Tiles with more than one water column (caves, overhangs): x, y and every column (floor, depth,
        // contamination, overflow).
        public List<LayeredTile> Layered = new List<LayeredTile>();
        // Tiles with more than one terrain column: x, y and every terrain column (floor, ceiling, moisture,
        // soil contamination), so the soil of cave floors and roofs is recorded, not only the top one's.
        public List<LayeredRuns> TerrainLayered = new List<LayeredRuns>();
        public List<EntityRecord> Plants = new List<EntityRecord>();
        public List<EntityRecord> Sources = new List<EntityRecord>();
    }

    public class LayeredTile
    {
        public int X;
        public int Y;
        public List<float[]> Columns = new List<float[]>();
    }

    public class LayeredRuns
    {
        public int X;
        public int Y;
        public List<float[]> Runs = new List<float[]>();
    }
}
