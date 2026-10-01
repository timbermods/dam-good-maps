import { CASES, type Case } from "./cases";

// Pin a short middle-wall gesture with real exposed side voxels, as the pointer supplies them.
export const WALL_CALIBRATION: Case = { ...CASES[0], id: "crater-wall-calibration",
  title: "Crater wall → calibrated wear", gesture: "Sweep briefly along the middle of the crater wall",
  points: [{ x: 114.5, y: 98.5, z: 13.5, nz: 0 }, { x: 115.5, y: 103.5, z: 13.5, nz: 0 },
    { x: 114.5, y: 108.5, z: 13.5, nz: 0 }], power: 30, size: null };
