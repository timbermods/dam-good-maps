# The game's ambient probe (Timberborn 1.1.2.8)

Read from the running game by DGM Probe 0.3.3 (`investigation/probe/mod/src/LightReader.cs`, read only), in run
`20261109-2110-smoke` (the M8 preview, one game day from hour 4, `--keep-mods`, no other mod loaded): every game hour
and at each moment, `RenderSettings.ambientProbe`, the ambient's mode, intensity and colours, URP's shader globals and
the sun. Numbers only; the run's result stays in `C:\dgm-probe\results\20261109-2110-smoke\m8-preview.json`.

## What the engine holds

- Colour space `Gamma`; `ambientMode` `Trilight`; `ambientIntensity` 1.2 (the scene's), which the probe does not carry
  (below); `defaultReflectionMode` `Custom`; `reflectionIntensity` 1 at every hour.
- Three colour sets through the day, each with one probe (27 records, no probe differs between records of the same
  colours). `SphericalHarmonicsL2` per channel, its 9 coefficients in Unity's order; only 0 (constant), 1 (y), 6 and 8
  (the zonal L2 term about y, in the ratio 1 : 3) are non-zero:

| stage (hour) | sky / equator / ground (as set, display values) | r | g | b |
|---|---|---|---|---|
| day (4.00) | 0.6239606, 0.6307573, 0.9734455 / 1, 1, 1 / 0.2831488, 0.2269659, 0.3712378 | 0.7354006, 0.0767676, 0, 0, 0, 0, 0.0413436, 0, 0.1240309 | 0.7329618, 0.085323, 0, 0, 0, 0, 0.0417247, 0, 0.1251741 | 0.8423744, 0.2250965, 0, 0, 0, 0, 0.0246289, 0, 0.0738869 |
| sunset (17.03) | 0.6509434, 0.12589, 0.3709472 / 1, 0.4677838, 0.3813261 / 1, 0.6724433, 0.2788943 | 0.8968796, -0.1683947, 0, 0, 0, 0, 0.0161125, 0, 0.0483376 | 0.1943271, -0.107566, 0, 0, 0, 0, -0.001391, 0, -0.0041731 | 0.1095414, 0.0136597, 0, 0, 0, 0, 0.0016583, 0, 0.004975 |
| night (20.03) | 0.2581829, 0.4072403, 1 / 0.5394797, 0.5583406, 0.9046614 / 0.092549, 0.1058824, 0.0588235 | 0.1787995, 0.0123314, 0, 0, 0, 0, 0.0115031, 0, 0.0345094 | 0.2062055, 0.0345757, 0, 0, 0, 0, 0.0102911, 0, 0.0308732 | 0.6985749, 0.2708654, 0, 0, 0, 0, 0.015327, 0, 0.0459812 |

- `SphericalHarmonicsL2.Evaluate` by the normal's height y (−1 to 1 in quarters; every horizontal direction gives the
  y = 0 value), the day's: r 0.4933, 0.6210, 0.7177, 0.7834, 0.8181, 0.8218, 0.7945, 0.7361, 0.6468; g 0.4807, 0.6116,
  0.7112, 0.7794, 0.8164, 0.8221, 0.7965, 0.7396, 0.6514; b 0.5188, 0.6397, 0.7421, 0.8261, 0.8916, 0.9387, 0.9672,
  0.9773, 0.9690. That is the coefficients' plain polynomial, c₀ + c₁y + c₆(3z² − 1) + c₈(x² − y²) (to 1e-7): the
  stored probe is the light itself, the basis constants and the cosine's convolution already in it.
- The sun (`RenderSettings.sun`, "Sun(Clone)", soft shadows): by day colour 1, 0.9625, 0.85 × 1.1, shadow strength 1,
  45° up; at sunset 1, 0.8314, 0.5137 × 1.3, 30° up; at night 0, 0.3255, 1 × 1.2, shadow strength 0.5, 45° up. URP's
  `_MainLightColor` is colour × intensity as set (1.1, 1.05875, 0.935 by day): no conversion under Gamma.
- URP's `_GlossyEnvironmentColor` is coefficient 0 × the reflection intensity turned to display values (by day
  0.87319, 0.87191, 0.92723 = sRGB(0.7354, 0.7330, 0.8424)), so URP treats the probe as linear, as SampleSH does under
  Gamma (`LinearToSRGB` on its result). `unity_SHAr`…`unity_SHC` read as globals are zero: URP sets them per draw.

## The rule

Fitted by least squares on the nine channel-stages, exact to 1e-7: with the three colours decoded to linear values (S
sky, Q equator, G ground), the probe by the normal's height y is

  E(y) = c0 + c1 y + c2 (3y² − 1), c0 = (4Q + S + G) / 6, c1 = √6/9 (S − G), c2 = 5/96 (S + G − 2Q)

and the shader shows sRGB(max(E, 0)). `ambientIntensity` 1.2 is not in it (c0 by day is exactly (4 + S + G) / 6).

By day, in display values: up 0.825/0.827/0.986, sideways 0.915/0.915/0.951, down 0.731/0.723/0.748. The projection we
had drawn (the gradient projected with the clamped cosine's convolution) gave 0.78/0.79/0.98, 0.84/0.83/0.91 and
0.65/0.64/0.68: shade on tops 5 % darker than the game's, on walls 8–9 %, on undersides 11–12 %.

`src/render3d/palette.ts` `trilightSH` is this rule; `GAME_AMBIENT_SH` is the day's and `tools/game-day-light.ts` takes
any hour's through it.
