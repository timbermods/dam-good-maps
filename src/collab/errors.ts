// The plain errors the page can show. `message` is a sentence ready for a player; `kind` is for code.

export type CollabErrorKind =
  /** The room service can't be reached (down, offline, blocked). */
  | "unavailable"
  /** The relay can't be reached or isn't set up. */
  | "relay-unavailable"
  /** The code isn't one of ours, or was already used or has run out. */
  | "bad-code"
  | "code-expired"
  | "code-used"
  | "rate-limited"
  /** The two browsers couldn't connect through the relay in time. */
  | "connect-failed"
  /** The other side's browser isn't talking our protocol, or the wrong session. */
  | "incompatible"
  | "session-mismatch"
  /** The connection did not run through the relay (it must always). */
  | "not-relayed"
  | "closed"
  | "protocol";

export class CollabError extends Error {
  constructor(
    readonly kind: CollabErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "CollabError";
  }
}

export const MESSAGES = {
  unavailable: "Collaboration is unavailable right now: the room service can't be reached.",
  relayUnavailable: "Collaboration is unavailable right now: the relay can't be reached.",
  connectFailed: "Couldn't connect to the other player. Try a new code.",
  closed: "The connection is closed.",
} as const;

/** What the function's error kinds mean to a player. */
export function fromServer(kind: string | undefined, message: string | undefined, status: number): CollabError {
  switch (kind) {
    case "not-found":
      return new CollabError("bad-code", message ?? "That code isn't right, or it has already been used or run out.");
    case "expired":
      return new CollabError("code-expired", message ?? "That code has run out. Ask for a new one.");
    case "taken":
      return new CollabError("code-used", message ?? "That code has already been used. Ask for a new one.");
    case "rate-limited":
    case "too-many":
      return new CollabError("rate-limited", message ?? "Too many tries. Wait a minute and try again.");
    case "relay-unavailable":
      return new CollabError("relay-unavailable", MESSAGES.relayUnavailable);
    default:
      return status >= 500 ? new CollabError("unavailable", MESSAGES.unavailable) : new CollabError("protocol", message ?? "The room service refused that.");
  }
}
