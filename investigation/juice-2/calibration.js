// Real OfflineAudioContext renders: 48 kHz, default size/strength, close camera,
// strongest 400 ms stereo RMS. Everyday actions target -23 dBFS; forces -16.5;
// undo -25; optional ambience -29. This is an RMS proxy, not LUFS mastering.
// Reproduce with checks.html > Calculate recipe trims. Retains transient shape.
export const TRIM = Object.freeze({
  raise: .7621, lower: 1.122, flatten: .9419, smooth: .4726,
  naturalize: .7006, remove: 1.6032, tree: 1.6237, berry: 2.5177,
  ruin: 2.7958, mine: 1.0593, start: .7286, water: .7186,
  badwater: .4539, carve: .8443, craterize: .6273, quake: 1.0363,
  slide: .7006, erupt: .6383, undo: 2.5032, waterfall: .5741, stream: .9343,
});
