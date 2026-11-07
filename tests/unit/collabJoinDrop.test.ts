// A connection that ends before the other player is in the session on it (src/collab/client.ts, together.ts, D486): the join
// did not happen, and both players are told so plainly. The guest is never left on "Joining…" and the host never waits on a
// spent code. A drop after the session got going is a pause, as before. The connection and the worker are stand-ins here; the
// real ones are in tests/collab.
import { describe, expect, test, vi } from "vitest";
import { CollabClient } from "../../src/collab/client";
import { MESSAGES } from "../../src/collab/errors";
import { Together } from "../../src/collab/together";

type Fake = {
  role: "host" | "guest";
  emit(event: string, value: unknown): void;
  connected(): void;
};
const made = vi.hoisted(() => [] as Fake[]);

vi.mock("../../src/collab/transport", () => {
  class FakeTransport {
    sessionId: string | null;
    private listeners = new Map<string, Set<(v: unknown) => void>>();
    private settle!: { resolve(): void; reject(e: unknown): void };
    private readonly settled = new Promise<void>((resolve, reject) => (this.settle = { resolve, reject }));
    constructor(
      readonly role: "host" | "guest",
      options: { sessionId?: string },
    ) {
      this.sessionId = options.sessionId ?? (role === "host" ? "session-1" : null);
      this.settled.catch(() => undefined);
      made.push(this);
    }
    on(event: string, fn: (v: unknown) => void) {
      const set = this.listeners.get(event) ?? new Set();
      set.add(fn);
      this.listeners.set(event, set);
      return () => void set.delete(fn);
    }
    emit(event: string, value: unknown) {
      for (const fn of [...(this.listeners.get(event) ?? [])]) fn(value);
    }
    connect() {
      return this.settled;
    }
    /** Connected through the relay: the transport's `connected`. */
    connected() {
      this.sessionId ??= "session-1";
      this.emit("connected", { peer: { epoch: "e" }, sessionId: this.sessionId });
      this.settle.resolve();
    }
    close() {
      this.settle.reject(new Error("closed"));
    }
    send() {
      return Promise.resolve();
    }
    sendPresence() {
      return true;
    }
  }
  return {
    hostSession: (o: { sessionId?: string } = {}) => new FakeTransport("host", o),
    joinSession: (_code: string, o: { sessionId?: string } = {}) => new FakeTransport("guest", o),
  };
});

/** The worker's side, answering `detach` with whether the other player was in the session on that connection. */
function worker(joinedOnLink: boolean) {
  let listener: ((e: unknown) => void) | null = null;
  return {
    listen: async (fn: (e: unknown) => void) => void (listener = fn),
    begin: async () => ({ ok: true as const, sessionId: null }),
    attach: async () => undefined,
    detach: async () => joinedOnLink,
    leave: async () => undefined,
    receive: async () => null,
    plan: async () => ({ target: null }),
    /** The worker tells the page something (joined, paused). */
    tell: (e: unknown) => listener?.(e),
  };
}

function page(w: ReturnType<typeof worker>) {
  return new Together({
    worker: () => w as never,
    hasMap: () => true,
    open: () => undefined,
    keep: () => undefined,
    prepare: async () => undefined,
    client: () => new CollabClient(w as never, { baseUrl: "http://127.0.0.1:9" }),
  });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a connection that ends before the join completes", () => {
  test("the guest is told and is back to Join, never left on Joining…", async () => {
    made.length = 0;
    const together = page(worker(false));
    const joining = together.join("ABC234");
    await vi.waitFor(() => expect(made).toHaveLength(1));
    expect(together.state).toMatchObject({ phase: "joining", working: "Joining…" });
    made[0].connected();
    await flush();
    // (the host's map never came: the connection ends)
    made[0].emit("dropped", { reason: "timeout" });
    await joining;
    expect(together.state).toMatchObject({ phase: "alone", working: null, problem: MESSAGES.connectFailed });
  });

  test("the host is told and its spent code is gone", async () => {
    made.length = 0;
    const together = page(worker(false));
    const inviting = together.invite();
    await vi.waitFor(() => expect(made).toHaveLength(1));
    made[0].emit("code", { code: "ABC234", expiresAt: 0, expiresInMs: 300_000 });
    await inviting;
    expect(together.state).toMatchObject({ phase: "inviting", code: "ABC234" });
    made[0].connected();
    made[0].emit("dropped", { reason: "channel-closed" });
    await vi.waitFor(() => expect(together.state).toMatchObject({ phase: "alone", code: null, problem: MESSAGES.connectFailed }));
  });

  test("a drop after the session got going is a pause, with no failure said", async () => {
    made.length = 0;
    const w = worker(true);
    const together = page(w);
    const joining = together.join("ABC234");
    await vi.waitFor(() => expect(made).toHaveLength(1));
    made[0].connected();
    await flush();
    w.tell({ type: "joined", name: "Ada" });
    await joining;
    expect(together.state).toMatchObject({ phase: "live", other: { name: "Ada" } });
    made[0].emit("dropped", { reason: "timeout" });
    w.tell({ type: "paused", name: "Ada", message: "Ada has left. Waiting to reconnect.", reason: "timeout" });
    await flush();
    await flush();
    expect(together.state).toMatchObject({ phase: "paused", problem: null, paused: "Ada has left. Waiting to reconnect." });
  });
});
