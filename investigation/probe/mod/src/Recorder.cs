using System;
using System.Collections.Generic;
using Timberborn.BaseComponentSystem;
using Timberborn.BlockSystem;
using Timberborn.EntitySystem;
using Timberborn.Growing;
using Timberborn.MapIndexSystem;
using Timberborn.MapStateSystem;
using Timberborn.NaturalResourcesLifecycle;
using Timberborn.SoilContaminationSystem;
using Timberborn.SoilMoistureSystem;
using Timberborn.TemplateSystem;
using Timberborn.TerrainSystem;
using Timberborn.WaterObjects;
using Timberborn.WaterSourceSystem;
using Timberborn.WaterSystem;
using UnityEngine;

namespace DGMProbe
{
    // Reads what the game's simulation holds: water columns, soil, plants, sources and every map object.
    // Everything comes from the game's own thread-safe snapshots and components; nothing is changed.
    public class Recorder
    {
        private readonly IThreadSafeWaterMap _water;
        private readonly IThreadSafeColumnTerrainMap _terrain;
        private readonly MapIndexService _index;
        private readonly MapSize _mapSize;
        private readonly ISoilMoistureService _moisture;
        private readonly ISoilContaminationService _soilContamination;
        private readonly EntityRegistry _entities;
        private readonly EntityComponentRegistry _components;

        // Plants still alive at the last check, for death times.
        private readonly List<LivingNaturalResource> _living = new List<LivingNaturalResource>();

        public Recorder(IThreadSafeWaterMap water, IThreadSafeColumnTerrainMap terrain, MapIndexService index, MapSize mapSize,
            ISoilMoistureService moisture, ISoilContaminationService soilContamination, EntityRegistry entities, EntityComponentRegistry components)
        {
            _water = water;
            _terrain = terrain;
            _index = index;
            _mapSize = mapSize;
            _moisture = moisture;
            _soilContamination = soilContamination;
            _entities = entities;
            _components = components;
        }

        public int Width => _mapSize.TerrainSize.x;
        public int Height => _mapSize.TerrainSize.y;

        private bool Inside(int x, int y) => x >= 0 && y >= 0 && x < Width && y < Height;

        // Every water column of a tile, bottom up: floor, depth, contamination and overflow (a full cave's
        // pressure, 0 in the open).
        public List<float[]> WaterColumns(int x, int y)
        {
            List<float[]> columns = new List<float[]>();
            if (!Inside(x, y))
            {
                return columns;
            }
            int i2 = _index.CellToIndex(new Vector2Int(x, y));
            int n = _water.ColumnCount(i2);
            for (int c = 0; c < n; c++)
            {
                int i3 = i2 + c * _index.VerticalStride;
                ReadOnlyWaterColumn col = _water.WaterColumns[i3];
                columns.Add(new[] { (float)col.Floor, col.WaterDepth, col.Contamination, col.Overflow });
            }
            return columns;
        }

        // The soil of the tile's top terrain column (the ground a plant on the surface stands on).
        private int TopTerrainIndex(int x, int y)
        {
            int i2 = _index.CellToIndex(new Vector2Int(x, y));
            int n = _terrain.GetColumnCount(i2);
            return n > 0 ? i2 + (n - 1) * _index.VerticalStride : -1;
        }

        public float Moisture(int x, int y)
        {
            int i = Inside(x, y) ? TopTerrainIndex(x, y) : -1;
            return i >= 0 ? _moisture.SoilMoisture(i) : 0f;
        }

        public float SoilContamination(int x, int y)
        {
            int i = Inside(x, y) ? TopTerrainIndex(x, y) : -1;
            return i >= 0 ? _soilContamination.Contamination(i) : 0f;
        }

