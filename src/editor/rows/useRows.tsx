// The top bar's rows: the source picked, the shelf item's options and the force's rows.

import type { ComponentChildren } from "preact";
import type { EditOp } from "../../core/doc/ops";
import type { EntityInfo } from "../../worker/session";
import { newId, shortStrengthWords, sourceStrengths, sourceStrengthWords } from "../features";
import { SourceReadout, StrengthSlider, STRONGER_WORDS, strongerThanOfficial } from "../panels";
import type { ShelfOptions } from "../shelfItems";
import { powerWord } from "../forceDriver";
import { CarveRow, carveSettingsOf } from "../CarveRow";
import { craterSettingsOf, CraterizeRow, EruptRow, eruptSettingsOf, ForceAtWork, QuakeRow, quakeSettingsOf } from "../ForceRows";
import { DepositRow, GlaciateRow, RiftRow } from "../ForceRows";
import type { RiftSettings } from "../../core/forces/rift";
import type { DepositSettings } from "../../core/forces/deposit";
import type { GlaciateSettings } from "../../core/forces/glaciate/model";
import type { Verb } from "../../core/forces/op";
import { FORCES } from "../TopBar";
import type { ObjectPanel } from "../ObjectWindow";

/** An object's four turns before it is placed (R steps through them): its facing on the map. */
const TURNS: [number, string, string][] = [
  [0, "0°", "Face it the first way"],
  [1, "90°", "Turn it a quarter"],
  [2, "180°", "Turn it half way round"],
  [3, "270°", "Turn it three quarters"],
];
import { BADWATER_STRENGTHS, SOURCE_STRENGTHS, sourceRequest } from "../tools";
import { tip } from "../../ui/Tooltip";
import type { Ed } from "../ed";

export interface RowsSlice {
  pickTile: (x: number, y: number) => void;
  pickedRow: () => ObjectPanel | null;
  shelfRow: () => ObjectPanel | null;
  forceRow: () => ComponentChildren;
}

