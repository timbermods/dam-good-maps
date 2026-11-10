using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.Rendering;

namespace DGMProbe
{
    // The game's light as the engine holds it (0.3.3, read only): the ambient (its mode, its colours and the ambient
    // probe the engine made of them, raw and evaluated by direction), the sun and the shader globals URP sets from
    // them. Numbers only; nothing is changed. The renderer's GAME_LIGHT takes the ambient probe from it
    // (docs/progress/3d-view.md, "The game's ambient probe, captured").
    public static class LightReader
    {
        // The directions the probe is evaluated in: the normal's height from straight down to straight up, toward +x,
        // then the four horizontal ones (a Trilight's probe depends on the height alone).
        private static readonly Vector3[] Directions = Enumerable.Range(0, 9)
            .Select(i => -1f + i * 0.25f)
            .Select(y => new Vector3(Mathf.Sqrt(Mathf.Max(0f, 1f - y * y)), y, 0f))
            .Concat(new[] { new Vector3(0f, 0f, 1f), new Vector3(-1f, 0f, 0f), new Vector3(0f, 0f, -1f) })
            .ToArray();

        private static readonly string[] Globals =
        {
            "unity_SHAr", "unity_SHAg", "unity_SHAb", "unity_SHBr", "unity_SHBg", "unity_SHBb", "unity_SHC",
            "unity_AmbientSky", "unity_AmbientEquator", "unity_AmbientGround", "_GlossyEnvironmentColor",
            "_MainLightPosition", "_MainLightColor",
        };

        public static LightRecord Read(string momentId, double day, string weather)
        {
            SphericalHarmonicsL2 sh = RenderSettings.ambientProbe;
            LightRecord r = new LightRecord
            {
                MomentId = momentId,
                Day = day,
                Hour = (day - Math.Floor(day)) * 24,
                Weather = weather,
                ColorSpace = QualitySettings.activeColorSpace.ToString(),
                AmbientMode = RenderSettings.ambientMode.ToString(),
                AmbientIntensity = RenderSettings.ambientIntensity,
                AmbientLight = Rgba(RenderSettings.ambientLight),
                AmbientSky = Rgba(RenderSettings.ambientSkyColor),
                AmbientEquator = Rgba(RenderSettings.ambientEquatorColor),
                AmbientGround = Rgba(RenderSettings.ambientGroundColor),
                ReflectionIntensity = RenderSettings.reflectionIntensity,
                DefaultReflectionMode = RenderSettings.defaultReflectionMode.ToString(),
            };
            for (int c = 0; c < 3; c++)
            {
                float[] row = new float[9];
                for (int i = 0; i < 9; i++)
                {
                    row[i] = sh[c, i];
                }
                r.AmbientProbe.Add(row);
            }
            Color[] evaluated = new Color[Directions.Length];
            sh.Evaluate(Directions, evaluated);
            for (int i = 0; i < Directions.Length; i++)
            {
                Vector3 d = Directions[i];
                r.Evaluated.Add(new[] { d.x, d.y, d.z, evaluated[i].r, evaluated[i].g, evaluated[i].b });
            }
            foreach (string name in Globals)
            {
                Vector4 v = Shader.GetGlobalVector(name);
                r.ShaderGlobals[name] = new[] { v.x, v.y, v.z, v.w };
            }
            Light sun = RenderSettings.sun;
            bool fromSettings = sun != null;
            if (sun == null)
            {
                sun = UnityEngine.Object.FindObjectsByType<Light>(FindObjectsSortMode.None)
                    .Where(l => l.type == LightType.Directional && l.isActiveAndEnabled)
                    .OrderByDescending(l => l.intensity)
                    .FirstOrDefault();
            }
            if (sun != null)
            {
                Vector3 e = sun.transform.eulerAngles;
                Vector3 f = sun.transform.forward;
                r.Sun = new SunRecord
                {
                    Name = sun.name,
                    FromRenderSettings = fromSettings,
                    Color = Rgba(sun.color),
                    Intensity = sun.intensity,
                    ShadowStrength = sun.shadowStrength,
                    Shadows = sun.shadows.ToString(),
                    Euler = new[] { e.x, e.y, e.z },
                    Forward = new[] { f.x, f.y, f.z },
                };
            }
            return r;
        }

        private static float[] Rgba(Color c) => new[] { c.r, c.g, c.b, c.a };
    }

    public class LightRecord
    {
        public string MomentId;
        public double Day;
        public double Hour;
        public string Weather;
        public string ColorSpace;
        public string AmbientMode;
        public float AmbientIntensity;
        public float[] AmbientLight;
        public float[] AmbientSky;
        public float[] AmbientEquator;
        public float[] AmbientGround;
        public float ReflectionIntensity;
        public string DefaultReflectionMode;
        // RenderSettings.ambientProbe: per channel (r, g, b) its 9 coefficients, as SphericalHarmonicsL2 indexes them.
        public List<float[]> AmbientProbe = new List<float[]>();
        // SphericalHarmonicsL2.Evaluate: direction x, y, z and the r, g, b it gives.
        public List<float[]> Evaluated = new List<float[]>();
        public Dictionary<string, float[]> ShaderGlobals = new Dictionary<string, float[]>();
        public SunRecord Sun;
    }

    public class SunRecord
    {
        public string Name;
        public bool FromRenderSettings;
        public float[] Color;
        public float Intensity;
        public float ShadowStrength;
        public string Shadows;
        public float[] Euler;
        public float[] Forward;
    }
}
