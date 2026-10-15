// A force's rolls (force variants, D488): every roll Try another makes on a force's step is kept, and
// the player shows the next or the one before (Tab, Shift+Tab) at once, each a real result, never
// worked out again. The history holds one step for the force, the roll shown (labelled with it);
// undo takes the step back whole, redo brings back the roll that was shown, and a saved project
// holds only that roll, exactly as kept. Up to MAX_ROLLS; a new one past that drops the oldest.
//
// The rolls are steps kept as the history had them (`MapSession.keptStep`): their operations, the map
// they built and the next operation number, put back exactly (`putStep`), so showing a roll is a
// copy's cost (D453). Each also keeps the settings it ran with (what its Auto details took, D309) and
// the water it was showing when it was last shown (the caller's, `W`: water in flight carries on from
// it; settled water is in its map already).

import { labelOf, type KeptStep, type MapSession } from "../doc/session";

/** The most rolls a force's step keeps. */
export const MAX_ROLLS = 8;

interface Roll<S, W> {
  step: KeptStep;
  settings: S;
  water: W | null;
}

export class ForceRolls<S, W = unknown> {
  private readonly list: Roll<S, W>[] = [];
  private at = -1;
  /** The history's step the roll shown stands as (the session's own, compared by identity). */
  private entry: unknown = null;
  /** The roll shown when Try another took it back (`dropLatest` shows it again); −1: none. */
  private prior = -1;
  /** The next operation number after every roll made: a new roll's operations are numbered past all of
   *  them, so no two rolls share a number (the checks' replica follows the log by its numbers). */
  private highest = 0;

  constructor(private readonly session: MapSession) {}

  /** How many rolls are kept. */
  get count(): number {
    return this.list.length;
  }

  /** Which is shown (0: the oldest kept), −1 before the first. */
  get shown(): number {
    return this.at;
  }

  /** The roll shown is the latest step of the history (an edit since, or its undo, ends that; redo
   *  brings it back). */
  get live(): boolean {
    return this.at >= 0 && this.entry !== null && this.session.latestStep()?.step === this.entry;
  }

  /** The settings the roll shown ran with. */
  get settings(): S | null {
    return this.list[this.at]?.settings ?? null;
  }

  /** The water the roll shown last had in flight (null: none, or its map's own settled water). */
  get water(): W | null {
    return this.list[this.at]?.water ?? null;
  }

  /** The history's label for roll `k`: its force's, and which roll when there are several. */
  private label(k: number): string {
    const s = this.list[k].step;
    const own = s.label ?? labelOf(s.ops[0]);
    return this.list.length > 1 ? `${own}, roll ${k + 1}` : own;
  }

  /** The step just kept is a new roll, shown: the first of a force's step, or Try another's (after
   *  `takeBack`). The oldest goes past MAX_ROLLS. False when there is no step. */
  add(settings: S, water: W | null = null): boolean {
    const step = this.session.keptStep();
    if (!step) return false;
    this.list.push({ step, settings, water });
    this.highest = Math.max(this.highest, step.nextSeq);
    // (past MAX_ROLLS the oldest goes, but never the roll that was shown before this one: Esc after the keep
    // shows it again, D341, and it is the one the player was looking at)
    if (this.list.length > MAX_ROLLS) {
      const drop = this.prior === 0 ? 1 : 0;
      this.list.splice(drop, 1);
      if (this.prior > drop) this.prior--;
    }
    this.at = this.list.length - 1;
    this.entry = this.session.latestStep()!.step;
    // (named with its roll once there are several: put back as it is, under that name)
    if (this.list.length > 1) this.reput(this.at);
    return true;
  }

  /** The roll shown as it stands now (its water settled into its map since, `water` in flight). */
  private refresh(water: W | null): void {
    if (!this.live) return;
    const step = this.session.keptStep();
    if (step) this.list[this.at] = { ...this.list[this.at], step: { ...step, label: this.list[this.at].step.label }, water };
  }

  /** The roll shown's step taken back (Try another keeps its roll from the same place). False, and
   *  nothing changes, when it is not the latest step. */
  takeBack(water: W | null = null): boolean {
    if (!this.live) return false;
    this.refresh(water);
    const top = this.session.latestStep();
    // (the next operation numbered past every roll's)
    if (!top || !this.session.takeBack({ ...top, seq: Math.max(top.seq, this.highest) })) return false;
    this.entry = null;
    this.prior = this.at;
    return true;
  }

  /** The roll shown put back as it was (Try another's roll refused after `takeBack`). */
  restore(): boolean {
    this.prior = -1;
    return this.at >= 0 && this.entry === null && this.reput(this.at, false);
  }

  /** Roll `k` shown in place of the one shown (`water`: the shown one's in flight, kept with it). One
   *  line why not, or null. */
  show(k: number, water: W | null = null): string | null {
    if (!this.live) return "Use a force first: its rolls are on offer right after it";
    if (k < 0 || k >= this.list.length) return `There is no roll ${k + 1}: ${this.list.length === 1 ? "there is one" : `there are ${this.list.length}`}`;
    if (k === this.at) return null;
    this.refresh(water);
    const top = this.session.latestStep();
    if (!top || !this.session.takeBack(top)) return "Something changed the map since: undo takes the force back";
    this.entry = null;
    const was = this.at;
    this.at = k;
    if (this.reput(k, false)) return null;
    // (never expected: the roll shown before comes back)
    this.at = was;
    this.reput(was, false);
    return "That roll no longer fits the map";
  }

  /** The next roll (`dir` 1, after the last the first) or the one before (−1). As `show`. */
  step(dir: 1 | -1, water: W | null = null): string | null {
    const n = this.list.length;
    return this.show((((this.at + dir) % n) + n) % n, water);
  }

  /** The latest roll taken out, as if never kept (Esc whose keep was on its way, D341): the roll shown
   *  before it comes back. False, and nothing changes, when it is not the latest step. */
  dropLatest(): boolean {
    const previous = this.prior;
    if (!this.live || this.at !== this.list.length - 1 || previous < 0 || previous >= this.at) return false;
    const top = this.session.latestStep();
    if (!top || !this.session.takeBack(top)) return false;
    this.entry = null;
    this.list.pop();
    this.at = previous;
    return this.reput(previous, false);
  }

  /** Only the roll shown is kept (the player moved on, D488: whatever roll shows then is the one that
   *  stays); the others' maps are let go. */
  settle(): void {
    if (this.at < 0 || this.list.length <= 1) return;
    const keep = this.list[this.at];
    this.list.length = 0;
    this.list.push(keep);
    this.at = 0;
  }

  /** Roll `k` as the latest step, under its label (`takenBack` false: the history is already where it
   *  was made). */
  private reput(k: number, takenBack = true): boolean {
    if (takenBack) {
      const top = this.session.latestStep();
      if (!top || !this.session.takeBack(top)) return false;
      this.entry = null;
    }
    if (!this.session.putStep(this.list[k].step, this.label(k))) return false;
    this.entry = this.session.latestStep()!.step;
    return true;
  }
}