export function useRows(ed: Ed): RowsSlice {
  const {
    api, info, tool, options, setOptions, shelf, shelfOptions, setShelfOptions, feel, setPicked, picked,
    pickedObject, setPickedObject, optionsRef, enqueue, run, strengthOfEntity, liveStrength, entityIndexOf,
    groupsRef, pointedWords, removeSources, carveUi, setCarveUi, craterUi, setCraterUi, eruptUi, setEruptUi, quakeUi,
    setQuakeUi, glaciateUi, setGlaciateUi, riftUi, setRiftUi, depositUi, setDepositUi, forcer, lastUnleash, unleashPower, setUnleashPower,
    unleash, unleashAgain, unleashDown, forceAgain
  } = ed;

  /** A source clicked (D196): it is picked, with its strength and its water in the row beneath the
   *  top bar. */
  function pickTile(x: number, y: number) {
    void ed.entitiesOn(x, y).then((list) => {
      const sources = list.filter((e) => e.template === "WaterSource" || e.template === "BadwaterSource");
      setPicked(sources.length ? { x, y, list: sources } : null);
    });
  }
  /** A picked source's water (clean or bad) or strength changed. */
  function changeSource(e: EntityInfo, c: { kind?: "clean" | "bad"; strength?: number }) {
    if (!picked) return;
    const at: [number, number] = [picked.x, picked.y];
    if (c.kind) {
      // clean or bad is the source's own (D196): a new source of the other kind in its place
      const bad = c.kind === "bad";
      const cx = e.template === "BadwaterSource" ? e.x + 1 : e.x;
      const cy = e.template === "BadwaterSource" ? e.y + 1 : e.y;
      const s0 = Number((e.components.WaterSource as { SpecifiedStrength?: number } | undefined)?.SpecifiedStrength ?? 1);
      const req = sourceRequest({ ...optionsRef.current, sourceBad: bad, sourceStrength: Math.min(8, s0), badwaterStrength: s0 }, cx, cy);
      const place: EditOp = { op: "placeEntity", params: { id: newId(), template: req.template, x: req.x, y: req.y, orientation: req.orientation, ...(req.components ? { components: req.components } : {}) } };
      void run(
        () => api.applyAll([{ op: "deleteEntities", params: { entities: [e.id] } }, place], bad ? "Make a source badwater" : "Make a source clean"),
        (u) => {
          if (!u.ok) return;
          pickTile(cx, cy);
          feel("source", cx, cy);
        },
      );
      return;
    }
    if (c.strength === undefined) return;
    const v = c.strength;
    // its water answers each step, and one adjustment is one undo step; its label and row show it at once (D368 (4))
    const op: EditOp = { op: "setEntityProps", params: { id: e.id, components: { WaterSource: { SpecifiedStrength: v, CurrentStrength: v } } } };
    const name = e.template === "BadwaterSource" ? "Badwater source" : "Water source";
    liveStrength(e, v);
    void run(
      () => api.applyStep(op, `${name}: ${v} water/s`, `strength:${e.id}`),
      (u) => {
        if (u.ok) pickTile(at[0], at[1]);
      },
    ).finally(() => liveStrength(e, null));
  }
  /** A picked source's strength: the one number its label shows too (D361 (6), D368 (4)), never the record's. */
  function pickedStrength(e: EntityInfo): number {
    const k = entityIndexOf(e);
    return k >= 0 ? strengthOfEntity(k) : Number((e.components.WaterSource as { SpecifiedStrength?: number } | undefined)?.SpecifiedStrength ?? 1);
  }
  /** A picked source's strength in words, as its marker's label says it (D361, item 6). */
  function pickedWords(e: EntityInfo): string {
    const k = entityIndexOf(e);
    const s = k >= 0 ? sourceStrengths(groupsRef.current, strengthOfEntity, k) : null;
    return s ? sourceStrengthWords(s) : `${pickedStrength(e)} ${e.template === "BadwaterSource" ? "badwater" : "water"}/s`;
  }
  /** The object window's groups for a picked source or object (Layout 2, Kyler's sitting, 2026-10-03): a source's
   *  strength, its water, Unleash and its Power, Remove; an object's Delete; each with Put it down. */
  function pickedRow(): ObjectPanel | null {
    if (pickedObject && !picked) {
      const o = pickedObject;
      const name = o.template === "UndergroundRuins" ? "Mine site" : o.template.replace(/([a-z])([A-Z])/g, "$1 $2");
      return {
        label: `${name}, selected`,
        onClose: () => setPickedObject(null),
        groups: [
          {
            key: "delete",
            node: (
              <button
                type="button"
                {...tip("Delete it", "Delete")}
                onClick={() => {
                  setPickedObject(null);
                  void run(() => api.applyAll([{ op: "deleteEntities", params: { entities: [o.id] } }], `Remove ${name.toLowerCase()}`));
                }}
              >
                Delete
              </button>
            ),
          },
        ],
      };
    }
    const e = picked?.list[0];
    if (!e) return null;
    const bad = e.template === "BadwaterSource";
    const steps = bad ? BADWATER_STRENGTHS : SOURCE_STRENGTHS;
    const strength = pickedStrength(e);
    const again = info.forceAgain === "carve" && lastUnleash.current === e.id;
    return {
      label: `${bad ? "Badwater" : "Water"} source, selected`,
      onClose: () => setPicked(null),
      groups: [
        {
          key: "strength",
          label: "Strength",
          node: (
            <select aria-label="Strength" {...tip("Water a second", "Ctrl+scroll over it")} value={String(strength)} onChange={(ev) => changeSource(e, { strength: Number((ev.target as HTMLSelectElement).value) })}>
              {[...new Set([...steps, strength])]
                .sort((a, b) => a - b)
                .map((v) => (
                  <option key={v} value={String(v)}>
                    {Number(v.toFixed(2))} water/s
                  </option>
                ))}
            </select>
          ),
        },
        { key: "readout", label: "This source", node: <SourceReadout plain label="This source" words={shortStrengthWords(pickedWords(e))} /> },
        {
          key: "water",
          label: "Water",
          node: (
            <select aria-label="Water" title="Clean water or badwater" value={bad ? "bad" : "clean"} onChange={(ev) => changeSource(e, { kind: (ev.target as HTMLSelectElement).value as "clean" | "bad" })}>
              <option value="clean">Clean</option>
              <option value="bad">Badwater</option>
            </select>
          ),
        },
        {
          key: "power",
          label: "Power",
          node: (
            <label class="slider-field" title="How hard its river cuts">
              <input type="range" min={0} max={100} step={5} aria-label="Unleash power" aria-valuetext={`${unleashPower}, ${powerWord(unleashPower)}`} value={unleashPower} onInput={(ev) => setUnleashPower(Number((ev.target as HTMLInputElement).value))} />
              <output>{powerWord(unleashPower)}</output>
            </label>
          ),
        },
        {
          key: "act",
          node: (
            <>
              <button type="button" class="unleash-button" {...tip("Carve a river from it", "U")} onPointerDown={(ev) => unleashDown(ev as unknown as PointerEvent, e)} onClick={() => unleash(e)}>
                Unleash
              </button>
              <button type="button" {...tip("Remove this source", "Delete")} onClick={() => removeSources(picked!.list)}>
                Remove
              </button>
            </>
          ),
        },
        ...(again
          ? [
              {
                key: "again",
                node: (
                  <button type="button" onClick={() => unleashAgain(e)} title="Another course, same source">
                    Try another
                  </button>
                ),
              },
            ]
          : []),
      ],
    };
  }
  /** The object window's groups for the object picked in the list: its own options, if it has any, and its Turn (R)
   *  where it turns: every setting a key changes has its control. */
  function shelfRow(): ObjectPanel | null {
    const p = shelfOwn();
    if (!shelf?.turns) return p;
    const turnGroup = {
      key: "turn",
      label: "Turn",
      node: (
        <div class="segmented" role="group" aria-label="Turn">
          {TURNS.map(([k, word, title]) => (
            <button
              type="button"
              key={k}
              aria-pressed={ed.turn === k}
              {...tip(title, "R")}
              onClick={() => {
                ed.turnRef.current = k;
                ed.setTurn(k);
                const at = ed.shelfTile.current;
                if (at) ed.shelfHover(at[0], at[1]);
              }}
            >
              {word}
            </button>
          ))}
        </div>
      ),
    };
    return { label: p?.label ?? `${shelf.name} options`, groups: [...(p?.groups ?? []), turnGroup] };
  }
  /** The object's own options in its window, if it has any. */
  function shelfOwn(): ObjectPanel | null {
    if (!shelf) return null;
    if (shelf.source) {
      const bad = shelf.source === "bad";
      const steps = bad ? BADWATER_STRENGTHS : SOURCE_STRENGTHS;
      const value = bad ? options.badwaterStrength : options.sourceStrength;
      // the strength of the next one (over a placed source, Ctrl+scroll sets its own, D322)
      return {
        label: `${shelf.name} options`,
        groups: [
          {
            key: "next",
            label: "Next source",
            node: <StrengthSlider label="Next source" value={value} steps={steps} onChange={(v) => setOptions({ ...optionsRef.current, ...(bad ? { badwaterStrength: v } : { sourceStrength: v }) })} />,
          },
          ...(pointedWords ? [{ key: "pointing", label: "Pointing at", node: <SourceReadout plain label="Pointing at" words={shortStrengthWords(pointedWords)} /> }] : []),
          ...(strongerThanOfficial(value) ? [{ key: "note", node: <span class="bar-status note">{STRONGER_WORDS}</span> }] : []),
        ],
      };
    }
    if (shelf.id === "ruin")
      return {
        label: "Ruin options",
        groups: [
          {
            key: "height",
            label: "Height",
            node: (
              <select aria-label="Height" title="How tall the ruin is" value={String(shelfOptions.ruinHeight)} onChange={(ev) => setShelfOptions({ ...shelfOptions, ruinHeight: Number((ev.target as HTMLSelectElement).value) })}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((k) => (
                  <option key={k} value={String(k)}>
                    {k} {k === 1 ? "level" : "levels"}
                  </option>
                ))}
              </select>
            ),
          },
        ],
      };
    if (shelf.id === "relic")
      return {
        label: "Relic options",
        groups: [
          {
            key: "size",
            label: "Size",
            node: (
              <select aria-label="Size" title="How big the relic is" value={shelfOptions.relicSize} onChange={(ev) => setShelfOptions({ ...shelfOptions, relicSize: (ev.target as HTMLSelectElement).value as ShelfOptions["relicSize"] })}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            ),
          },
        ],
      };
    return null;
  }

  /** The options row of the force picked (Power, Size, its one choice, Try another: D289), or its
   *  status while it works. */
  function forceRow(): ComponentChildren {
    if (!tool) return null;
    const force = FORCES.find((f) => f.id === tool)!;
    const st = forcer.current?.status ?? null;
    const canAgain = info.forceAgain === tool;
    if (tool === "carve")
      return (
        <CarveRow
          force={force}
          ui={carveUi}
          onUi={(u) => {
            setCarveUi(u);
          }}
          status={st}
          canAgain={canAgain}
          onAgain={() => void forceAgain()}
          onPause={() => forcer.current?.pause(!forcer.current.status?.paused)}
          onRevert={() => forcer.current?.cancel()}
          drawn={forcer.current?.lastSettings.carve as ReturnType<typeof carveSettingsOf> | undefined ?? null}
        />
      );
    if (st) return <ForceAtWork force={force} status={st} onRevert={() => forcer.current?.cancel()} />;
    const again = () => void forceAgain();
    if (tool === "craterize") return <CraterizeRow force={force} ui={craterUi} onUi={setCraterUi} canAgain={canAgain} onAgain={again} drawn={(forcer.current?.lastSettings.craterize as ReturnType<typeof craterSettingsOf> | undefined) ?? null} />;
    if (tool === "erupt") return <EruptRow force={force} ui={eruptUi} onUi={setEruptUi} canAgain={canAgain} onAgain={again} drawn={(forcer.current?.lastSettings.erupt as ReturnType<typeof eruptSettingsOf> | undefined) ?? null} />;
    if (tool === "glaciate") return <GlaciateRow force={force} ui={glaciateUi} onUi={setGlaciateUi} canAgain={canAgain} onAgain={again} drawn={(forcer.current?.lastSettings.glaciate as GlaciateSettings | undefined) ?? null} />;
    if (tool === "rift") return <RiftRow force={force} ui={riftUi} onUi={setRiftUi} canAgain={canAgain} onAgain={again} drawn={(forcer.current?.lastSettings.rift as RiftSettings | undefined) ?? null} />;
    if (tool === "deposit") return <DepositRow force={force} ui={depositUi} onUi={setDepositUi} canAgain={canAgain} onAgain={again} drawn={(forcer.current?.lastSettings.deposit as DepositSettings | undefined) ?? null} />;
    return <QuakeRow force={force} ui={quakeUi} onUi={setQuakeUi} canAgain={canAgain} onAgain={again} drawn={(forcer.current?.lastSettings.quake as ReturnType<typeof quakeSettingsOf> | undefined) ?? null} />;
  }

  return { pickTile, pickedRow, shelfRow, forceRow };
}
