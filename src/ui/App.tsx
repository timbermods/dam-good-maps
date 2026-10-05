// The page is the editor (PLAN §20 D330; DESIGN.md, "The one-page editor"): one window. A map opens in the
// editor as soon as it is made, and New map in the header opens the drawer with the generator's settings,
// Generate, the map card and Your maps. Generate always makes a new map (edits never replay onto new land, D336)
// and replaces the open one without asking: every map is kept in Your maps (D234), so its row brings it back.
// The address always holds the open map's share link (its spec, D7; a link carries no edits), so copying it
// shares the map as generated; a link opens straight into the editor, and a reload brings the open map back as
// it was left, from Your maps. Any .timber or project file, opened or dropped, and a Real places link
// (`#place=<id>`) open in the same window.

import type { ComponentType } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { proxy } from "comlink";
import { createBackground, createGeneratorWorker, readFile, saveFile, storage } from "../platform";
import { sameLand } from "../core/analysis/story";
import { cleanMapName } from "../core/doc/document";
import { openYourMaps } from "../platform/yourMaps";
import { storeProblem, type YourMapEntry } from "../core/library/yourMaps";
import { YourMapsSaver } from "../core/library/saver";
import {
  decodeSpecFragment,
  defaultSettings,
  encodeSpecFragment,
  GENERATOR_VERSION,
  makeSpec,
  mineSitesForSize,
  seedFromText,
  shareLink,
  type MapSpec,
  type Settings,
  type ThemeId,
} from "../core/spec/mapspec";
import type { GenerateResponse, GenProgress } from "../worker/api";
import type { SessionInfo, SessionOpen } from "../worker/session";
import type { EditorProps, MapPicture } from "../editor/Editor";
import { thumbnailPixels } from "../core/render/thumb";
import { discardPreparedRenderer, prepareRenderer } from "../render3d/prepared";
import type { GeneratorModel, YourMapRow } from "../editor/generator/model";
import { fetchIndex, fetchPlace, placeFromHash } from "../places/data";
import { FirstLook, progressText, stageText, type Progress } from "./FirstLook";
import { tip } from "./Tooltip";

/** The generator and the open map's worker; Cancel ends it and the open map comes back in a new one. */
let gen = createGeneratorWorker();
let generator = gen.api;
const yourMaps = openYourMaps();

declare global {
  interface Window {
    /** Test hooks (tests/e2e): generate a map from a URL fragment and return its sha256; the map
     *  on screen, its sha256 and its share link. */
    dgm?: {
      generate(fragment: string): Promise<{ sha256: string; bytes: number; passed: boolean; ms: number; ticks: number }>;
      current?(): { made: number; sha256: string; link: string; passed: boolean; checks: { id: string; ok: boolean; value?: number | string; limit?: number | string; where?: { tiles?: [number, number][] } }[] } | null;
      /** The open map is kept in Your maps as it stands now: nothing waiting to be saved, and its stored row at the
       *  map's `version` (a test waits on it before leaving the page, never on a fixed time). */
      kept?(version: number): boolean;
    };
  }
}
let shown: GenerateResponse | null = null;
/** How many maps the page has made (a test hook: waits for the next one). */
let made = 0;
/** Whether the open map is kept as it stands (the page sets it; a test hook). */
let keptNow: (version: number) => boolean = () => false;
window.dgm = {
  async generate(fragment: string) {
    const d = decodeSpecFragment(fragment);
    if (!d) throw new Error("bad fragment");
    const r = await generator.generate(d.spec);
    return { sha256: r.sha256, bytes: r.timber.length, passed: r.passed, ms: r.ms, ticks: r.facts.settle.ticks };
  },
  kept: (version: number) => keptNow(version),
  current() {
    return shown ? { made, ms: shown.ms, attempts: shown.attempts, sha256: shown.sha256, link: shareLink(location.href, shown.spec), passed: shown.passed, checks: shown.checks.map((c) => ({ id: c.id, ok: c.ok, value: c.value, limit: c.limit, ...(c.where?.tiles ? { where: { tiles: c.where.tiles } } : {}) })) } : null;
  },
};

function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

