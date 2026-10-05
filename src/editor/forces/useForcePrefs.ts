// The forces' rows: each force's settings, what the player pinned, Slow forces and the Floor, kept
// between visits.

import { useEffect, useMemo, useRef, useState, type Dispatch, type StateUpdater } from "preact/hooks";
import { DEFAULT_CARVE, type CarveUi } from "../CarveRow";
import { DEFAULT_CRATER, DEFAULT_ERUPT, DEFAULT_QUAKE, type CraterUi, type EruptUi, type QuakeUi } from "../ForceRows";
import { DEFAULT_DEPOSIT, DEFAULT_GLACIATE, DEFAULT_RIFT, type DepositUi, type GlaciateUi, type RiftUi } from "../ForceRows";
import type { Verb } from "../../core/forces/op";
import { loadForcesPrefs, saveForcesPrefs } from "../prefs/forcesPrefs";
import type { Ed } from "../ed";

export interface ForcePrefsSlice {
  carveUi: CarveUi;
  setCarveUi: Dispatch<StateUpdater<CarveUi>>;
  carveUiRef: { current: CarveUi };
  craterUi: CraterUi;
  setCraterUi: Dispatch<StateUpdater<CraterUi>>;
  craterUiRef: { current: CraterUi };
  eruptUi: EruptUi;
  setEruptUi: Dispatch<StateUpdater<EruptUi>>;
  eruptUiRef: { current: EruptUi };
  quakeUi: QuakeUi;
  quakeUiRef: { current: QuakeUi };
  setQuakeUi: (u: QuakeUi) => void;
  glaciateUi: GlaciateUi;
  setGlaciateUi: Dispatch<StateUpdater<GlaciateUi>>;
  glaciateUiRef: { current: GlaciateUi };
  riftUi: RiftUi;
  setRiftUi: (u: RiftUi) => void;
  riftUiRef: { current: RiftUi };
  depositUi: DepositUi;
  setDepositUi: (u: DepositUi) => void;
  depositUiRef: { current: DepositUi };
  moreOpen: Partial<Record<Verb, boolean>>;
  setMoreOpen: Dispatch<StateUpdater<Partial<Record<Verb, boolean>>>>;
  watch: boolean;
  setWatch: Dispatch<StateUpdater<boolean>>;
  watchRef: { current: boolean };
  floorRef: { current: number };
  floorContext: { value: number; set: Dispatch<StateUpdater<number>> };
  setForceTick: Dispatch<StateUpdater<number>>;
}

