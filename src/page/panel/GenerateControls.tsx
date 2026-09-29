// The Generate mode's controls (docs/UI-BRIEF.md §3, §5): the Generate button, with its small dot
// when the settings differ from the shown map's, above the generator's settings (the page passes
// them in: today's SettingsPanel). Generate runs only on the button, or Enter anywhere in these
// controls; a settings change never regenerates.

import type { ComponentChildren } from "preact";
import { generateOnEnter } from "./enter";

export interface GenerateControlsProps {
  /** The settings differ from the shown map's (`settingsDiffer`): the button shows its dot. */
  differs: boolean;
  /** A map is being made (the button stays usable: pressing it again starts over). */
  busy?: boolean;
  onGenerate(): void;
  /** The generator's settings. */
  children?: ComponentChildren;
}

export function GenerateControls(p: GenerateControlsProps) {
  return (
    <div
      class="pg-generate"
      onKeyDown={(e) => {
        if (!generateOnEnter(e)) return;
        e.preventDefault();
        p.onGenerate();
      }}
    >
      <button type="button" class="primary pg-generate-button" aria-busy={p.busy ? "true" : undefined} aria-describedby={p.differs ? "pg-generate-dot" : undefined} data-differs={p.differs ? "" : undefined} onClick={() => p.onGenerate()}>
        Generate
        {p.differs ? <span class="pg-dot" aria-hidden="true" /> : null}
      </button>
      {p.differs ? (
        <span id="pg-generate-dot" class="pg-sr">
          The settings differ from the map shown.
        </span>
      ) : null}
      {p.children}
    </div>
  );
}
