// What the worker tells the page about the water, and what the water bar then reads (PLAN §20 D345, B14; D342).
// The page has one water journey at a time (`WaterPlayer`), begun by an update that leaves water to settle and
// ended by the worker's word that it has settled. The worker gives that word on three channels: an update's
// answer (`waterSettled`), the events it sends between answers (the frames, then `settled`), and a check's
// answer. Any one of them ends the journey, in whatever order they come, so the bar never waits on news that
// was dropped, late or early: news for a version the page has not reached yet is held until its update arrives,
// news for an older version is ignored, and a `settled` for the current version always ends the journey.
//
// Pure of the page (no DOM, no React): `tests/unit/waterJourney.test.ts` and `tests/contract/waterStatus.test.ts`
// deliver the worker's real messages in every order and read the bar's state after each.

import type { WaterView } from "../render3d/model";
import type { ViewUpdate } from "../worker/session";
import type { WaterPlayer } from "./waterPlayer";

/** The events of the water's journey: a frame on its way, and the settled water. */
export type WaterNews =
  | { kind: "water"; version: number; water: WaterView; done: number }
  | { kind: "settled"; version: number; view: ViewUpdate };

export interface JourneyHost {
  applyView(v: ViewUpdate): void;
  /** The water the map shows now. */
  mapWater(): WaterView;
  /** The settled water is in place (Max water depth's few words wait for it, D264). */
  settledInPlace(): void;
}

export class WaterJourney {
  /** The version of the map the page shows. */
  private version = -1;
  private held: WaterNews[] = [];
  /** The version whose water the worker has said is settled: a frame of it that comes after is late, and
   *  would start a journey nothing will end. */
  private settledVersion = -1;

  constructor(
    private readonly player: WaterPlayer,
    private readonly host: JourneyHost,
  ) {}

  /** The worker answered an update, and the page now shows its version. */
  update(u: { ok: boolean; waterSettled?: boolean; view: ViewUpdate }, version: number): void {
    this.version = version;
    if (u.ok) {
      // (an update whose water is settled starts no journey: nothing will come to end it)
      if (u.waterSettled) {
        this.settledVersion = version;
        this.player.settled();
      } else {
        this.settledVersion = -1;
        this.player.begin({ water: u.view.water ?? this.host.mapWater(), done: 0 });
      }
    }
    // news that came before the page reached its version
    const held = this.held;
    this.held = [];
    for (const e of held) this.news(e);
  }

  /** A frame or the settled water from the worker. */
  news(e: WaterNews): void {
    if (e.version < this.version) return;
    if (e.version > this.version) {
      // (only the latest frame of a version is worth holding: each is a whole map's water)
      this.held = this.held.filter((h) => !(h.kind === "water" && e.kind === "water" && h.version === e.version));
      this.held.push(e);
      return;
    }
    if (e.kind === "water") {
      if (e.version !== this.settledVersion) this.player.push({ water: e.water, done: e.done });
      return;
    }
    this.settledVersion = e.version;
    // (no water in it: the worker sent it before, so it is the last settled water the journey has, not the frame on screen)
    this.player.push({
      water: e.view.water ?? this.latestWater(),
      done: 1,
      final: () => {
        this.host.applyView(e.view);
        this.host.settledInPlace();
      },
    });
  }

  /** The water the worker's news that carries none means: what the page was last sent. That is the last settled
   *  frame of the journey, shown or waiting (the page's copy of the map's water is behind while the journey is), else
   *  the map's own. */
  private latestWater(): WaterView {
    return this.player.settledWater ?? this.host.mapWater();
  }

  /** A background check's answer: the canonical water it put in place, and whether a settle still runs. */
  check(r: { view: ViewUpdate; waterSettled?: boolean }): void {
    // (a journey playing ends here when the worker says the water is settled, whether or not this answer
    // carries water: the check may have put it in place and stopped the worker's own settle)
    if (r.waterSettled) this.settledVersion = this.version;
    if (this.player.playing && (r.view.water || r.waterSettled)) {
      this.player.push({ water: r.view.water ?? this.latestWater(), done: 1, final: () => this.host.applyView(r.view) });
    } else this.host.applyView(r.view);
  }
}
