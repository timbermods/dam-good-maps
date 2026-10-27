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
import { compareProblem } from "../core/library/keptVersions";
import { numberedName } from "./versionName";
import { surfaceWater, type MapView } from "../render3d/model";
import { YourMapsSaver } from "../core/library/saver";
import {
  decodeSpecFragment,
  defaultSettings,
  encodeSpecFragment,
  GENERATOR_MIN_SIDE,
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
import type { EditorProps, MapPicture, ResizeCarry } from "../editor/Editor";
import type { LoadingFrameProps } from "../editor/LoadingFrame";
import { thumbnailMaker } from "./thumbnails";
import { discardPreparedRenderer, prepareRenderer } from "../render3d/prepared";
import type { GeneratorModel, YourMapRow } from "../editor/generator/model";
import { fetchIndex, fetchPlace, placeFromHash } from "../places/data";
import { FirstLook, MakingCount, MakingWater, progressText, sayStage, stageText, type Progress } from "./FirstLook";
import { tip } from "./Tooltip";
import { Together, type Keep } from "../collab/together";
import { useShowcase } from "./useShowcase";

/** The generator and the open map's worker; Cancel ends it and the open map comes back in a new one. */
let gen = createGeneratorWorker();
let generator = gen.api;
void generator.deferChecks();
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
      /** A shared session's new map is going into the session's worker (a test presses Cancel in that window). */
      committing?(): boolean;
      /** The e2e build only: true while a test (window.__dgmForceFail, a count) wants the next map to fail its checks. */
      forceFail?(): boolean;
    };
  }
}
let shown: GenerateResponse | null = null;
/** How many maps the page has made (a test hook: waits for the next one). */
let made = 0;
/** Whether the open map is kept as it stands (the page sets it; a test hook). */
let keptNow: (version: number) => boolean = () => false;
let committingNow: () => boolean = () => false;
window.dgm = {
  async generate(fragment: string) {
    const d = decodeSpecFragment(fragment);
    if (!d) throw new Error("bad fragment");
    const r = await generator.generate(d.spec);
    return { sha256: r.sha256, bytes: r.timber.length, passed: r.passed, ms: r.ms, ticks: r.facts.settle.ticks };
  },
  kept: (version: number) => keptNow(version),
  committing: () => committingNow(),
  ...(import.meta.env.MODE === "e2e"
    ? {
        forceFail() {
          const w = window as unknown as { __dgmForceFail?: number };
          const n = Number(w.__dgmForceFail ?? 0);
          if (n > 0) w.__dgmForceFail = n - 1;
          return n > 0;
        },
      }
    : {}),
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
const rowOf = (e: YourMapEntry): YourMapRow => ({ id: e.id, name: e.name, size: e.size, thumbnail: e.thumbnail, ...(e.parent ? { parent: e.parent } : {}) });

/** Your maps' picture of a map (D234): the core's top-down thumbnail as a PNG, made in a worker of its own
 *  (`thumbnail.worker.ts`), or null when the worker can't make it in time (`thumbnails.ts`). */
const thumbnailUrl = thumbnailMaker(() => new Worker(new URL("./thumbnail.worker.ts", import.meta.url), { type: "module", name: "thumbnail" }));

/** When the page is next idle (or `ms` from now at the latest). */
const whenIdle = (ms: number) =>
  new Promise<void>((go) => (typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(() => go(), { timeout: ms }) : setTimeout(go, 0)));

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
  const [opened, setOpened] = useState<{ key: number; data: SessionOpen; keepView?: boolean; carry?: ResizeCarry } | null>(null);
  /** A map being made over the open one (Generate, Surprise me, Another like this): the modal says so, and nothing
   *  else can be clicked or started; "back" while Cancel puts the open map back; the words when it failed. */
  const [making, setMaking] = useState<"making" | "back" | { failed: string } | null>(null);
  /** The open map as it was when a new one was asked for: Cancel opens it again, its edits and history with it. */
  const back = useRef<{ entry: YourMapEntry; bytes: Uint8Array; kept: boolean } | null>(null);
  /** That project while it is still being taken (Cancel waits for it before ending the worker it comes from), and a
   *  Cancel already under way (a second one does nothing). */
  const backReady = useRef<Promise<{ entry: YourMapEntry; bytes: Uint8Array; kept: boolean }> | null>(null);
  const cancelling = useRef(false);
  /** A real place or a saved map being opened before any map is on show: what the page says meanwhile. */
  const [opening, setOpening] = useState<string | null>(null);
  /** What the progress dialog says while a map opens over the open one (a real place), in place of the generator's stage. */
  const [makingWords, setMakingWords] = useState<string | null>(null);
  /** The open map is a file: it has no generator settings, so the panel reads "–" for them until one is set. */
  const [blank, setBlank] = useState(false);
  // the map generator's panel, Real places or Your maps, one at a time
  const [panel, setPanel] = useState<"generator" | "places" | "maps" | null>(null);
  /** The open map's name and its row in Your maps. */
  const [name, setName] = useState("");
  /** The name typed in the generator's Name box for the next map (null: none); the map Generate makes next takes it, and the
   *  open map keeps its own name. */
  const [nextName, setNextName] = useState<string | null>(null);
  const nextNameRef = useRef<string | null>(null);
  nextNameRef.current = nextName;
  const [maps, setMaps] = useState<YourMapEntry[]>([]);
  /** Said in the header's second line when Your maps can't keep the map. */
  const [saveState, setSaveState] = useState("");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  /** Another version of the open map to flip to (Your maps' Compare with the open map): read once, settled. */
  const [compare, setCompare] = useState<{ id: string; name: string; view: MapView } | null>(null);
  const [EditorMod, setEditorMod] = useState<ComponentType<EditorProps> | null>(null);
  /** The editor's frame, shown while the first map is made. */
  const [FrameMod, setFrameMod] = useState<ComponentType<LoadingFrameProps> | null>(null);

  const entry = useRef<YourMapEntry | null>(null);
  /** Edit the map with someone else (Together): the page's one session object, kept as the editor remounts for each map. */
  const sharedHooks = useRef<{ open(data: SessionOpen): void; keep(k: Keep): void; prepare(): Promise<void> }>();
  const together = useMemo(
    () =>
      new Together({
        worker: () => generator.collab,
        hasMap: () => !!entry.current,
        open: (data) => sharedHooks.current!.open(data),
        keep: (k) => sharedHooks.current!.keep(k),
        prepare: () => sharedHooks.current!.prepare(),
      }),
    [],
  );
  /** The worker that makes a map for the host while a session is on (the session lives in the open map's worker, which must stay). */
  const sharedGen = useRef<ReturnType<typeof createBackground> | null>(null);
  /** The host's new map is going into the session's worker and the guest is being sent it: from there it cannot be taken back
   *  (a Cancel then would leave the host's editor, its worker and the guest on three different maps), so Cancel waits it out. */
  const committing = useRef(false);
  /** The same, for the dialog: its Cancel is off and its words say the map is opening for as long as it is true. */
  const [sealed, setSealed] = useState(false);
  const commit = (on: boolean) => {
    committing.current = on;
    setSealed(on);
  };
  committingNow = () => committing.current;
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
  /** While the open map is captured and replaced, its editor takes no new edit (investigation/map-switch-speed); the
   *  editor's queue of edits already made, which the capture waits for. */
  const [replacingMap, setReplacingMap] = useState(false);
  const pendingEdits = useRef<(() => Promise<void>) | null>(null);
  /** Whether the last save into Your maps worked (if not, replacing an edited map asks first). */
  const keeping = useRef(true);
  /** The player chose to close a map Your maps isn't keeping ("Close it"): the next replacement goes ahead. */
  const discardAllowed = useRef(false);

  const refresh = () => void yourMaps.list().then(setMaps, () => setMaps([]));
  // (its last save took this version and was written, and nothing waits to be saved)
  keptNow = (version: number) => kept.current && entry.current?.revision === version && !saver.busy() && keeping.current;
  const saver = useMemo(
    () =>
      new YourMapsSaver(yourMaps, {
        onResult: (r, id) => {
          // (the open map's entry takes its new storage token: its next save is over this one, investigation/saving-review)
          if (r.ok && r.storageVersion && entry.current?.id === id) entry.current = { ...entry.current, storageVersion: r.storageVersion };
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
    void import("../editor/LoadingFrame").then((m) => setFrameMod(() => m.LoadingFrame));
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

  /** The player sets a generator setting: the panel stops reading "–" and the settings are the next map's. */
  function unblank() {
    if (!blank) return;
    setBlank(false);
    setSeedText((t) => (t.trim() ? t : String(randomSeed())));
  }

  /** A file is the open map: the generator's settings start again from the Any theme's own, at the file's size (a
   *  Generate then makes a new map of that size), and the panel reads "–" for them until one is set. */
  function settingsOfFile(info: SessionInfo) {
    const least = GENERATOR_MIN_SIDE.any;
    const z = { x: Math.max(least, Math.min(256, info.W)), y: Math.max(least, Math.min(256, info.H)) };
    setBlank(true);
    setSeedText("");
    setSeedPinned(false);
    setSibling(null);
    setTheme("any");
    setSize(z);
    setSettings(defaultSettings("any", difficulty, z));
  }

  function showSpec(s: MapSpec) {
    setBlank(false);
    setSeedText(String(s.seed));
    setSize(s.size);
    setTheme(s.theme);
    setSettings(s.settings);
    setSibling(s.variation ? { variation: s.variation, intentions: s.intentions ?? [] } : null);
  }

  // a theme pre-fills every setting (PLAN §6), at Normal's start rules; a size sets the default number of mine sites
  function chooseTheme(t: ThemeId) {
    unblank();
    setSibling(null);
    setTheme(t);
    setSettings(defaultSettings(t, difficulty, size));
  }
  function chooseSize(z: { x: number; y: number }) {
    unblank();
    setSibling(null);
    setSize(z);
    setSettings((s) => ({ ...s, resources: { ...s.resources, mineSites: mineSitesForSize(z.x, z.y) } }));
  }

  const words = (e: unknown) => String(e instanceof Error ? e.message : e);

  // ------------------------------------------------------------------------------ Your maps

  /** The open map, as Your maps keeps it: its project file now. */
  async function snapshot() {
    // (the map it is taken of, fixed before anything waits: a capture queued as the map changes stays its map's; its
    // edits already made go in first, and its version is the worker's)
    const of = entry.current!;
    await pendingEdits.current?.();
    // (the picture when the page is idle, never stacked on the edit or the water that just went in, while the worker
    // writes the project)
    const [p, made] = await Promise.all([
      generator.project(6),
      whenIdle(250).then(() => {
        const pic = picture.current?.();
        return pic ? thumbnailUrl(pic) : null;
      }),
    ]);
    const thumbnail = made ?? of.thumbnail;
    // (its name and size from the worker and the page, so the save never unzips the project to read them)
    const info = infoRef.current;
    const size = of.size ?? (info ? { w: info.W, h: info.H } : undefined);
    const e = { ...of, name: p.name || nameRef.current || of.name, revision: p.version, bytes: p.bytes.length, editedAt: new Date().toISOString(), thumbnail, ...(size ? { size } : {}) };
    if (entry.current?.id === of.id) entry.current = e;
    return { entry: e, project: p.bytes, name: p.name };
  }

  /** Replace the open map: what is waiting to be saved of it (a kept map's) is saved first. In a shared session this is the
   *  host's alone (§9): the guest is told first, and sent the new map once it is open (`announced`: it was told already). */
  async function replacing<T extends { info: { name: string } }>(load: () => Promise<T>, announced = false): Promise<T> {
    setReplacingMap(true);
    const hosting = together.isHost;
    try {
      if (hosting && !announced) together.announce("a new map");
      // (the edits already made finish on the map leaving, and its save is registered before it is flushed)
      await pendingEdits.current?.();
      await saver.flush();
      if (!keeping.current && !discardAllowed.current) throw new Error("Your map was not saved. Download the project before replacing it.");
      switching.current = true;
      const data = await load();
      if (hosting) await together.newMap(data.info.name);
      return data;
    } catch (e) {
      if (hosting) together.cancelAnnounce();
      throw e;
    } finally {
      switching.current = false;
      discardAllowed.current = false;
      setReplacingMap(false);
    }
  }

  /** The map is the editor's, the address its link; it gets its row in Your maps at its first edit or rename (a map
   *  opened from Your maps has it already). */
  function enterEditor(data: SessionOpen, origin: Origin, place?: string, keepView = false) {
    const now = new Date().toISOString();
    const isNew = !("entry" in origin);
    // (a reopened map's versions count again from its opening: kept as it stands at that version)
    const e: YourMapEntry = isNew ? { id: newId(), name: data.info.name, kind: origin.kind, createdAt: now, editedAt: now, thumbnail: null, revision: data.info.version, savedToTimberborn: null, bytes: 0, size: { w: data.info.W, h: data.info.H } } : { ...origin.entry, revision: data.info.version };
    entry.current = e;
    setCompare(null);
    keeping.current = true;
    setSaveState("");
    nameRef.current = e.name;
    // (a name typed for the next map belongs to a generated one; a cancelled Generate keeps it for the next try)
    if (!keepView) setNextName(null);
    // (a version found for the map that was open is no version of this one)
    if (!keepView) stopBackground();
    infoRef.current = data.info;
    lastKey.current = `${data.info.version}|${JSON.stringify(data.info.views ?? [])}|${!!data.info.waterPending}`;
    setName(e.name);
    setSession(data.info);
    setOpened((o) => ({ key: (o?.key ?? 0) + 1, data, keepView }));
    const link = data.info.kind === "generated" && data.info.spec ? "#" + encodeSpecFragment(data.info.spec) : place ? `#place=${place}` : "";
    if (data.info.kind === "generated" && data.info.spec) showSpec(data.info.spec);
    else settingsOfFile(data.info);
    history.replaceState(null, "", link || location.pathname + location.search);
    noteCurrent(e.id, link);
    kept.current = !isNew && origin.kept !== false;
    openedVersion.current = data.info.version;
    if (!isNew) refresh();
  }

  // what the session asks of the page: a guest's copy of the host's map, and the session kept in Your maps (§8)
  sharedHooks.current = {
    open: (data) => enterEditor(data, { kind: data.info.kind === "generated" ? "generated" : "import" }),
    // (the map in the worker is the session's, and the entry open is its row: it is saved now, as the session stands. When the
    // host opens another map, the old one is saved under its row from the project the session kept, so a guest's old map is kept
    // too, edited or not)
    keep: (k) => {
      const e = entry.current;
      if (!e) return;
      kept.current = true;
      if (k.reason === "new-map") {
        const old: YourMapEntry = { ...e, name: k.name || e.name, editedAt: new Date().toISOString(), bytes: k.project.length };
        saver.changed(e.id, () => ({ entry: old, project: k.project }));
      } else saver.changed(e.id, snapshot);
      void saver.flush(e.id);
    },
    // (a guest's own map is saved first: the host's map takes its place in the worker)
    prepare: async () => {
      await pendingEdits.current?.();
      await saver.flush();
    },
  };

  /** The open map changed size (a crop, or its undo or redo, D340): the editor opens the session's map again, the camera and
   *  the minimap fitted to it; the map stays the same row of Your maps, with its new size. */
  async function resized(carry: ResizeCarry) {
    // (the old editor's controls are shut, and what it had queued reaches the worker first: the map is taken after it, so the
    // new editor starts from every step the worker took, and History and Undo agree with the worker)
    setReplacingMap(true);
    // (a compare was of the map at its old size)
    setCompare(null);
    try {
      await pendingEdits.current?.();
      const data = await generator.sessionView();
      if (entry.current) entry.current = { ...entry.current, size: { w: data.info.W, h: data.info.H } };
      infoRef.current = data.info;
      setSession(data.info);
      setOpened((o) => ({ key: (o?.key ?? 0) + 1, data, carry }));
    } finally {
      setReplacingMap(false);
    }
  }

  function onEditorChange(info: SessionInfo) {
    if (switching.current || !entry.current) return;
    infoRef.current = info;
    setSession(info);
    // (a change of the map, of the editor's camera bookmarks, which the project keeps, or its canonical water arriving,
    // which a project saved before it is refreshed with: the next opening takes the stored map)
    const key = `${info.version}|${JSON.stringify(info.views ?? [])}|${!!info.waterPending}`;
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
  /** A guest's map is the host's: changing the whole map is the host's alone (§9). True, with the one-line reason said, for a guest. */
  function refuseGuest(): boolean {
    if (!together.isGuest) return false;
    setNote(`Only ${together.state.other?.name ?? "the host"} can open another map while you are together. Leave first to open one yourself.`);
    return true;
  }

  function guard(action: () => void, what: string) {
    if (refuseGuest()) return;
    if (!keeping.current && session && session.edits > 0) {
      setConfirm({ text: `${what} closes ${nameRef.current}, which this browser isn't keeping. Download the project first to keep its edits.`, yes: "Close it", onYes: () => {
          discardAllowed.current = true;
          action();
        }, offerProject: true });
    } else action();
  }

  /** A map of Your maps opened in a worker, under the name Your maps gives it (renamed there while closed). */
  async function openEntry(bytes: Uint8Array, e: YourMapEntry, api = generator): Promise<SessionOpen> {
    const data = await api.openProject(bytes);
    if (data.info.name === e.name) return data;
    const { result, info } = await api.setName(e.name);
    return result.ok ? { ...data, info } : data;
  }

  /** Your maps' menu (Kyler, 2026-10-03): a map's .timber; a closed map's from its project, in a worker of its own.
   *  It keeps the core's top-down thumbnail, unlike File's download: a map that isn't open has no view to draw its
   *  3D picture from (D488). */
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
        if (!bytes) throw new Error("its project is missing from this browser");
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

  /** History's Keep this version and Branch from here (src/core/library/keptVersions.ts): the open map as it stood at History
   *  step `k`, kept in Your maps as a map of its own, named for the map and the step and remembering where it came from.
   *  A branch is opened too, with its History through that step; a kept version leaves the open map where it is. */
  const keepStore = useRef<Promise<void>>(Promise.resolve());
  async function keepStep(k: number, branch: boolean) {
    const open = entry.current;
    if (!open) return;
    setError(null);
    try {
      await pendingEdits.current?.();
      const v = await generator.keepVersion(k, kept.current ? open.id : undefined);
      if (!v) throw new Error("that step is no longer in the history");
      let bytes = v.bytes;
      let picture = v.picture;
      if (!v.stored || !picture) {
        // (the open map has no settled build of that step: it is built in a worker of its own, the editor never waits; its name is chosen once it is built, as it is stored, so the note names none)
        setNote(`Keeping that version…`);
        const bg = createBackground();
        try {
          await bg.api.openVersion(bytes);
          const [p, o] = await Promise.all([bg.api.project(6), bg.api.sessionView()]);
          bytes = p.bytes;
          picture = { heights: o.view.heights, W: o.view.W, H: o.view.H, water: surfaceWater(o.view.W, o.view.H, o.view.water).depth };
        } finally {
          bg.stop();
          setNote(null);
        }
      }
      const now = new Date().toISOString();
      // (a version's name is given, never asked: chosen as the map is stored, when Your maps already holds it it is numbered, as
      // saved files are; the build above takes a while, and one kept or branched meanwhile must be seen. One at a time here, so two
      // finishing together don't both see the name free)
      const thumbnail = picture ? thumbnailUrl(picture) : null;
      const stored = keepStore.current.then(async () => {
        const name = numberedName(v.name, (await yourMaps.list().catch(() => maps)).map((m) => m.name));
        const e: YourMapEntry = { id: newId(), name, kind: open.kind, createdAt: now, editedAt: now, thumbnail: await thumbnail, revision: 1, savedToTimberborn: null, bytes: bytes.length, size: v.size, parent: v.parent };
        return { e, r: await yourMaps.put(e, bytes, null) };
      });
      keepStore.current = stored.then(() => undefined, () => undefined);
      const { e, r } = await stored;
      const name = e.name;
      const problem = storeProblem(r);
      if (problem) return setError(problem);
      const list = await yourMaps.list().catch(() => [e, ...maps]);
      setMaps(list);
      if (branch) guard(() => void openMap(e.id, list), "Branching");
      else setNote(`Kept as ${name}`);
    } catch (err) {
      setError(`That version was not kept: ${words(err)}`);
    }
  }

  /** Your maps' Compare with the open map: the other map is opened in a worker of its own, settled, and its land, objects and
   *  water given to the editor to flip to (the same size only). */
  async function compareWith(id: string) {
    const e = maps.find((m) => m.id === id);
    const info = infoRef.current;
    if (!e || !info || id === entry.current?.id) return;
    const why = compareProblem({ w: info.W, h: info.H }, e.size);
    if (why) return setError(why);
    setError(null);
    setNote(`Getting ${e.name} ready to compare…`);
    const openId = entry.current?.id;
    const bg = createBackground();
    try {
      const bytes = await yourMaps.project(id);
      if (!bytes) throw new Error("its project is missing from this browser");
      await bg.api.openProject(bytes);
      await bg.api.whenWaterSettles();
      const o = await bg.api.sessionView();
      if (o.view.W !== info.W || o.view.H !== info.H) throw new Error("it is not the size of the open map");
      // (another map opened while this one was read: it is no longer the one being compared with)
      if (entry.current?.id !== openId) return setNote(null);
      setCompare({ id, name: e.name, view: o.view });
      setNote(null);
      setPanel(null);
    } catch (err) {
      setNote(null);
      setError(`${e.name} could not be compared: ${words(err)}`);
    } finally {
      bg.stop();
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
            // (nothing of it is saved again, and a save of it that failed no longer counts)
            switching.current = true;
            kept.current = false;
            keeping.current = true;
            setSaveState("");
            entry.current = null;
          }
          // (its saves waiting are dropped and one being written finishes first, so nothing brings them back after)
          for (const m of gone) {
            await saver.discard(m.id);
            await yourMaps.remove(m.id).catch(() => null);
          }
          if (here) switching.current = false;
          setCompare((c) => (c && ids.includes(c.id) ? null : c));
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
        if (!bytes) throw new Error("its project is missing from this browser");
        return openEntry(bytes, e);
      });
      enterEditor(data, { entry: e });
    } catch (err) {
      setError(`${e.name} could not be opened: ${words(err)}`);
    } finally {
      setBusy(false);
    }
  }

  // Leaving the page (investigation/saving-review): the browser asks first while an edit of a kept map isn't saved yet
  // or its save failed (a write can't be waited for as the page closes); hidden, the page saves what is waiting.
  useEffect(() => {
    const leaving = (e: BeforeUnloadEvent) => {
      if (!kept.current || (!saver.busy() && keeping.current)) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const flush = () => void saver.flush();
    const hidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", leaving);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("beforeunload", leaving);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);

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
  async function openVersion(r: GenerateResponse, fromNote = false) {
    setVersion(null);
    stopBackground();
    // (D234, D336: a map that is replaced and not kept is simply gone, but the one the note's own Open it replaces
    // cannot be made again: its seed now makes the version. So Your maps keeps that one as it stands, as it keeps an
    // edited map a Generate replaces. Another like this, which shows a version kept quietly, keeps nothing)
    let keepsOld = false;
    if (fromNote && entry.current && !kept.current) {
      const was = await snapshot();
      saver.changed(was.entry.id, () => ({ entry: was.entry, project: was.project }));
      kept.current = true;
      keepsOld = true;
    }
    setSibling(r.spec.variation ? { variation: r.spec.variation, intentions: r.spec.intentions ?? r.intentions } : null);
    shown = r;
    made++;
    try {
      enterEditor(await replacing(() => generator.openProject(r.project)), { kind: "generated" });
    } catch (e) {
      // (it stays on screen, and stays kept: the save is done)
      return void setError(words(e));
    }
    if (keepsOld) setNote("The map before it is in Your maps.");
  }

  /** The latest run: a result from an older one is never shown over it. */
  const runId = useRef(0);

  /** The open map's project, which Cancel opens again while a map is made or opened over it: kept in memory, and saved
   *  first when Your maps keeps it. False when a later run has taken over meanwhile. */
  async function holdBack(id: number, before: string): Promise<boolean> {
    const was = kept.current;
    back.current = null;
    backReady.current = snapshot().then((s) => ({ entry: s.entry, bytes: s.project, kept: was }));
    const b = await backReady.current;
    if (was) {
      saver.changed(b.entry.id, () => ({ entry: b.entry, project: b.bytes }));
      await saver.flush();
      if (!keeping.current && !discardAllowed.current) throw new Error(`Your map was not saved. Download the project before ${before}.`);
    }
    if (id !== runId.current) return false;
    back.current = b;
    return true;
  }

  async function run(s: MapSpec, tries = 0, keepError = false): Promise<GenerateResponse | null> {
    const id = ++runId.current;
    stopBackground();
    setBusy(true);
    if (!keepError) setError(null);
    const over = !!session;
    if (over) {
      setMakingWords(null);
      setMaking("making");
    }
    performance.mark("dgm:generate");
    // in a shared session the host makes the map in a worker of its own, so Cancel never ends the session's; the guest is told first (§9)
    const shared = over && together.isHost;
    const maker = shared ? createBackground() : null;
    sharedGen.current = maker;
    if (shared) together.announce("a new map");
    // (the open map's keeping comes first: a stop there is the dialog's, a refusal of the settings after it is a note)
    let holding = over && !!entry.current && tries === 0;
    try {
      if (holding && !(await holdBack(id, "generating another"))) {
        if (shared) together.cancelAnnounce();
        return null;
      }
      holding = false;
      setProgress({ attempt: 0, stage: "land", land: null });
      // (a seed typed as a word names the saved file, D345 B10)
      const word = seedText.trim();
      const seedWord = word && !/^\d+$/.test(word) && seedFromText(word) === s.seed ? word : undefined;
      const r = await (maker?.api ?? generator).generate(
        s,
        proxy((p: GenProgress) =>
          setProgress((q) =>
            p.kind === "stage"
              ? { attempt: p.attempt, stage: p.stage, land: q?.land ?? null, candidate: q?.candidate ?? null, said: sayStage(q?.said, p.stage, p.attempt) }
              : p.kind === "candidate"
                ? { attempt: p.attempt, stage: q?.stage ?? "check", land: q?.land ?? null, candidate: q?.candidate ?? p, said: q?.said }
                : { attempt: p.attempt, stage: q?.stage ?? "land", land: p, candidate: q?.candidate ?? null, said: q?.said },
          ),
        ),
        seedWord,
      );
      if (id !== runId.current) return null;
      maker?.stop();
      // (the end-to-end build lets a test make the first maps fail: dgm.forceFail)
      if (!r.passed || (globalThis as unknown as Window).dgm?.forceFail?.()) {
        if (shared) together.cancelAnnounce();
        const failed = `No valid map after ${r.attempts} attempts.${session ? " Try another seed." : ""}`;
        // the open map stays, and the seed box says its seed again, not the one that failed
        if (session?.kind === "generated" && session.spec) setSeedText(String(session.spec.seed));
        if (session) {
          // (one line in the notes, the open map staying as it was; no dialog dims it)
          setMaking(null);
          setError(failed);
          return null;
        }
        setError(failed);
        // with no map open yet (a link's map that fails its checks), the same settings with another seed, so the
        // page is never left without a map; the message says why
        if (tries < 5) {
          const seed = randomSeed();
          setSeedText(String(seed));
          setSeedPinned(false);
          return run({ ...s, seed }, tries + 1, true);
        }
        // (no map to show after all: the warm renderer goes)
        discardPreparedRenderer();
        return null;
      }
      shown = r;
      made++;
      performance.mark("dgm:generated");
      // the map is the editor's from the start: there is no step between making it and shaping it
      // (the name typed in the generator's panel names this map, not the one it replaces; it is set before a shared
      // session's guest is sent the map, so both players get the final name)
      const typed = nextNameRef.current?.trim();
      let named = false;
      if (shared) commit(true);
      const fresh = await replacing(async () => {
        const opened = await (shared ? generator.openProject(r.project) : generator.refine());
        if (!typed) return opened;
        const { result, info } = await generator.setName(typed);
        if (!result.ok) return opened;
        named = true;
        return { ...opened, info };
      }, shared);
      enterEditor(fresh, { kind: "generated" });
      // (a name given keeps the map in Your maps, as a rename does)
      if (named) {
        kept.current = true;
        saver.changed(entry.current!.id, snapshot);
      }
      performance.mark("dgm:opened");
      searchVersion(r);
      setMaking(null);
      return r;
    } catch (e) {
      if (id !== runId.current) return null;
      if (shared) together.cancelAnnounce();
      if (over && holding) setMaking({ failed: words(e) });
      else {
        // (a refusal over an open map is one line in the notes, the map staying: no dialog dims it)
        if (over) setMaking(null);
        setError(words(e));
      }
      return null;
    } finally {
      maker?.stop();
      if (maker) commit(false);
      if (sharedGen.current === maker) sharedGen.current = null;
      if (id === runId.current) {
        discardAllowed.current = false;
        setBusy(false);
        setProgress(null);
      }
    }
  }

  /** Cancel a map being made: the generator's work stops at once (its worker ends), and the map that was open comes
   *  back exactly as it was, its edits and history with it, the view where it was, in a new worker. */
  async function cancelMaking() {
    if (cancelling.current || committing.current) return;
    cancelling.current = true;
    runId.current++;
    stopBackground();
    // (a map made for a shared session is made in a worker of its own: stopping it leaves the session and its map as they are)
    if (sharedGen.current) {
      sharedGen.current.stop();
      sharedGen.current = null;
      together.cancelAnnounce();
      setMaking(null);
      setProgress(null);
      setBusy(false);
      cancelling.current = false;
      return;
    }
    setMaking("back");
    setProgress(null);
    try {
      // (the old worker lives until the open map's project has come from it: ended sooner, the call never answers and
      // the editor is left on a worker that is gone; investigation/page-hunt)
      const b = back.current ?? (backReady.current ? await backReady.current : null);
      // (a map being opened in the old worker never answers: the swap it began is over, and the editor takes edits again)
      switching.current = false;
      setReplacingMap(false);
      const old = gen;
      gen = createGeneratorWorker();
      generator = gen.api;
      void generator.deferChecks();
      old.stop();
      back.current = null;
      backReady.current = null;
      if (!b) return void setMaking(null);
      const [wasKeeping, wasState] = [keeping.current, saveState];
      enterEditor(await generator.openProject(b.bytes), { entry: b.entry, kept: b.kept }, undefined, true);
      keeping.current = wasKeeping;
      setSaveState(wasState);
      setMaking(null);
    } catch (e) {
      setMaking({ failed: words(e) });
    } finally {
      cancelling.current = false;
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
    // Let the worker load and accept its first RPC before GPU preparation holds the page.
    void generator.sessionInfo().then(() => prepareRenderer()).catch(() => discardPreparedRenderer());
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
            // (kept in Your maps, and the old copy cleared only once it is)
            const id = entry.current!.id;
            kept.current = true;
            saver.changed(id, snapshot);
            await saver.flush(id);
            if (keeping.current) await storage.clear();
            return;
          } catch {
            // (an autosave that can't be read: a new map instead)
          }
        }
      }
      await run(init.spec);
    })();
  }, []);

  /** Open a real place: its .timber is built in the worker and imported. Over an open map it takes seconds, so the
   *  progress dialog says so, with Cancel (the open map comes back as it was); before any map, the editor's frame says
   *  so. */
  async function openPlace(id: string, name?: string) {
    const run_ = ++runId.current;
    stopBackground();
    setError(null);
    setBusy(true);
    const over = !!session;
    if (over) {
      setMakingWords(name ? `Opening ${name}…` : "Opening the map…");
      setMaking("making");
    } else setOpening(name ? `Opening ${name}…` : "Opening the map…");
    const say = (w: string) => (over ? setMakingWords(w) : setOpening(w));
    // in a shared session the host builds the place in a worker of its own, as Generate does, so Cancel never ends the
    // session's worker; the guest is told first (§9)
    const shared = over && together.isHost;
    const maker = shared ? createBackground() : null;
    sharedGen.current = maker;
    if (shared) together.announce("a new map");
    try {
      if (over && entry.current && !(await holdBack(run_, "opening a real place"))) {
        if (shared) together.cancelAnnounce();
        return;
      }
      const found = (await fetchIndex()).places.find((p) => p.id === id);
      if (!found) throw new Error(`there is no real place called "${id}"`);
      say(`Opening ${found.name}…`);
      const bytes = await fetchPlace(id);
      if (run_ !== runId.current) return;
      let load = async () => generator.openPlace(bytes);
      if (maker) {
        await maker.api.openPlace(bytes);
        const built = await maker.api.project();
        if (run_ !== runId.current) return;
        maker.stop();
        load = () => generator.openProject(built.bytes);
        commit(true);
      }
      const data = await replacing(load, shared);
      if (run_ !== runId.current && !shared) return;
      enterEditor(data, { kind: "place" }, id);
      back.current = null;
      setMaking(null);
    } catch (e) {
      if (run_ !== runId.current) return;
      if (shared) together.cancelAnnounce();
      const problem = `The real place could not be opened: ${words(e)}`;
      if (over) setMaking({ failed: problem });
      else {
        // (the words at once, and a map made instead: it never leaves the page without one)
        setError(problem);
        setOpening(null);
        await run(init.spec, 0, true);
      }
    } finally {
      maker?.stop();
      if (maker) commit(false);
      if (sharedGen.current === maker) sharedGen.current = null;
      if (run_ === runId.current) {
        discardAllowed.current = false;
        setOpening(null);
        setBusy(false);
      }
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

  /** Showcase mode (D488 (2)): its search runs in a worker of its own; a pick opens as a version found in the
   *  background does (`openVersion`, the normal open path). */
  const showcase = useShowcase({
    spec,
    takeSpec: () => {
      // (an opened file has no seed of its own: one is rolled, shown in the box, as Generate does)
      if (!blank) return spec;
      const seed = randomSeed();
      setBlank(false);
      setSeedText(String(seed));
      setSeedPinned(false);
      return { ...spec, seed };
    },
    panelOpen: panel === "generator",
    showPanel: () => setPanel("generator"),
    openPick: (p) =>
      guard(
        () =>
          void openVersion(p.response).catch((e) => setError(words(e))),
        "Opening a showcase map",
      ),
    shownSpec: session?.kind === "generated" ? (session.spec ?? null) : null,
  });

  // ---------------------------------------------------------------------------------- render

  const drawer: GeneratorModel = {
    spec,
    seedText,
    blank,
    onSeed: (t) => {
      setBlank(false);
      setSeedText(t);
      setSeedPinned(t.trim() !== "");
    },
    seedPinned,
    onUnpinSeed: () => {
      unblank();
      setSeedPinned(false);
    },
    onPinSeed: () => {
      unblank();
      setSeedPinned(true);
    },
    onSize: chooseSize,
    onTheme: chooseTheme,
    onSettings: (s) => {
      unblank();
      setSettings(s);
    },
    onReset: () => {
      unblank();
      setSettings(defaultSettings(theme, difficulty, size));
    },
    busy,
    changed,
    onGenerate: () => guard(() => generate(), "Generating a new map"),
    onSurprise: () => guard(() => generate({ theme: "any" }), "Generating a new map"),
    onAnother: () => guard(() => void anotherLikeThis(), "Another like this"),
    canAnother: session?.kind === "generated",
    // (the open map's tile says its name as soon as it is renamed)
    maps: maps.map((e) => rowOf(e.id === entry.current?.id && name ? { ...e, name } : e)),
    current: entry.current?.id ?? null,
    onOpenMap: (id) => guard(() => void openMap(id), "Opening another map"),
    onOpenPlace: (id, name) => guard(() => void openPlace(id, name), "Opening a real place"),
    onDownloadMap: (id) => void downloadMap(id),
    onRenameMap: renameMap,
    onDeleteMaps: deleteMaps,
    onCompareMap: (id) => void compareWith(id),
    openSize: session ? { w: session.W, h: session.H } : undefined,
    name,
    nextName,
    onNextName: setNextName,
    showcase: showcase.model,
  };

  // the confirm dialog: focus on Cancel, or on its yes when it says so (a delete: Enter confirms), or on Download project
  // where it offers one, lit (Kyler, 2026-10-05: Enter keeps the player's work); Esc cancels, and goes no further
  // (autoFocus works once a page in some browsers: the focus is set here)
  const confirmNo = useRef<HTMLButtonElement>(null);
  const confirmYes = useRef<HTMLButtonElement>(null);
  const confirmProject = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!confirm) return;
    (confirm.offerProject ? confirmProject : confirm.focusYes ? confirmYes : confirmNo).current?.focus();
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
      if (e.key === "Escape" && making === "making" && !sealed) {
        e.preventDefault();
        void cancelMaking();
      } else if (e.key !== "Tab") e.preventDefault();
    };
    window.addEventListener("keydown", hold, true);
    return () => window.removeEventListener("keydown", hold, true);
  }, [making, sealed]);
  const makingDialog = making ? (
    <div class="dialog-backdrop making-backdrop">
      <div class="dialog making-dialog" role={typeof making === "object" ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby="making-words">
        <p id="making-words" role="status">
          {typeof making === "object" ? making.failed : making === "back" ? "Opening your map…" : sealed ? "Opening the map…" : (makingWords ?? stageText(progress))}
        </p>
        {typeof making === "object" ? null : <MakingCount progress={making === "making" && !makingWords && !sealed ? progress : null} />}
        {typeof making === "object" ? null : <MakingWater />}
        <footer>
          {typeof making === "object" ? (
            <button type="button" class="ghost" title="Back to the map" onClick={() => setMaking(null)} autoFocus>
              Close
            </button>
          ) : (
            <button type="button" class="ghost" disabled={making === "back" || sealed} {...(sealed ? tip("The map is opening") : tip("Stop making the map", "Esc"))} onClick={() => void cancelMaking()} autoFocus>
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
            <button ref={confirmProject} type="button" class="primary" title="Download the map and its edits as a project" onClick={() => void generator.project().then((p) => saveFile(p.bytes, p.fileName, "application/gzip"))}>
              Download project
            </button>
          ) : null}
          <button
            type="button"
            ref={confirmYes}
            class={confirm.offerProject ? "ghost" : "primary"}
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
      {/* (the note has no full stop of its own; the space keeps the words and the button apart where the dock lays them out as text) */}
      {version.note}.{" "}
      <button type="button" class="linkish" title="Open the version that was found" onClick={() => (refuseGuest() ? setVersion(null) : void openVersion(version.response, true))}>
        Open it
      </button>
      <button type="button" class="linkish" aria-label="Dismiss" title="Dismiss this message" onClick={() => setVersion(null)}>
        ×
      </button>
    </p>
  ) : showcase.notice ? (
    <p class="error floating quiet" role="status">
      {showcase.notice.text}
      {" "}
      <button type="button" class="linkish" title="Show the maps the search found" onClick={showcase.notice.show}>
        Show them
      </button>
      <button type="button" class="linkish" aria-label="Dismiss" title="Dismiss this message" onClick={showcase.notice.dismiss}>
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
    // before any map is on show (a link, a reload, a place opened first): the editor's frame, still, with the first look
    // of the land in the map's place and the progress dialog over it (no Cancel: there is no map to go back to)
    const words = opening ?? (opened ? "Opening the editor…" : stageText(progress));
    // a first map that failed (and nothing running): the dialog says why, with one way on; the message is its words
    const stuck = !busy && !opened && !!error;
    const again = () => {
      const seed = randomSeed();
      setSeedText(String(seed));
      setSeedPinned(false);
      setError(null);
      void run({ ...spec, seed });
    };
    return (
      <>
        {FrameMod ? (
          <FrameMod name="Your map" subtitle={`${size.x}×${size.y}`}>
            <FirstLook progress={progress} quiet />
          </FrameMod>
        ) : (
          <div class="placeholder page-wait" role="status">
            <p>{words}</p>
          </div>
        )}
        {FrameMod ? (
          <div class={`dialog-backdrop making-backdrop${stuck ? " stuck" : ""}`}>
            <div class="dialog making-dialog" role={stuck ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby="making-words">
              <p id="making-words" role="status">
                {stuck ? error : words}
              </p>
              {stuck ? null : <MakingCount progress={opening ? null : progress} />}
              {stuck ? null : <MakingWater />}
              {stuck ? (
                <footer>
                  <button type="button" class="primary" title="Make a map with another seed" onClick={again}>
                    Make a new map
                  </button>
                </footer>
              ) : null}
            </div>
          </div>
        ) : null}
        {stuck && FrameMod ? null : message}
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
        onResized={(c) => void resized(c)}
        replacing={replacingMap}
        onPendingEdits={(wait) => (pendingEdits.current = wait)}
        onOpenFile={openFile}
        saveState={saveState}
        name={name}
        onRename={rename}
        onPicture={(get) => (picture.current = get)}
        drawer={drawer}
        drawerOpen={panel === "generator"}
        onDrawer={(o) => setPanel(o ? "generator" : null)}
        mapsOpen={panel === "maps"}
        onMaps={(o) => setPanel(o ? "maps" : null)}
        placesOpen={panel === "places"}
        onPlaces={(o) => setPanel(o ? "places" : null)}
        keepView={opened.keepView}
        carry={opened.carry}
        compare={compare}
        onStopCompare={() => setCompare(null)}
        onKeepStep={(k, branch) => void keepStep(k, branch)}
        notice={message}
        together={together}
      />
      {confirmDialog}
      {makingDialog}
    </>
  );
}
