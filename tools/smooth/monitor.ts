// The load sampler, running beside the series: load.ps1 appends a line a second; this reads them.

import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { judgeRun, isQualified, RULES, type LoadRules, type LoadSample, type RunLoad } from "./load";

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class LoadMonitor {
  private child: ChildProcess;
  private lease = false;
  private since = 0;

  constructor(
    readonly file: string,
    readonly rules: LoadRules = RULES,
    /** false: load is recorded but never waited for or discarded on (for trying the tool on a busy machine; results are not evidence). */
    readonly enforce = true,
  ) {
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, "");
    this.child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(import.meta.dirname, "load.ps1"), "-ParentPid", String(process.pid), "-Output", file], {
      windowsHide: true,
      stdio: "ignore",
    });
  }

  private cache: LoadSample[] = [];
  private pos = 0;
  private partial = "";

  /** Every sample so far (the file is read from where the last read stopped). */
  rows(): LoadSample[] {
    if (!existsSync(this.file)) return this.cache;
    const size = statSync(this.file).size;
    if (size > this.pos) {
      const fd = openSync(this.file, "r");
      const buf = Buffer.alloc(size - this.pos);
      readSync(fd, buf, 0, buf.length, this.pos);
      closeSync(fd);
      this.pos = size;
      const lines = (this.partial + buf.toString("utf8")).split("\n");
      this.partial = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        try {
          this.cache.push(JSON.parse(line) as LoadSample);
        } catch {
          /* not a sample */
        }
      }
    }
    return this.cache;
  }

  /** Wait for a qualified minute (the run's lease); false after the rules' give-up time. Once qualified, stays so until a run is discarded. */
  async qualify(): Promise<boolean> {
    if (this.lease || !this.enforce) return true;
    const start = Date.now();
    let said = false;
    while (Date.now() - start < this.rules.giveUpMs) {
      if (isQualified(this.rows(), Date.now(), this.rules)) {
        this.lease = true;
        return true;
      }
      if (!said) console.log("  waiting for the machine to be quiet (outside CPU at most 25% for 60 s) ...");
      said = true;
      await sleep(1000);
    }
    return false;
  }

  /** A run's timed part ended: whether it may be kept (waits a moment for the sample that brackets its end). */
  async judge(from: number, to: number): Promise<RunLoad> {
    const until = Date.now() + this.rules.maxGapMs;
    while (Date.now() < until && !this.rows().some((s) => s.at >= to)) await sleep(250);
    const result = judgeRun(this.rows(), from, to, this.rules);
    if (!this.enforce) return { ...result, valid: true, reason: result.valid ? undefined : `ignored: ${result.reason}` };
    if (!result.valid) this.lease = false; // requalify before the next run
    return result;
  }

  close(): void {
    this.child.kill();
  }
}
