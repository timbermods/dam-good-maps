import { DurableObject } from "cloudflare:workers";
import { SlidingWindow } from "./room";
import type { Env } from "./env";

/** One per address and kind of call (rooms made, join tries). Its counts live in memory only. */
export class Limiter extends DurableObject<Env> {
  private window: SlidingWindow | null = null;

  /** True if this call is allowed. */
  async hit(limit: number, windowMs: number): Promise<boolean> {
    this.window ??= new SlidingWindow(limit, windowMs);
    return this.window.allow("x", Date.now());
  }
}
