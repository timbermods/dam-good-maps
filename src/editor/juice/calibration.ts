// Each recipe's measured trim (investigation/juice-2 `calibration.js`, PR #64): real OfflineAudioContext
// renders at 48 kHz, default size and strength, close camera, strongest 400 ms stereo RMS. Everyday
// actions sit at −23 dBFS, forces at −16.5, undo at −25, the optional ambience at −29 (an RMS proxy,
// not LUFS). The trims keep each recording's attack as it is. `smooth` was re-measured the same way
// against its new recipe (D313: a softer, higher, shorter relative of Flatten's own scrape) so it
// still lands on the same −23 dBFS as every other everyday action. `naturalize` was re-measured the same
// way for its new recipe (D459: a clean dry-leaf rustle, CC0): the trim that brought it to the level the
// harness gave Raise, Flatten, Smooth and Remove with their own trims (−22.8 dBFS, seeds 3, 41 and 900
// within 0.2 dB of each other), peak 0.42 before the output graph's ceiling.
export const TRIM: Readonly<Record<string, number>> = Object.freeze({
  raise: 0.7621,
  lower: 1.122,
  flatten: 0.9419,
  smooth: 3.8415,
  naturalize: 0.8953,
  remove: 1.6032,
  tree: 1.6237,
  berry: 2.5177,
  ruin: 2.7958,
  mine: 1.0593,
  start: 0.7286,
  water: 0.7186,
  badwater: 0.4539,
  carve: 0.8443,
  craterize: 0.6273,
  quake: 1.0363,
  slide: 0.7006,
  erupt: 0.6383,
  // (Glaciate's recipe is investigation/glaciate's, whose strongest 100 ms measured -17.1 dBFS against
  // the forces' -16.5: its own level, not re-measured by the round's calibration; Kyler's listening
  // check covers it with the others)
  glaciate: 1,
  // (Rift's and Deposit's recipes are the page's, from the same bank: their own level until measured, Kyler's
  // listening check covering them with the others)
  rift: 1,
  deposit: 1,
  undo: 2.5032,
  waterfall: 0.5741,
  stream: 0.9343,
});
