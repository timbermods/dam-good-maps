// A small north arrow laid over a picture of a map, as a shared component (styles in app.css,
// "north arrow"; D176). The page draws it, not the picture, so it stays sharp and follows the
// theme: an upright "N" in a round badge, with a pointer on its rim toward north. `turns` is where
// north is: whole quarter turns clockwise from the picture's top.

const WHERE = ["up", "to the right", "down", "to the left"] as const;

const quarter = (turns: number) => (((turns % 4) + 4) % 4) as 0 | 1 | 2 | 3;

/** Where north is, in words, for a picture turned this many quarter turns. */
export function northLabel(turns: number): string {
  return `North is ${WHERE[quarter(turns)]}`;
}

export function NorthArrow({ turns }: { turns: number }) {
  const q = quarter(turns);
  return (
    <span class="north" role="img" aria-label={northLabel(q)} data-turns={q}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 0.5 L16 6 L8 6 Z" transform={`rotate(${q * 90} 12 12)`} />
        <text x="12" y="16.2" text-anchor="middle">
          N
        </text>
      </svg>
    </span>
  );
}
