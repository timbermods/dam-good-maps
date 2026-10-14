import { DurableObject } from "cloudflare:workers";
import { LIMITS, err, signToken, takeDaily, takeKeyed, takeRenewal, verifyToken } from "./room";
import type { DayCount, KeyedDay, Renewals, Result } from "./room";
import type { Env } from "./env";

export type MintVerdict = "ok" | "busy" | "address";

/**
 * The function's one persistent record outside the rooms: the day's count of relay logins handed out, in all and per
 * address (a limit on logins, not on bytes: what the relay carries is billed by Cloudflare, so the billing alert is the real
 * ceiling), what each session token has used, and the key that signs session tokens (made on first use, kept here, never
 * leaving the Worker).
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

  /** One more relay login today for this address: "ok", or "address" / "busy" when that address's or the day's cap is reached. */
  async takeMint(cap: number, address: string, perAddressCap: number): Promise<MintVerdict> {
    const now = Date.now();
    const byAddress = takeKeyed(await this.ctx.storage.get<KeyedDay>("addressMints"), now, address, perAddressCap);
    if (!byAddress.allowed) return "address";
    const total = takeDaily(await this.ctx.storage.get<DayCount>("mints"), now, cap);
    if (!total.allowed) return "busy";
    await this.ctx.storage.put({ addressMints: byAddress.state, mints: total.state });
    return "ok";
  }

  async issueToken(sessionId: string, ttlMs: number): Promise<string> {
    return signToken(await this.secret(), sessionId, Date.now(), ttlMs);
  }

  /** A session token being used for a fresh login: valid, and within its own budget of renewals. */
  async redeemToken(token: string, maxRenewals: number = LIMITS.tokenRenewals): Promise<Result<{ sessionId: string }>> {
    const now = Date.now();
    const valid = await verifyToken(await this.secret(), token, now);
    if (!valid.ok) return valid;
    const used = takeRenewal(await this.ctx.storage.get<Renewals>("renewals"), valid.jti, valid.exp, now, maxRenewals);
    if (!used.allowed) return err("rate-limited", "This session has renewed its relay login as often as it may.");
    await this.ctx.storage.put("renewals", used.state);
    return { ok: true, sessionId: valid.sessionId };
  }
}
