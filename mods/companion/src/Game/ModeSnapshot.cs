using System.Collections.Generic;
using System.Linq;
using Timberborn.NewGameConfigurationSystem;

namespace DGMCompanion
{
    // A difficulty the player customised, as plain numbers (the game's own difficulties are remembered by name).
    // Built like the game's custom difficulty panel builds it: a spec with these numbers and nothing else, so
    // it never passes for one of the game's own.
    public static class ModeSnapshot
    {
        public const string BlueprintPrefix = "GameMode.";

        // The name of one of the game's own difficulties ("Normal"), or null for a custom one.
        public static string NamedMode(GameModeSpec spec)
        {
            string name = spec?.Blueprint?.Name;
            return name != null && name.StartsWith(BlueprintPrefix) ? name.Substring(BlueprintPrefix.Length) : null;
        }

        public static GameModeSpec Named(IEnumerable<GameModeSpec> specs, string mode)
        {
            return mode == null ? null : specs.FirstOrDefault(s => s.Blueprint != null && s.Blueprint.Name == BlueprintPrefix + mode);
        }

        public static Dictionary<string, double> ToNumbers(GameModeSpec s)
        {
            Dictionary<string, double> d = new Dictionary<string, double>
            {
                ["StartingAdults"] = s.StartingAdults,
                ["StartingChildren"] = s.StartingChildren,
                ["FoodConsumption"] = s.FoodConsumption,
                ["WaterConsumption"] = s.WaterConsumption,
                ["StartingFood"] = s.StartingFood,
                ["StartingWater"] = s.StartingWater,
                ["DroughtDurationHandicapMultiplier"] = s.DroughtDurationHandicapMultiplier,
                ["DroughtDurationHandicapCycles"] = s.DroughtDurationHandicapCycles,
                ["CyclesBeforeRandomizingBadtide"] = s.CyclesBeforeRandomizingBadtide,
                ["ChanceForBadtide"] = s.ChanceForBadtide,
                ["BadtideDurationHandicapMultiplier"] = s.BadtideDurationHandicapMultiplier,
                ["BadtideDurationHandicapCycles"] = s.BadtideDurationHandicapCycles,
                ["InjuryChance"] = s.InjuryChance,
                ["DemolishableRecoveryRate"] = s.DemolishableRecoveryRate,
            };
            Put(d, "AdultAgeProgress", s.AdultAgeProgress);
            Put(d, "ChildAgeProgress", s.ChildAgeProgress);
            Put(d, "TemperateWeatherDuration", s.TemperateWeatherDuration);
            Put(d, "DroughtDuration", s.DroughtDuration);
            Put(d, "BadtideDuration", s.BadtideDuration);
            return d;
        }

        // A difficulty from the saved numbers, filling any missing one from `fallback` (the default difficulty).
        public static GameModeSpec FromNumbers(Dictionary<string, double> d, GameModeSpec fallback)
        {
            return new GameModeSpec
            {
                StartingAdults = Int(d, "StartingAdults", fallback.StartingAdults),
                StartingChildren = Int(d, "StartingChildren", fallback.StartingChildren),
                FoodConsumption = Float(d, "FoodConsumption", fallback.FoodConsumption),
                WaterConsumption = Float(d, "WaterConsumption", fallback.WaterConsumption),
                StartingFood = Int(d, "StartingFood", fallback.StartingFood),
                StartingWater = Int(d, "StartingWater", fallback.StartingWater),
                DroughtDurationHandicapMultiplier = Float(d, "DroughtDurationHandicapMultiplier", fallback.DroughtDurationHandicapMultiplier),
                DroughtDurationHandicapCycles = Int(d, "DroughtDurationHandicapCycles", fallback.DroughtDurationHandicapCycles),
                CyclesBeforeRandomizingBadtide = Int(d, "CyclesBeforeRandomizingBadtide", fallback.CyclesBeforeRandomizingBadtide),
                ChanceForBadtide = Float(d, "ChanceForBadtide", fallback.ChanceForBadtide),
                BadtideDurationHandicapMultiplier = Float(d, "BadtideDurationHandicapMultiplier", fallback.BadtideDurationHandicapMultiplier),
                BadtideDurationHandicapCycles = Int(d, "BadtideDurationHandicapCycles", fallback.BadtideDurationHandicapCycles),
                InjuryChance = Float(d, "InjuryChance", fallback.InjuryChance),
                DemolishableRecoveryRate = Float(d, "DemolishableRecoveryRate", fallback.DemolishableRecoveryRate),
                AdultAgeProgress = Range(d, "AdultAgeProgress", fallback.AdultAgeProgress),
                ChildAgeProgress = Range(d, "ChildAgeProgress", fallback.ChildAgeProgress),
                TemperateWeatherDuration = Range(d, "TemperateWeatherDuration", fallback.TemperateWeatherDuration),
                DroughtDuration = Range(d, "DroughtDuration", fallback.DroughtDuration),
                BadtideDuration = Range(d, "BadtideDuration", fallback.BadtideDuration),
            };
        }

        private static void Put(Dictionary<string, double> d, string name, MinMaxSpec<float> r)
        {
            d[name + ".Min"] = r.Min;
            d[name + ".Max"] = r.Max;
        }

        private static void Put(Dictionary<string, double> d, string name, MinMaxSpec<int> r)
        {
            d[name + ".Min"] = r.Min;
            d[name + ".Max"] = r.Max;
        }

        private static int Int(Dictionary<string, double> d, string key, int fallback) => d.TryGetValue(key, out double v) ? (int)v : fallback;

        private static float Float(Dictionary<string, double> d, string key, float fallback) => d.TryGetValue(key, out double v) ? (float)v : fallback;

        private static MinMaxSpec<float> Range(Dictionary<string, double> d, string name, MinMaxSpec<float> fallback)
        {
            return new MinMaxSpec<float> { Min = Float(d, name + ".Min", fallback.Min), Max = Float(d, name + ".Max", fallback.Max) };
        }

        private static MinMaxSpec<int> Range(Dictionary<string, double> d, string name, MinMaxSpec<int> fallback)
        {
            return new MinMaxSpec<int> { Min = Int(d, name + ".Min", fallback.Min), Max = Int(d, name + ".Max", fallback.Max) };
        }
    }
}