export function useForcePrefs(ed: Ed): ForcePrefsSlice {
  // ------------------------------------------------------------------------------ the forces

  /** Each force's options for the next one (D199, D202, D203, D206; kept for the visit), Aim's start,
   *  and the tile the pointer is on while aiming. Each row's details, behind More, start on Auto
   *  (null) unless a pin was remembered from a past visit (D309). */
  const [forcesPrefs] = useState(loadForcesPrefs);
  const [carveUi, setCarveUi] = useState<CarveUi>({ ...DEFAULT_CARVE, ...forcesPrefs.carve });
  const carveUiRef = useRef(carveUi);
  carveUiRef.current = carveUi;
  const [craterUi, setCraterUi] = useState<CraterUi>({ ...DEFAULT_CRATER, ...forcesPrefs.craterize });
  const craterUiRef = useRef(craterUi);
  craterUiRef.current = craterUi;
  const [eruptUi, setEruptUi] = useState<EruptUi>({ ...DEFAULT_ERUPT, ...forcesPrefs.erupt });
  const eruptUiRef = useRef(eruptUi);
  eruptUiRef.current = eruptUi;
  const [quakeUi, setQuakeUiState] = useState<QuakeUi>({ ...DEFAULT_QUAKE, ...forcesPrefs.quake });
  const quakeUiRef = useRef(quakeUi);
  quakeUiRef.current = quakeUi;
  const setQuakeUi = (u: QuakeUi) => {
    quakeUiRef.current = u;
    setQuakeUiState(u);
  };
  const [glaciateUi, setGlaciateUi] = useState<GlaciateUi>({ ...DEFAULT_GLACIATE, ...forcesPrefs.glaciate });
  const glaciateUiRef = useRef(glaciateUi);
  glaciateUiRef.current = glaciateUi;
  const [riftUi, setRiftUiState] = useState<RiftUi>({ ...DEFAULT_RIFT, ...forcesPrefs.rift });
  const riftUiRef = useRef(riftUi);
  riftUiRef.current = riftUi;
  const setRiftUi = (u: RiftUi) => {
    riftUiRef.current = u;
    setRiftUiState(u);
  };
  const [depositUi, setDepositUiState] = useState<DepositUi>({ ...DEFAULT_DEPOSIT, ...forcesPrefs.deposit });
  const depositUiRef = useRef(depositUi);
  depositUiRef.current = depositUi;
  const setDepositUi = (u: DepositUi) => {
    depositUiRef.current = u;
    setDepositUiState(u);
  };
  /** Whether each force's More is open (D309): closed by default, remembered while it stays open. */
  const [moreOpen, setMoreOpen] = useState<Partial<Record<Verb, boolean>>>(forcesPrefs.more);
  /** Slow forces (D321, item 29): the forces played out slowly to be watched; off, Fast. Remembered. */
  const [watch, setWatch] = useState(forcesPrefs.watch);
  const watchRef = useRef(watch);
  watchRef.current = watch;
  /** The forces' Floor (D321, item 40): the lowest level any of them cuts to, shared, remembered. */
  const [floor, setFloor] = useState(forcesPrefs.floor);
  const floorRef = useRef(floor);
  floorRef.current = floor;
  const floorContext = useMemo(() => ({ value: floor, set: setFloor }), [floor]);
  // the pins and the open More panels are remembered with the player's other editor preferences
  // (D309); Power, Size, dry and mode last only the visit, as before
  useEffect(() => {
    saveForcesPrefs({
      watch,
      floor,
      more: moreOpen,
      carve: { wander: carveUi.wander, walls: carveUi.walls, depth: carveUi.depth, riverDepth: carveUi.riverDepth, banks: carveUi.banks },
      craterize: { walls: craterUi.walls, centre: craterUi.centre, debris: craterUi.debris, rays: craterUi.rays },
      erupt: { shape: eruptUi.shape, summit: eruptUi.summit, flows: eruptUi.flows, ridges: eruptUi.ridges },
      quake: { scarp: quakeUi.scarp },
      glaciate: { benches: glaciateUi.benches, steps: glaciateUi.steps, tarn: glaciateUi.tarn, scree: glaciateUi.scree },
      rift: { walls: riftUi.walls },
      deposit: { channels: depositUi.channels },
    });
  }, [watch, floor, moreOpen, carveUi.wander, carveUi.walls, carveUi.depth, carveUi.riverDepth, carveUi.banks, craterUi.walls, craterUi.centre, craterUi.debris, craterUi.rays, eruptUi.shape, eruptUi.summit, eruptUi.flows, eruptUi.ridges, quakeUi.scarp, glaciateUi.benches, glaciateUi.steps, glaciateUi.tarn, glaciateUi.scree, riftUi.walls, depositUi.channels]);
  const [, setForceTick] = useState(0);

  return {
    carveUi, setCarveUi, carveUiRef, craterUi, setCraterUi, craterUiRef, eruptUi, setEruptUi, eruptUiRef, quakeUi,
    quakeUiRef, setQuakeUi, glaciateUi, setGlaciateUi, glaciateUiRef, riftUi, setRiftUi, riftUiRef, depositUi, setDepositUi, depositUiRef, moreOpen, setMoreOpen, watch, setWatch,
    watchRef, floorRef, floorContext, setForceTick
  };
}
