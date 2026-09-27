// The cases the investigation shows and measures: real Dam Good Maps land at 128², each with the
// gesture a player would make there. The land decides what forms; the names say what it made.
import type { CameraPose } from "./view";

export interface Case {
  id: string;
  title: string;
  map: string;
  /** What the player does, in words. */
  gesture: string;
  points: { x: number; y: number; z: number }[];
  power: number;
  size: number | null;
  seed: number;
  overview: CameraPose;
  low: CameraPose;
  lowName: string;
  /** A second low view, from inside the opening. */
  inside?: CameraPose;
}

export const CASES: Case[] = [
  {
    id: "crater-lip",
    title: "Crater rim → an overhanging lip",
    map: "crater",
    gesture: "Drag along the crater's inner wall",
    points: [
      { x: 114.5, y: 98, z: 13.5 },
      { x: 114.5, y: 103, z: 13.5 },
      { x: 114, y: 108, z: 13.5 },
    ],
    power: 72,
    size: null,
    seed: 1,
    overview: { target: [112, 11, -103], yaw: -1.45, pitch: 0.42, distance: 34 },
    low: { target: [114.5, 12, -103], yaw: -1.2, pitch: -0.15, distance: 16 },
    lowName: "Under the lip",
    inside: { target: [110, 11.5, -106], yaw: 1.9, pitch: 0.05, distance: 10, fov: 70 },
  },
  {
    id: "canyon-cave",
    title: "Cliff foot → a cave",
    map: "canyon",
    gesture: "Click the foot of the canyon wall",
    points: [{ x: 93.5, y: 71.5, z: 4.5 }],
    power: 70,
    size: null,
    seed: 1,
    overview: { target: [93.5, 6, -71], yaw: 0.35, pitch: 0.38, distance: 28 },
    low: { target: [93.5, 5.2, -72], yaw: 0.3, pitch: 0.08, distance: 8 },
    lowName: "Into the cave",
    inside: { target: [95.5, 5.6, -66], yaw: 3.1416, pitch: -0.12, distance: 9.5, fov: 70 },
  },
  {
    id: "tall-arch",
    title: "Thin ridge → an arch",
    map: "tall",
    gesture: "Drag across the thin ridge",
    points: [
      { x: 31.2, y: 85.2, z: 10.5 },
      { x: 29.3, y: 89.8, z: 10.5 },
    ],
    power: 70,
    size: 45,
    seed: 1,
    overview: { target: [30, 9, -87], yaw: 0.5, pitch: 0.35, distance: 30 },
    low: { target: [30.3, 10.5, -87.3], yaw: 0.36, pitch: 0.06, distance: 14 },
    lowName: "Through the arch",
  },
  {
    id: "tall-shore",
    title: "Waterline → a flooded cave (water approximated)",
    map: "tall",
    gesture: "Click the bank at the waterline",
    points: [{ x: 90.5, y: 16.5, z: 2.5 }],
    power: 75,
    size: 55,
    seed: 1,
    overview: { target: [91, 4, -15], yaw: 0.6, pitch: 0.85, distance: 24 },
    low: { target: [89.5, 3.4, -16.5], yaw: 1.4, pitch: 0.06, distance: 8, fov: 60 },
    lowName: "Into the flooded cave",
  },
];