        // Every terrain column of a tile, bottom up: floor, ceiling (its top, where plants stand), and the soil
        // moisture and contamination the game keeps for it.
        public List<float[]> TerrainRuns(int x, int y)
        {
            List<float[]> runs = new List<float[]>();
            if (!Inside(x, y))
            {
                return runs;
            }
            int i2 = _index.CellToIndex(new Vector2Int(x, y));
            int n = _terrain.GetColumnCount(i2);
            for (int c = 0; c < n; c++)
            {
                int i3 = i2 + c * _index.VerticalStride;
                runs.Add(new[] { (float)_terrain.GetColumnFloor(i3), _terrain.GetColumnCeiling(i3), _moisture.SoilMoisture(i3), _soilContamination.Contamination(i3) });
            }
            return runs;
        }

        public TileSample Sample(int x, int y)
        {
            TileSample s = new TileSample { X = x, Y = y, Columns = WaterColumns(x, y), Moisture = Moisture(x, y), SoilContamination = SoilContamination(x, y) };
            if (Inside(x, y) && _terrain.GetColumnCount(_index.CellToIndex(new Vector2Int(x, y))) > 1)
            {
                s.Runs = TerrainRuns(x, y);
            }
            return s;
        }

        public MapSnapshot Snapshot(string momentId, double day, int tick, string weather)
        {
            int w = Width, h = Height, n = w * h;
            MapSnapshot s = new MapSnapshot
            {
                MomentId = momentId, Day = day, Tick = tick, Weather = weather, Width = w, Height = h,
                Depth = new float[n], Contamination = new float[n], Floor = new float[n], Moisture = new float[n], SoilContamination = new float[n],
                Terrain = new int[n], TerrainColumns = new int[n],
            };
            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    int t = y * w + x;
                    List<float[]> cols = WaterColumns(x, y);
                    s.Floor[t] = -1;
                    // The top column holding water is the one a player sees from above.
                    for (int c = cols.Count - 1; c >= 0; c--)
                    {
                        if (cols[c][1] > 0f)
                        {
                            s.Floor[t] = cols[c][0];
                            s.Depth[t] = cols[c][1];
                            s.Contamination[t] = cols[c][2];
                            break;
                        }
                    }
                    if (cols.Count > 1)
                    {
                        s.Layered.Add(new LayeredTile { X = x, Y = y, Columns = cols });
                    }
                    s.Moisture[t] = Moisture(x, y);
                    s.SoilContamination[t] = SoilContamination(x, y);
                    int i2 = _index.CellToIndex(new Vector2Int(x, y));
                    int tc = _terrain.GetColumnCount(i2);
                    s.TerrainColumns[t] = tc;
                    s.Terrain[t] = tc > 0 ? _terrain.GetColumnCeiling(i2 + (tc - 1) * _index.VerticalStride) : 0;
                    if (tc > 1)
                    {
                        s.TerrainLayered.Add(new LayeredRuns { X = x, Y = y, Runs = TerrainRuns(x, y) });
                    }
                }
            }
            foreach (EntityRecord e in Entities())
            {
                if (e.Plant != null)
                {
                    s.Plants.Add(e);
                }
                else if (e.Source != null)
                {
                    s.Sources.Add(e);
                }
            }
            return s;
        }

        public static string TemplateOf(BaseComponent c)
        {
            TemplateSpec spec = c.GetComponent<TemplateSpec>();
            return spec != null ? spec.TemplateName : c.Name;
        }

        public EntityRecord Record(EntityComponent entity)
        {
            BlockObject block = entity.GetComponent<BlockObject>();
            EntityRecord r = new EntityRecord { Id = entity.EntityId.ToString(), Template = TemplateOf(entity) };
            if (block != null)
            {
                Vector3Int c = block.Coordinates;
                r.X = c.x;
                r.Y = c.y;
                r.Z = c.z;
                r.Orientation = block.Orientation.ToString();
            }
            LivingNaturalResource living = entity.GetComponent<LivingNaturalResource>();
            if (living != null)
            {
                DryObject dry = entity.GetComponent<DryObject>();
                ContaminatedObject bad = entity.GetComponent<ContaminatedObject>();
                WaterObject wet = entity.GetComponent<WaterObject>();
                Growable growable = entity.GetComponent<Growable>();
                r.Plant = new PlantState
                {
                    Dead = living.IsDead,
                    Dry = dry != null && dry.IsDry,
                    Contaminated = bad != null && bad.IsContaminated,
                    Flooded = wet != null && wet.WaterAboveBase > 0,
                    Growth = growable != null ? growable.GrowthProgress : 1f,
                };
            }
            WaterSource source = entity.GetComponent<WaterSource>();
            if (source != null)
            {
                r.Source = new SourceState { Specified = source.SpecifiedStrength, Current = source.CurrentStrength, Contamination = source.Contamination };
            }
            return r;
        }

        // Every entity that stands on the map (block objects), plants and sources with their state.
        public List<EntityRecord> Entities()
        {
            List<EntityRecord> list = new List<EntityRecord>();
            foreach (EntityComponent entity in _entities.Entities)
            {
                if (entity == null || entity.GetComponent<BlockObject>() == null)
                {
                    continue;
                }
                try
                {
                    list.Add(Record(entity));
                }
                catch (Exception e)
                {
                    list.Add(new EntityRecord { Id = entity.EntityId.ToString(), Template = "?" + e.GetType().Name });
                }
            }
            return list;
        }

        public void StartWatchingPlants()
        {
            _living.Clear();
            foreach (EntityComponent entity in _entities.Entities)
            {
                LivingNaturalResource living = entity != null ? entity.GetComponent<LivingNaturalResource>() : null;
                if (living != null && !living.IsDead)
                {
                    _living.Add(living);
                }
            }
        }

        // Plants that died since the last call, with what their soil and water were when they were found dead.
        public List<PlantDeath> NewDeaths(double day)
        {
            List<PlantDeath> deaths = null;
            for (int i = _living.Count - 1; i >= 0; i--)
            {
                LivingNaturalResource living = _living[i];
                if (living == null || !living.IsDead)
                {
                    continue;
                }
                _living.RemoveAt(i);
                EntityComponent entity = living.GetComponent<EntityComponent>();
                EntityRecord r = entity != null ? Record(entity) : null;
                deaths ??= new List<PlantDeath>();
                deaths.Add(new PlantDeath
                {
                    Id = r?.Id,
                    Template = r?.Template ?? TemplateOf(living),
                    X = r?.X ?? 0,
                    Y = r?.Y ?? 0,
                    Day = day,
                    Cause = r?.Plant == null ? "unknown" : r.Plant.Flooded ? "flooded" : r.Plant.Contaminated ? "contaminated soil" : r.Plant.Dry ? "dry soil" : "moist soil",
                });
            }
            return deaths;
        }

        // Deletes every entity of a template (on the given tiles, or anywhere), as a finished demolition would.
        public int Delete(EntityService entityService, string template, List<int[]> tiles)
        {
            HashSet<long> wanted = null;
            if (tiles != null && tiles.Count > 0)
            {
                wanted = new HashSet<long>();
                foreach (int[] t in tiles)
                {
                    wanted.Add(((long)t[0] << 32) | (uint)t[1]);
                }
            }
            List<EntityComponent> doomed = new List<EntityComponent>();
            foreach (EntityComponent entity in _entities.Entities)
            {
                if (entity == null || TemplateOf(entity) != template)
                {
                    continue;
                }
                BlockObject block = entity.GetComponent<BlockObject>();
                if (wanted != null && (block == null || !wanted.Contains(((long)block.Coordinates.x << 32) | (uint)block.Coordinates.y)))
                {
                    continue;
                }
                doomed.Add(entity);
            }
            foreach (EntityComponent entity in doomed)
            {
                entityService.Delete(entity);
            }
            return doomed.Count;
        }
    }
}
