// The legend's small icons, one per kind of thing on the map (docs/UI-BRIEF.md §3). Plain shapes in
// the 3D view's colours (render3d/palette.ts); the design pass draws the final set (brief §9).

import type { JSX } from "preact";
import type { LegendKey } from "../../core/analysis/legend";

const PATHS: Record<LegendKey, JSX.Element> = {
  source: <path d="M8 2 C8 2 3.5 7.5 3.5 10 A4.5 4.5 0 0 0 12.5 10 C12.5 7.5 8 2 8 2Z" fill="#3f86c9" />,
  badSource: <path d="M8 2 C8 2 3.5 7.5 3.5 10 A4.5 4.5 0 0 0 12.5 10 C12.5 7.5 8 2 8 2Z" fill="#6f7a2c" />,
  mine: (
    <>
      <rect x="2.5" y="4" width="11" height="9" fill="none" stroke="#c46a2a" stroke-width="1.6" />
      <rect x="5" y="7" width="6" height="6" fill="#3a2e25" />
    </>
  ),
  ruin: (
    <>
      <rect x="3" y="5" width="3" height="9" fill="#8d8579" />
      <rect x="7" y="2" width="3" height="12" fill="#a39b8f" />
      <rect x="11" y="7" width="2.5" height="7" fill="#8d8579" />
    </>
  ),
  berries: (
    <>
      <circle cx="6" cy="9" r="2.5" fill="#4c63b8" />
      <circle cx="10.5" cy="10" r="2.5" fill="#5b74c9" />
      <circle cx="8.5" cy="5.5" r="2.2" fill="#3f569f" />
    </>
  ),
  trees: (
    <>
      <path d="M8 1.5 L13 10 H3Z" fill="#2f6b3a" />
      <rect x="7.2" y="10" width="1.6" height="4" fill="#6b4a2b" />
    </>
  ),
  deadTrees: (
    <>
      <path d="M8 14 V4 M8 7 L5 4.5 M8 9 L11 6.5" stroke="#b9b2a4" stroke-width="1.5" fill="none" />
    </>
  ),
  relic: (
    <>
      <rect x="3" y="6" width="3" height="8" fill="#9c9c94" />
      <rect x="10" y="4" width="3" height="10" fill="#9c9c94" />
      <rect x="2.5" y="3" width="11" height="2" fill="#b3b3aa" />
    </>
  ),
  geothermal: (
    <>
      <ellipse cx="8" cy="11" rx="6" ry="3" fill="#3b3430" />
      <path d="M6 10 Q7 6 6 3 M10 10 Q11 6 10 3" stroke="#e8743a" stroke-width="1.3" fill="none" />
    </>
  ),
  core: (
    <>
      <circle cx="8" cy="8" r="5" fill="#5a3f6e" />
      <circle cx="8" cy="8" r="2" fill="#e25b5b" />
    </>
  ),
  thorns: <path d="M2 13 L4.5 5 L6.5 12 L9 3 L11 12 L13.5 6 L14 13Z" fill="#4a3a2a" />,
  blockage: (
    <>
      <circle cx="6" cy="10" r="3.5" fill="#858380" />
      <circle cx="11" cy="10.5" r="3" fill="#6f6d6a" />
      <circle cx="8.5" cy="6" r="2.6" fill="#9a9894" />
    </>
  ),
  slope: <path d="M2 13 H14 V5Z" fill="#a39b8f" />,
};

export function LegendIcon({ kind }: { kind: LegendKey }) {
  return (
    <svg class="pg-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      {PATHS[kind]}
    </svg>
  );
}
