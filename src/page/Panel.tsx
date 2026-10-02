// The side panel (UI-BRIEF §3; DESIGN.md): the map as a whole. Top to bottom: the switch, the generator's
// settings with Generate, and the map card. It collapses to a thin strip that still names the map, and
// remembers how it was left. A settings section opens as a sheet over the panel's lower part: nothing under it
// moves, and it closes back to the list of sections.

import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { GENERATOR_VERSION } from "../core/spec/mapspec";
import { PLACES_URL } from "../places/data";
import { tip } from "../ui/Tooltip";
import { Basics, SECTION_TIPS, SectionFields, SECTIONS, type Section, type SettingsProps } from "./settings";

export interface PanelProps extends SettingsProps {
  open: boolean;
  onOpen(open: boolean): void;
  /** A map is being made, and what it says meanwhile. */
  busy: boolean;
  busyWords: string;
  /** The settings differ from the shown map's (Generate's small dot, D330). */
  changed: boolean;
  onGenerate(): void;
  onSurprise(): void;
  /** The shown map: its name, its "how it plays" line, and a quiet line about it. */
  map: { name: string; premise: string; facts: string } | null;
  /** Lines above the settings: a map to go back to, what a link said. */
  notices?: ComponentChildren;
}

const Chevron = ({ d }: { d: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export function Panel(p: PanelProps) {
  const [section, setSection] = useState<Section | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const opener = useRef<Section | null>(null);
  const list = useRef<HTMLUListElement>(null);

  // the sheet takes the focus when it opens; Esc closes it, back to its line in the list
  useEffect(() => {
    if (!section) {
      const was = opener.current;
      opener.current = null;
      if (was) (list.current?.querySelector(`[data-section="${was}"]`) as HTMLElement | null)?.focus();
      return;
    }
    opener.current = section;
    (sheet.current?.querySelector("button") as HTMLElement | null)?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setSection(null);
      }
    };
    const el = sheet.current;
    el?.addEventListener("keydown", key);
    return () => el?.removeEventListener("keydown", key);
  }, [section]);

  if (!p.open) {
    return (
      <aside class="panel-strip plate" aria-label="Map">
        <button type="button" aria-expanded={false} aria-label="Open the panel" title="Open the panel" onClick={() => p.onOpen(true)}>
          <Chevron d="m10 6 6 6-6 6" />
        </button>
        {p.map ? <b>{p.map.name}</b> : null}
      </aside>
    );
  }

  return (
    <aside class="panel plate" aria-label="Map">
      <div class="panel-head">
        <span>Dam Good Maps</span>
        <button type="button" aria-expanded={true} aria-label="Collapse the panel" title="Collapse the panel" onClick={() => p.onOpen(false)}>
          <Chevron d="m14 6-6 6 6 6" />
        </button>
      </div>
      <div class="segmented panel-switch" role="tablist" aria-label="Where the map comes from">
        <button type="button" role="tab" aria-selected={true} title="Make a map from a seed and settings">
          Generate
        </button>
        <a class="segment" href={PLACES_URL} title="Maps shaped from the land of real places">
          Real places
        </a>
      </div>
      {p.notices}
      <form
        class="panel-settings"
        aria-label="Settings"
        onSubmit={(e) => {
          e.preventDefault();
          if (!p.busy) p.onGenerate();
        }}
      >
        <Basics {...p} />
        <ul class="sections" ref={list}>
          {SECTIONS.map((s) => (
            <li key={s}>
              <button type="button" data-section={s} aria-haspopup="dialog" aria-expanded={section === s} {...tip(SECTION_TIPS[s])} onClick={() => setSection(s)}>
                {s}
                <Chevron d="m10 6 6 6-6 6" />
              </button>
            </li>
          ))}
        </ul>
        <div class="generate-bar">
          <button type="submit" class="generate" disabled={p.busy} {...tip(p.changed ? "Make a new map from the changed settings" : "Make a new map", "Enter")}>
            {p.busy ? p.busyWords : "Generate"}
            {p.changed && !p.busy ? <span class="changed-dot" role="img" aria-label="settings changed" /> : null}
          </button>
          <button type="button" class="surprise" disabled={p.busy} title="Make a map of any kind" onClick={p.onSurprise}>
            Surprise me
          </button>
        </div>
      </form>
      <div class="panel-lower">
        {p.map ? (
          <section class="map-card" aria-label="This map">
            <h1>{p.map.name}</h1>
            {p.map.premise ? <p class="premise">{p.map.premise}</p> : null}
            <p class="facts">{p.map.facts}</p>
          </section>
        ) : null}
        <footer class="panel-foot">
          Generator {GENERATOR_VERSION}. Not affiliated with Mechanistry.{" "}
          <a href="https://github.com/timbermods/dam-good-maps" title="The source code, on GitHub">
            Source
          </a>{" "}
          ·{" "}
          <a href={`${import.meta.env.BASE_URL}licences/Bitter-OFL.txt`} title="The licence of Bitter, the font of the map's name">
            Font licence
          </a>
        </footer>
        {section ? (
          <div class="sheet" role="dialog" aria-label={`${section} settings`} ref={sheet}>
            <div class="sheet-head">
              <button type="button" class="sheet-back" title="Back to the list of settings" onClick={() => setSection(null)}>
                <Chevron d="m14 6-6 6 6 6" />
                {section}
              </button>
              {section === "Limits for this size" ? null : (
                <button type="button" class="linkish" title="Put every setting back to the chosen theme's own" onClick={p.onReset}>
                  Reset all to the theme's
                </button>
              )}
            </div>
            <div class="sheet-body">
              <SectionFields {...p} section={section} />
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
