// The editor's checks run here (live editing): a replica of the open map follows the editor's
// worker (the whole document when the generation changes, otherwise its log) and runs the instant
// checks after each edit, and the background check (the canonical settle in slices, then every
// check) when asked. The editor's worker never waits on a check, so edits, plans and the live
// water stay quick. It talks only to the editor's worker, over a port the page hands both.

import { expose } from "comlink";
import * as ed from "./session";

const api = {
  follow: (p: ed.FollowPayload) => ed.follow(p),
  check: (version: number, onProgress?: (p: ed.CheckProgress) => void) => ed.replicaCheck(version, onProgress),
};

export type ChecksApi = typeof api;

// the page sends the port the editor's worker talks on
self.addEventListener("message", (e: MessageEvent) => {
  const port = (e.data as { checksPort?: MessagePort } | null)?.checksPort;
  if (port) expose(api, port);
});
