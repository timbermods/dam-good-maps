// The Select row's marking modes as small icons (D323 item 6): drawn in the page's own line style.

import type { SelectMode } from "./select";

const ICON = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": true } as const;

export function ModeIcon(p: { mode: SelectMode }) {
  switch (p.mode) {
    case "rect":
      return (
        <svg {...ICON}>
          <rect x="4" y="5" width="16" height="14" stroke-dasharray="3 3" />
        </svg>
      );
    case "circle":
      return (
        <svg {...ICON}>
          <circle cx="12" cy="12" r="8" stroke-dasharray="3 3" />
        </svg>
      );
    case "free":
      return (
        <svg {...ICON}>
          <path d="M4 15c2-8 5-9 7-5s4 6 6 1 3-3 3-3" />
        </svg>
      );
    case "brush":
      return (
        <svg {...ICON}>
          <path d="M14 4l6 6-8 8H6v-6z" />
          <path d="M4 20h6" />
        </svg>
      );
    default:
      return (
        <svg {...ICON}>
          <path d="M5 19L15 9" />
          <path d="M16 3v4M14 5h4M20 10v3M18.5 11.5h3" />
        </svg>
      );
  }
}
