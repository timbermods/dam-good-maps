import { DurableObject } from "cloudflare:workers";
import { signToken, takeDaily, verifyToken } from "./room";
import type { DayCount, Result } from "./room";
import type { Env } from "./env";

/**
 * The function's one persistent record outside the rooms: the day's count of relay logins handed out (the ceiling on
 * the bill) and the key that signs session tokens (made on first use, kept here, never leaving the Worker).
 */
export class Keeper extends DurableObject<Env> {
  private key: Uint8Array | null = null;

  private async secret(): Promise<Uint8Array> {
    if (this.key) return this.key;
    const stored = await this.ctx.storage.get<Uint8Array>("tokenKey");
    if (stored) return (this.key = stored);
    const fresh = crypto.getRandomValues(new Uint8Array(32));
    await this.ctx.storage.put("tokenKey", fresh);
    return (this.key = fresh);
  }

  /** One more relay login today, or false when the day's cap is reached. */
  async takeMint(cap: number): Promise<boolean> {
    const result = takeDaily(await this.ctx.storage.get<DayCount>("mints"), Date.now(), cap);
    if (result.allowed) await this.ctx.storage.put("mints", result.state);
    return result.allowed;
  }

  async issueToken(sessionId: string, ttlMs: number): Promise<string> {
    return signToken(await this.secret(), sessionId, Date.now(), ttlMs);
  }

  async checkToken(token: string): Promise<Result<{ sessionId: string }>> {
    return verifyToken(await this.secret(), token, Date.now());
  }
}