function newId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${randomSeed().toString(36)}`;
}

function initialSpec(): { spec: MapSpec; fromLink: boolean; note?: string } {
  const d = decodeSpecFragment(location.hash);
  if (d) {
    const note = d.version !== GENERATOR_VERSION ? `This link was made with generator ${d.version}; this is ${GENERATOR_VERSION}, so the map may differ.` : undefined;
    // every map is made for Normal until the core drops difficulty after M9b's release (Kyler, 2026-10-03)
    return { spec: d.spec.designedFor === "normal" ? d.spec : { ...makeSpec({ seed: d.spec.seed, size: d.spec.size, theme: d.spec.theme }), settings: defaultSettings(d.spec.theme, "normal", d.spec.size) }, fromLink: true, note: d.problems.length ? d.problems.join("; ") : note };
  }
  // Any (Surprise me) is the default (D209)
  return { spec: makeSpec({ seed: randomSeed(), theme: "any" }), fromLink: false };
}

function isProjectFile(name: string, bytes: Uint8Array): boolean {
  if (/\.timber$/i.test(name)) return false;
  if (/\.(json|gz)$/i.test(name)) return true;
  return bytes[0] === 0x1f && bytes[1] === 0x8b; // gzip, not a zip (.timber starts "PK")
}

/** The open map: its row in Your maps, and the share link it was made from (so a reload of that link brings it
 *  back with its edits rather than making it again). */
const CURRENT_KEY = "dgm.current";
function savedCurrent(): { id: string; link: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(CURRENT_KEY) ?? "null") as { id?: unknown; link?: unknown } | null;
    return v && typeof v.id === "string" ? { id: v.id, link: typeof v.link === "string" ? v.link : "" } : null;
  } catch {
    return null;
  }
}
function noteCurrent(id: string, link: string): void {
  try {
    localStorage.setItem(CURRENT_KEY, JSON.stringify({ id, link }));
  } catch {
    // (a reload then makes the link's map again; Your maps still has this one)
  }
}

/** A row of Your maps: the name and the map's dimensions. */
const rowOf = (e: YourMapEntry): YourMapRow => ({ id: e.id, name: e.name, size: e.size, thumbnail: e.thumbnail });

/** Your maps' picture of a map (D234): the core's 64px top-down thumbnail (`thumbnailPixels`), as a PNG. */
function thumbnailUrl(m: MapPicture): string | null {
  try {
    const t = thumbnailPixels(m.heights, m.W, m.H, m.water);
    const c = document.createElement("canvas");
    c.width = t.w;
    c.height = t.h;
    c.getContext("2d")!.putImageData(new ImageData(t.rgba, t.w, t.h), 0, 0);
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** Where an opened map comes from: a row of Your maps keeps its id and name; anything else is a new row. */
/** Where an open map comes from: a row of Your maps (`kept` false: a map Cancel brings back that was never kept), or a
 *  new map of a kind. */
type Origin = { entry: YourMapEntry; kept?: boolean } | { kind: YourMapEntry["kind"] };

interface Confirm {
  text: string;
  yes: string;
  onYes(): void;
  /** What the yes button's tooltip says (replacing the map, unless said otherwise). */
  yesTitle?: string;
  /** Offer to save the open map's project first (the browser isn't keeping Your maps). */
  offerProject?: boolean;
  /** Focus starts on the yes button, so Enter confirms (a delete). */
  focusYes?: boolean;
}

export function App() {
  const init = useMemo(initialSpec, []);
  const [seedText, setSeedText] = useState(String(init.spec.seed));
  /** A typed seed, or one from a share link, is kept: Generate makes that map again until the player
   *  unlocks it or clears the box (D323, item 20). Otherwise every Generate rolls a fresh seed. */
  const [seedPinned, setSeedPinned] = useState(init.fromLink);
  const [size, setSize] = useState<{ x: number; y: number }>(init.spec.size);
  /** Every map is made for Normal (Kyler, 2026-10-03: Difficulty's start rules replace "Designed for"). */
  const difficulty = "normal" as const;
  const [theme, setTheme] = useState<ThemeId>(init.spec.theme);
  const [settings, setSettings] = useState<Settings>(init.spec.settings);
  /** Another like this (D278 (1c)): the sibling shown, which joins the spec until a setting changes. */
  const [sibling, setSibling] = useState<{ variation: number; intentions: string[] } | null>(init.spec.variation ? { variation: init.spec.variation, intentions: init.spec.intentions ?? [] } : null);
  /** D329: a version of the map that meets every outcome, found in the background, for the player to take or
   *  ignore (until the candidates strip is drawn). */
  const [version, setVersion] = useState<{ response: GenerateResponse; note: string } | null>(null);
  /** A version found for its water alone, kept quietly (D333 (5)): Another like this shows it. */
  const quiet = useRef<GenerateResponse | null>(null);
  const background = useRef<ReturnType<typeof createBackground> | null>(null);
  const [busy, setBusy] = useState(false);
  /** While a new map is made: its stage and first look. */
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** What a link said (made by another generator version, or with settings it couldn't keep). */
  const [note, setNote] = useState<string | null>(init.note ?? null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [opened, setOpened] = useState<{ key: number; data: SessionOpen; keepView?: boolean } | null>(null);
  /** A map being made over the open one (Generate, Surprise me, Another like this): the modal says so, and nothing
   *  else can be clicked or started; "back" while Cancel puts the open map back; the words when it failed. */
  const [making, setMaking] = useState<"making" | "back" | { failed: string } | null>(null);
  /** The open map as it was when a new one was asked for: Cancel opens it again, its edits and history with it. */
  const back = useRef<{ entry: YourMapEntry; bytes: Uint8Array; kept: boolean } | null>(null);
  /** A real place or a saved map being opened before any map is on show: what the page says meanwhile. */
  const [opening, setOpening] = useState<string | null>(null);
  // the map generator's panel, Real places or Your maps, one at a time
  const [panel, setPanel] = useState<"generator" | "places" | "maps" | null>(null);
  /** The open map's name and its row in Your maps. */
  const [name, setName] = useState("");
  const [maps, setMaps] = useState<YourMapEntry[]>([]);
  /** Said in the header's second line when Your maps can't keep the map. */
  const [saveState, setSaveState] = useState("");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [EditorMod, setEditorMod] = useState<ComponentType<EditorProps> | null>(null);

  const entry = useRef<YourMapEntry | null>(null);
  /** The open map's land and water as the editor shows it, for Your maps' picture. */
  const picture = useRef<(() => MapPicture | null) | null>(null);
  const nameRef = useRef("");
  const infoRef = useRef<SessionInfo | null>(null);
  /** The map's version and views when it opened or was last saved: a save only when they change. */
  const lastKey = useRef("");
  /** The open map is new and not yet in Your maps. */
  /** The open map is kept in Your maps (D330, Kyler, 2026-10-05): from its first edit or rename on, or opened from it.
   *  An unedited map is never written there; Cancel brings it back from memory. Once kept, it stays kept. */
  const kept = useRef(false);
  /** The open map's version when it opened: a later one is an operation applied, an edit. */
  const openedVersion = useRef(0);
  /** Set while the open map is being replaced: the editor's last changes then belong to the map leaving. */
  const switching = useRef(false);
  /** Whether the last save into Your maps worked (if not, replacing an edited map asks first). */
  const keeping = useRef(true);

  const refresh = () => void yourMaps.list().then(setMaps, () => setMaps([]));
  // (its last save took this version and was written, and nothing waits to be saved)
  keptNow = (version: number) => kept.current && entry.current?.revision === version && !saver.busy() && keeping.current;
  const saver = useMemo(
    () =>
      new YourMapsSaver(yourMaps, {
        onResult: (r) => {
          keeping.current = r.ok;
          const problem = storeProblem(r);
          setSaveState(problem ? (r.ok === false && r.reason === "full" ? "Not saved: browser storage is full" : "Not saved in this browser") : "");
          if (problem) setError(problem);
          refresh();
        },
      }),
    [],
  );

  // the editor's chunk loads with the page, beside the first map being made
  useEffect(() => {
    void import("../editor/Editor").then((m) => setEditorMod(() => m.default as ComponentType<EditorProps>));
  }, []);

  const spec = useMemo(
    (): MapSpec => ({
      ...makeSpec({ seed: seedFromText(seedText || "0"), size, designedFor: difficulty, theme }),
      settings,
      ...(sibling ? { variation: sibling.variation, ...(sibling.intentions.length ? { intentions: sibling.intentions } : {}) } : {}),
    }),
    [seedText, size, difficulty, theme, settings, sibling],
  );
  // the settings differ from the open map's (a fresh seed alone is not a change: Generate rolls one anyway)
  const changed = useMemo(() => {
    const of = session?.kind === "generated" ? session.spec : null;
    if (!of) return false;
    const same = (s: MapSpec) => encodeSpecFragment({ ...s, seed: 0 });
    return same(of) !== same(spec) || (seedPinned && of.seed !== spec.seed);
  }, [session, spec, seedPinned]);

  function showSpec(s: MapSpec) {
    setSeedText(String(s.seed));
    setSize(s.size);
    setTheme(s.theme);
    setSettings(s.settings);
    setSibling(s.variation ? { variation: s.variation, intentions: s.intentions ?? [] } : null);
  }

  // a theme pre-fills every setting (PLAN §6), at Normal's start rules; a size sets the default number of mine sites
  function chooseTheme(t: ThemeId) {
    setSibling(null);
    setTheme(t);
    setSettings(defaultSettings(t, difficulty, size));
  }
  function chooseSize(z: { x: number; y: number }) {
    setSibling(null);
    setSize(z);
    setSettings((s) => ({ ...s, resources: { ...s.resources, mineSites: mineSitesForSize(z.x, z.y) } }));
  }

  const words = (e: unknown) => String(e instanceof Error ? e.message : e);

  // ------------------------------------------------------------------------------ Your maps

  /** The open map, as Your maps keeps it: its project file now. */
  async function snapshot() {
    const p = await generator.project(6);
    const pic = picture.current?.();
    const e = { ...entry.current!, name: nameRef.current || entry.current!.name, revision: infoRef.current?.version ?? entry.current!.revision, bytes: p.bytes.length, editedAt: new Date().toISOString(), thumbnail: (pic && thumbnailUrl(pic)) ?? entry.current!.thumbnail };
    entry.current = e;
    return { entry: e, project: p.bytes };
  }

  /** Replace the open map: what is waiting to be saved of it (a kept map's) is saved first. */
  async function replacing<T>(load: () => Promise<T>): Promise<T> {
    switching.current = true;
    try {
      await saver.flush();
      return await load();
    } finally {
      switching.current = false;
    }
  }

  /** The map is the editor's, the address its link; it gets its row in Your maps at its first edit or rename (a map
   *  opened from Your maps has it already). */
  function enterEditor(data: SessionOpen, origin: Origin, place?: string, keepView = false) {
    const now = new Date().toISOString();
    const isNew = !("entry" in origin);
    const e: YourMapEntry = isNew ? { id: newId(), name: data.info.name, kind: origin.kind, createdAt: now, editedAt: now, starred: false, thumbnail: null, revision: data.info.version, savedToTimberborn: null, bytes: 0, size: { w: data.info.W, h: data.info.H } } : origin.entry;
    entry.current = e;
    nameRef.current = e.name;
    infoRef.current = data.info;
    lastKey.current = `${data.info.version}|${JSON.stringify(data.info.views ?? [])}`;
    setName(e.name);
    setSession(data.info);
    setOpened((o) => ({ key: (o?.key ?? 0) + 1, data, keepView }));
    const link = data.info.kind === "generated" && data.info.spec ? "#" + encodeSpecFragment(data.info.spec) : place ? `#place=${place}` : "";
    if (data.info.kind === "generated" && data.info.spec) showSpec(data.info.spec);
    history.replaceState(null, "", link || location.pathname + location.search);
    noteCurrent(e.id, link);
    kept.current = !isNew && origin.kept !== false;
    openedVersion.current = data.info.version;
    if (!isNew) refresh();
  }

  function onEditorChange(info: SessionInfo) {
    if (switching.current || !entry.current) return;
    infoRef.current = info;
    setSession(info);
    // (a change of the map, or of the editor's camera bookmarks, which the project keeps)
    const key = `${info.version}|${JSON.stringify(info.views ?? [])}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    // (not kept yet: only an operation applied makes it so; camera bookmarks alone don't)
    if (!kept.current) {
      if (info.version === openedVersion.current) return;
      kept.current = true;
    }
    saver.changed(entry.current.id, snapshot);
  }

  /** Rename the map from the header's title (D443): the core stores the name (never an operation, never an undo
   *  step) or refuses a blank one with its own words, which the title says; Your maps takes it with the next save. */
  async function rename(n: string): Promise<string | null> {
    const { result, info } = await generator.setName(n);
    if (!result.ok) return result.reason;
    nameRef.current = result.name;
    infoRef.current = info;
    setName(result.name);
    setSession(info);
    // (a rename keeps the map in Your maps, as an edit does)
    kept.current = true;
    if (entry.current) saver.changed(entry.current.id, snapshot);
    return null;
  }

  /** Ask before replacing an edited map only when Your maps isn't keeping it. */
  function guard(action: () => void, what: string) {
    if (!keeping.current && session && session.edits > 0) {
      setConfirm({ text: `${what} closes ${nameRef.current}, and this browser isn't keeping Your maps. Save its project file first if you want to keep its edits.`, yes: "Close it", onYes: action, offerProject: true });
    } else action();
  }

  /** A map of Your maps opened in a worker, under the name Your maps gives it (renamed there while closed). */
  async function openEntry(bytes: Uint8Array, e: YourMapEntry, api = generator): Promise<SessionOpen> {
    const data = await api.openProject(bytes);
    if (data.info.name === e.name) return data;
    const { result, info } = await api.setName(e.name);
    return result.ok ? { ...data, info } : data;
  }

  /** Your maps' menu (Kyler, 2026-10-03): a map's .timber, as File's download makes it for the open map; a closed
   *  map's from its project, in a worker of its own. */
  async function downloadMap(id: string) {
    const e = maps.find((m) => m.id === id);
    if (!e) return;
    setError(null);
    const here = id === entry.current?.id;
    const bg = here ? null : createBackground();
    try {
      let r;
      if (bg) {
        const bytes = await yourMaps.project(id);
        if (!bytes) throw new Error("its project file is missing from this browser");
        await openEntry(bytes, e, bg.api);
        r = await bg.api.exportTimber(true);
      } else r = await generator.exportTimber(true);
      if (!r.ok) return setError(`${e.name} not downloaded: ${r.errors[0] ?? "the map has problems to fix first"}`);
      saveFile(r.bytes, r.fileName);
      setNote(`Saved ${r.fileName}. Move the file to Documents\\Timberborn\\Maps, then start a new game and pick the map.`);
    } catch (err) {
      setError(`${e.name} not downloaded: ${words(err)}`);
    } finally {
      bg?.stop();
    }
  }

  /** A map of Your maps renamed: the open one as the title renames it (D443), another in Your maps. */
  async function renameMap(id: string, n: string): Promise<string | null> {
    if (id === entry.current?.id) return rename(n);
    const r = cleanMapName(n);
    if (!r.ok) return r.reason;
    const done = await yourMaps.rename(id, r.name);
    if (!done.ok) return done.reason === "full" ? "This browser's storage is full" : "This browser can't keep Your maps";
    setMaps(await yourMaps.list().catch(() => maps));
    return null;
  }

  /** Maps deleted from Your maps, asked once ("Delete <name>?", "Delete 7 maps?"), focus on Delete so Enter confirms;
   *  the open one gives way to the next map in Your maps, or a new map. Nothing of a deleted map waiting to be saved
   *  brings it back. */
  function deleteMaps(ids: readonly string[]) {
    const gone = maps.filter((m) => ids.includes(m.id));
    if (!gone.length) return;
    setConfirm({
      text: gone.length === 1 ? `Delete ${gone[0].name}?` : `Delete ${gone.length} maps?`,
      yes: "Delete",
      yesTitle: gone.length === 1 ? "Delete it from Your maps" : "Delete them from Your maps",
      focusYes: true,
      onYes: () =>
        void (async () => {
          const here = gone.some((m) => m.id === entry.current?.id);
          const at = maps.findIndex((m) => m.id === entry.current?.id);
          if (here) {
            // (nothing of it is saved again)
            kept.current = false;
            entry.current = null;
          }
          // (anything of them waiting to be saved is written first, so nothing brings them back after)
          await saver.flush();
          for (const m of gone) await yourMaps.remove(m.id).catch(() => null);
          const left = await yourMaps.list().catch(() => maps.filter((m) => !ids.includes(m.id)));
          setMaps(left);
          if (!here) return;
          // (the next map after where the open one was, among those left; the last one, past the end)
          const after = maps.slice(at + 1).find((m) => left.some((l) => l.id === m.id));
          const next = after ? left.find((l) => l.id === after.id) : left.at(-1);
          if (next) await openMap(next.id, left);
          else await generate({ theme: "any" });
        })(),
    });
  }

  async function openMap(id: string, list = maps) {
    const e = list.find((m) => m.id === id);
    if (!e) return;
    setError(null);
    setBusy(true);
    try {
      const data = await replacing(async () => {
        const bytes = await yourMaps.project(id);
        if (!bytes) throw new Error("its project file is missing from this browser");
        return openEntry(bytes, e);
      });
      enterEditor(data, { entry: e });
    } catch (err) {
      setError(`${e.name} could not be opened: ${words(err)}`);
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------------------------ generating

  /** D329: stop any background search (a new map was asked for). */
  function stopBackground() {
    background.current?.stop();
    background.current = null;
    quiet.current = null;
    setVersion(null);
  }

  /** D329: the map missed an outcome that matters (its theme's promise, or readable water): look for a version
   *  that meets all three in a worker of its own, while the player keeps going. Only a missed promise gets a
   *  note (D333 (5)); a version found for its water is kept quietly. */
  function searchVersion(r: GenerateResponse) {
    stopBackground();
    if (!r.passed || !r.version) return;
    const note = r.version.note;
    const bg = createBackground();
    background.current = bg;
    void bg.api.findVersion({ spec: r.spec, intentions: r.intentions, heights: r.heights }).then(
      (found) => {
        if (background.current !== bg) return;
        bg.stop();
        background.current = null;
        if (!found?.passed) return;
        if (note) setVersion({ response: found, note });
        else quiet.current = found;
      },
      () => undefined,
    );
  }

  /** A version found in the background opens in the editor: its project file, the same map. */
  async function openVersion(r: GenerateResponse) {
    setVersion(null);
    stopBackground();
    setSibling(r.spec.variation ? { variation: r.spec.variation, intentions: r.spec.intentions ?? r.intentions } : null);
    shown = r;
    made++;
    enterEditor(await replacing(() => generator.openProject(r.project)), { kind: "generated" });
  }

  /** The latest run: a result from an older one is never shown over it. */
  const runId = useRef(0);
  async function run(s: MapSpec, tries = 0): Promise<GenerateResponse | null> {
    const id = ++runId.current;
    stopBackground();
    setBusy(true);
    setError(null);
    const over = !!session;
    if (over) setMaking("making");
    performance.mark("dgm:generate");
    try {
      // the open map's project, which Cancel opens again: kept in memory, and saved first when Your maps keeps it
      if (over && entry.current && tries === 0) {
        const was = kept.current;
        const snap = await snapshot();
        if (was) {
          saver.changed(snap.entry.id, () => snap);
          await saver.flush();
        }
        if (id !== runId.current) return null;
        back.current = { entry: snap.entry, bytes: snap.project, kept: was };
      }
      setProgress({ attempt: 0, stage: "land", land: null });
      // (a seed typed as a word names the saved file, D345 B10)
      const word = seedText.trim();
      const seedWord = word && !/^\d+$/.test(word) && seedFromText(word) === s.seed ? word : undefined;
      const r = await generator.generate(
        s,
        proxy((p: GenProgress) =>
          setProgress((q) =>
            p.kind === "stage"
              ? { attempt: p.attempt, stage: p.stage, land: q?.land ?? null, candidate: q?.candidate ?? null }
              : p.kind === "candidate"
                ? { attempt: p.attempt, stage: q?.stage ?? "check", land: q?.land ?? null, candidate: q?.candidate ?? p }
                : { attempt: p.attempt, stage: q?.stage ?? "land", land: p, candidate: q?.candidate ?? null },
          ),
        ),
        seedWord,
      );
      if (id !== runId.current) return null;
      if (!r.passed) {
        const failed = `No valid map after ${r.attempts} attempts. Try another seed.`;
        // the open map stays, and the seed box says its seed again, not the one that failed
        if (session?.kind === "generated" && session.spec) setSeedText(String(session.spec.seed));
        if (session) {
          setMaking({ failed });
          return null;
        }
        setError(failed);
        // with no map open yet (a link's map that fails its checks), the same settings with another seed, so the
        // page is never left without a map; the message says why
        if (tries < 5) {
          const seed = randomSeed();
          setSeedText(String(seed));
          setSeedPinned(false);
          return run({ ...s, seed }, tries + 1);
        }
        // (no map to show after all: the warm renderer goes)
        discardPreparedRenderer();
        return null;
      }
      shown = r;
      made++;
      performance.mark("dgm:generated");
      // the map is the editor's from the start: there is no step between making it and shaping it
      enterEditor(await replacing(() => generator.refine()), { kind: "generated" });
      performance.mark("dgm:opened");
      searchVersion(r);
      setMaking(null);
      return r;
    } catch (e) {
      if (id !== runId.current) return null;
      if (over) setMaking({ failed: words(e) });
      else setError(words(e));
      return null;
    } finally {
      if (id === runId.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  }

  /** Cancel a map being made: the generator's work stops at once (its worker ends), and the map that was open comes
   *  back exactly as it was, its edits and history with it, the view where it was, in a new worker. */
  async function cancelMaking() {
    runId.current++;
    stopBackground();
    const old = gen;
    gen = createGeneratorWorker();
    generator = gen.api;
    old.stop();
    setProgress(null);
    const b = back.current;
    back.current = null;
    if (!b) {
      setBusy(false);
      return setMaking(null);
    }
    setMaking("back");
    try {
      enterEditor(await generator.openProject(b.bytes), { entry: b.entry, kept: b.kept }, undefined, true);
      setMaking(null);
    } catch (e) {
      setMaking({ failed: words(e) });
    } finally {
      setBusy(false);
    }
  }

  /** Another like this (D278 (1c)): a sibling of the map open, the same theme, settings and intentions on
   *  different land, with its own share link; never a clone of the map it came from (a sibling whose land
   *  matches it is passed over for the next). A version the background search kept quietly is shown at once. */
  async function anotherLikeThis() {
    const from = shown;
    if (!from) return;
    const kept = quiet.current;
    if (kept) return void (await openVersion(kept));
    let variation = (from.spec.variation ?? 0) + 1;
    for (let tries = 0; tries < 3; tries++) {
      const next = { variation, intentions: from.spec.intentions ?? from.intentions };
      setSibling(next);
      const s: MapSpec = { ...from.spec, variation: next.variation, ...(next.intentions.length ? { intentions: next.intentions } : {}) };
      delete s.accepted;
      const r = await run(s);
      if (!r || !sameLand(from.heights, r.heights)) return;
      variation++;
    }
  }

  /** Generate (D323, item 20): a kept seed makes its map again; otherwise a fresh seed each press, shown
   *  in the box. Every Generate makes a new map (D336); the one it replaces stays in Your maps. */
  function generate(over?: { theme: ThemeId }) {
    if (seedPinned && !over) return void run(spec);
    const seed = randomSeed();
    setSibling(null);
    setSeedText(String(seed));
    setSeedPinned(false);
    const t = over?.theme ?? theme;
    const s = over ? defaultSettings(t, difficulty, size) : settings;
    if (over) {
      setTheme(t);
      setSettings(s);
    }
    void run({ ...makeSpec({ seed, size, designedFor: difficulty, theme: t }), settings: s });
  }

  useEffect(() => {
    // the 3D view's renderer warms while the first map loads (D367, part 1): the view takes it when it opens
    void prepareRenderer();
    void (async () => {
      const list = await yourMaps.list().catch(() => [] as YourMapEntry[]);
      setMaps(list);
      const place = placeFromHash(location.hash);
      const cur = savedCurrent();
      const left = cur ? list.find((e) => e.id === cur.id) : undefined;
      // the map left open comes back as it was when the address is its own link, or none ("#edit" was dev's)
      const linkOf = (h: string) => {
        const d = decodeSpecFragment(h);
        return d ? "#" + encodeSpecFragment(d.spec) : h;
      };
      if (left && ((!init.fromLink && !place) || (cur!.link !== "" && linkOf(cur!.link) === linkOf(location.hash)))) {
        setOpening("Opening your map…");
        try {
          const bytes = await yourMaps.project(left.id);
          if (bytes) return void enterEditor(await openEntry(bytes, left), { entry: left }, place ?? undefined);
        } catch (e) {
          setError(`${left.name} could not be opened: ${words(e)}`);
        } finally {
          setOpening(null);
        }
      }
      if (place) return void (await openPlace(place));
      if (!init.fromLink) {
        // the map the page kept before Your maps (its autosave) joins Your maps once
        const saved = await storage.load().catch(() => null);
        if (saved) {
          try {
            const data = await generator.openProject(saved.bytes);
            enterEditor(data, { kind: data.info.kind === "generated" ? "generated" : "import" });
            return void storage.clear();
          } catch {
            // (an autosave that can't be read: a new map instead)
          }
        }
      }
      await run(init.spec);
    })();
  }, []);

  /** Open a real place: its .timber is built in the worker and imported. */
  async function openPlace(id: string) {
    setError(null);
    setBusy(true);
    if (!session) setOpening("Opening the map…");
    try {
      const found = (await fetchIndex()).places.find((p) => p.id === id);
      if (!found) throw new Error(`there is no real place called "${id}"`);
      if (!session) setOpening(`Opening ${found.name}…`);
      const data = await replacing(async () => generator.openPlace(await fetchPlace(id)));
      enterEditor(data, { kind: "place" }, id);
    } catch (e) {
      // (a map made instead, then the words: making it clears the page's message)
      if (!session) await run(init.spec);
      setError(`The real place could not be opened: ${words(e)}`);
    } finally {
      setOpening(null);
      setBusy(false);
    }
  }

  async function openBytes(bytes: Uint8Array, fileName: string) {
    setError(null);
    setBusy(true);
    try {
      const data = await replacing(() => (isProjectFile(fileName, bytes) ? generator.openProject(bytes) : generator.openTimber(bytes, fileName)));
      enterEditor(data, { kind: data.info.kind === "generated" ? "generated" : "import" });
    } catch (e) {
      setError(`${fileName} could not be opened: ${words(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function openFile(file: File) {
    guard(() => void readFile(file).then((b) => openBytes(b, file.name)), `Opening ${file.name}`);
  }

  // ---------------------------------------------------------------------------------- render

  const drawer: GeneratorModel = {
    spec,
    seedText,
    onSeed: (t) => {
      setSeedText(t);
      setSeedPinned(t.trim() !== "");
    },
    seedPinned,
    onUnpinSeed: () => setSeedPinned(false),
    onPinSeed: () => setSeedPinned(true),
    onSize: chooseSize,
    onTheme: chooseTheme,
    onSettings: setSettings,
    onReset: () => setSettings(defaultSettings(theme, difficulty, size)),
    busy,
    changed,
    onGenerate: () => guard(() => generate(), "Generating a new map"),
    onSurprise: () => guard(() => generate({ theme: "any" }), "Generating a new map"),
    // (the open map's tile says its name as soon as it is renamed)
    maps: maps.map((e) => rowOf(e.id === entry.current?.id && name ? { ...e, name } : e)),
    current: entry.current?.id ?? null,
    onOpenMap: (id) => guard(() => void openMap(id), "Opening another map"),
    onOpenPlace: (id) => guard(() => void openPlace(id), "Opening a real place"),
    onDownloadMap: (id) => void downloadMap(id),
    onRenameMap: renameMap,
    onDeleteMaps: deleteMaps,
    name,
    onRename: rename,
  };

  // the confirm dialog: focus on Cancel, or on its yes when it says so (a delete: Enter confirms); Esc cancels, and goes
  // no further (autoFocus works once a page in some browsers: the focus is set here)
  const confirmNo = useRef<HTMLButtonElement>(null);
  const confirmYes = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!confirm) return;
    (confirm.focusYes ? confirmYes : confirmNo).current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setConfirm(null);
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [confirm]);

  // a map being made: the modal over the editor, the one way out its Cancel (Esc too); every other key waits
  useEffect(() => {
    if (making !== "making" && making !== "back") return;
    const hold = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape" && making === "making") {
        e.preventDefault();
        void cancelMaking();
      } else if (e.key !== "Tab") e.preventDefault();
    };
    window.addEventListener("keydown", hold, true);
    return () => window.removeEventListener("keydown", hold, true);
  }, [making]);
  const makingDialog = making ? (
    <div class="dialog-backdrop making-backdrop">
      <div class="dialog making-dialog" role={typeof making === "object" ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby="making-words">
        <p id="making-words" role="status">
          {typeof making === "object" ? making.failed : making === "back" ? "Opening your map…" : stageText(progress)}
        </p>
        <footer>
          {typeof making === "object" ? (
            <button type="button" class="ghost" title="Back to the map" onClick={() => setMaking(null)} autoFocus>
              Close
            </button>
          ) : (
            <button type="button" class="ghost" disabled={making === "back"} {...tip("Stop making the map", "Esc")} onClick={() => void cancelMaking()} autoFocus>
              Cancel
            </button>
          )}
        </footer>
      </div>
    </div>
  ) : null;

  const confirmDialog = confirm ? (
    <div class="dialog-backdrop">
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-text">
        <p id="confirm-text">{confirm.text}</p>
        <footer>
          <button ref={confirmNo} type="button" class="ghost" title="Keep the map as it is" onClick={() => setConfirm(null)}>
            Cancel
          </button>
          {confirm.offerProject ? (
            <button type="button" class="ghost" title="Save the map and its edits as a project" onClick={() => void generator.project().then((p) => saveFile(p.bytes, p.fileName, "application/gzip"))}>
              Save project file
            </button>
          ) : null}
          <button
            type="button"
            ref={confirmYes}
            class="primary"
            title={confirm.yesTitle ?? "Replace the map"}
            onClick={() => {
              const c = confirm;
              setConfirm(null);
              c.onYes();
            }}
          >
            {confirm.yes}
          </button>
        </footer>
      </div>
    </div>
  ) : null;

  const message = error ? (
    <p class="error floating" role="alert">
      {error}
      <button type="button" class="linkish" aria-label="Dismiss" title="Dismiss this message" onClick={() => setError(null)}>
        ×
      </button>
    </p>
  ) : version ? (
    <p class="error floating quiet" role="status">
      {version.note}
      <button type="button" class="linkish" title="Open the version that was found" onClick={() => void openVersion(version.response)}>
        Open it
      </button>
      <button type="button" class="linkish" aria-label="Dismiss" title="Dismiss this message" onClick={() => setVersion(null)}>
        ×
      </button>
    </p>
  ) : note ? (
    <p class="error floating quiet" role="status">
      {note}
      <button type="button" class="linkish" aria-label="Dismiss" title="Dismiss this message" onClick={() => setNote(null)}>
        ×
      </button>
    </p>
  ) : null;

  if (!opened || !EditorMod) {
    // the first visit, before any map exists: the first look of the map being made
    return (
      <>
        <div class="placeholder page-wait" role="status">
          {progress ? <FirstLook progress={progress} /> : <p>{opening ?? (opened ? "Opening the editor…" : "Generating…")}</p>}
        </div>
        {message}
        {confirmDialog}
      </>
    );
  }

  return (
    <>
      <EditorMod
        key={opened.key}
        api={generator}
        opened={opened.data}
        onChange={onEditorChange}
        onOpenFile={openFile}
        saveState={saveState}
        name={name}
        onRename={rename}
        onAnother={() => guard(() => void anotherLikeThis(), "Another like this")}
        onPicture={(get) => (picture.current = get)}
        drawer={drawer}
        drawerOpen={panel === "generator"}
        onDrawer={(o) => setPanel(o ? "generator" : null)}
        mapsOpen={panel === "maps"}
        onMaps={(o) => setPanel(o ? "maps" : null)}
        placesOpen={panel === "places"}
        onPlaces={(o) => setPanel(o ? "places" : null)}
        keepView={opened.keepView}
      />
      {message}
      {confirmDialog}
      {makingDialog}
    </>
  );
}
