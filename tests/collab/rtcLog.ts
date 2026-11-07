// What a page's peer connections, data channels and room socket did, with times (tests only): installed before the page's
// own scripts, read when a join does not happen, so a failure says which side stopped hearing the other and when.
import type { Page } from "@playwright/test";

type RtcWindow = { __rtcLog?: { log: string[]; pcs: RTCPeerConnection[] } };

/** Records the page's WebRTC and room-socket events from now on (call before `goto`). */
export async function recordRtc(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as RtcWindow;
    if (w.__rtcLog) return;
    const log: string[] = [];
    const pcs: RTCPeerConnection[] = [];
    w.__rtcLog = { log, pcs };
    const at = () => (performance.now() / 1000).toFixed(2);
    const note = (s: string) => void (log.length < 3000 && log.push(`${at()} ${s}`));
    const counts = new Map<string, number>();
    const frame = (d: unknown): string => {
      if (typeof d === "string") return `text ${d.length}`;
      const b = d instanceof ArrayBuffer ? new Uint8Array(d) : ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : null;
      if (!b) return typeof d;
      if (b[0] !== 1) return `data ${b.length}`;
      try {
        return `ctl ${(JSON.parse(new TextDecoder().decode(b.subarray(1))) as { t: string }).t}`;
      } catch {
        return `ctl ? ${b.length}`;
      }
    };
    // (pings and pongs are counted, not listed)
    const quiet = (id: string, dir: string, what: string) => {
      if (what === "ctl ping" || what === "ctl pong") {
        const k = `${id} ${dir} ${what}`;
        const n = (counts.get(k) ?? 0) + 1;
        counts.set(k, n);
        if (n === 1 || n % 10 === 0) note(`${k} #${n}`);
        return;
      }
      note(`${id} ${dir} ${what}`);
    };
    const channel = (id: string, ch: RTCDataChannel, how: string) => {
      const name = `${id}/${ch.label}`;
      note(`${name} ${how} readyState=${ch.readyState}`);
      for (const e of ["open", "close", "closing", "error", "bufferedamountlow"]) ch.addEventListener(e, (ev) => note(`${name} event ${e}${e === "error" ? ` ${(ev as RTCErrorEvent).error?.message ?? ""}` : ""} readyState=${ch.readyState}`));
      ch.addEventListener("message", (e) => quiet(name, "in", frame(e.data)));
      const send = ch.send.bind(ch) as (d: unknown) => void;
      (ch as unknown as { send: (d: unknown) => void }).send = (d: unknown) => {
        try {
          send(d);
          quiet(name, "out", frame(d));
        } catch (err) {
          note(`${name} out ${frame(d)} THREW ${err} readyState=${ch.readyState}`);
          throw err;
        }
      };
    };
    const Orig = window.RTCPeerConnection;
    const Wrapped = function (this: unknown, config?: RTCConfiguration) {
      const pc = new Orig(config);
      const id = `pc${pcs.length}`;
      pcs.push(pc);
      note(`${id} new policy=${config?.iceTransportPolicy} servers=${JSON.stringify(config?.iceServers?.map((s) => s.urls))}`);
      pc.addEventListener("connectionstatechange", () => note(`${id} connection ${pc.connectionState}`));
      pc.addEventListener("iceconnectionstatechange", () => note(`${id} ice ${pc.iceConnectionState}`));
      pc.addEventListener("icegatheringstatechange", () => note(`${id} gathering ${pc.iceGatheringState}`));
      pc.addEventListener("signalingstatechange", () => note(`${id} signaling ${pc.signalingState}`));
      pc.addEventListener("icecandidate", (e) => note(`${id} local candidate ${e.candidate ? e.candidate.candidate : "(end)"}`));
      pc.addEventListener("icecandidateerror", (e) => {
        const ev = e as RTCPeerConnectionIceErrorEvent;
        note(`${id} candidate error ${ev.url} ${ev.errorCode} ${ev.errorText}`);
      });
      pc.addEventListener("datachannel", (e) => channel(id, e.channel, "remote channel"));
      const create = pc.createDataChannel.bind(pc);
      pc.createDataChannel = (label: string, init?: RTCDataChannelInit) => {
        const ch = create(label, init);
        channel(id, ch, "made");
        return ch;
      };
      const watch = <A extends unknown[], R>(name: string, fn: (...a: A) => Promise<R>, show?: (...a: A) => string) =>
        (...a: A): Promise<R> => {
          const t0 = performance.now();
          return fn(...a).then(
            (r) => {
              const ms = performance.now() - t0;
              if (name !== "getStats" || ms > 250) note(`${id} ${name}${show ? ` ${show(...a)}` : ""} ok ${ms.toFixed(0)} ms`);
              return r;
            },
            (err: unknown) => {
              note(`${id} ${name}${show ? ` ${show(...a)}` : ""} FAILED ${err}`);
              throw err;
            },
          );
        };
      pc.setLocalDescription = watch("setLocalDescription", pc.setLocalDescription.bind(pc) as (d?: RTCLocalSessionDescriptionInit) => Promise<void>);
      pc.setRemoteDescription = watch("setRemoteDescription", pc.setRemoteDescription.bind(pc) as (d: RTCSessionDescriptionInit) => Promise<void>, (d) => d.type);
      (pc as unknown as { addIceCandidate: unknown }).addIceCandidate = watch(
        "addIceCandidate",
        pc.addIceCandidate.bind(pc) as (c?: RTCIceCandidateInit | null) => Promise<void>,
        (c) => c?.candidate ?? "(none)",
      );
      const stats = pc.getStats.bind(pc) as () => Promise<RTCStatsReport>;
      (pc as unknown as { getStats: () => Promise<RTCStatsReport> }).getStats = watch("getStats", stats);
      return pc;
    } as unknown as typeof RTCPeerConnection;
    Wrapped.prototype = Orig.prototype;
    Object.defineProperty(Wrapped, "generateCertificate", { value: Orig.generateCertificate.bind(Orig) });
    window.RTCPeerConnection = Wrapped;
    // the room's socket: what passed, by kind
    const OrigWs = window.WebSocket;
    class LoggedSocket extends OrigWs {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        const kind = (data: unknown) => {
          try {
            const m = JSON.parse(String(data)) as { t?: string; data?: string; reason?: string; kind?: string };
            const inner = m.t === "signal" && m.data ? ` ${(JSON.parse(m.data) as { k?: string }).k}` : "";
            return `${m.t}${inner}${m.reason ? ` ${m.reason}` : ""}${m.kind ? ` ${m.kind}` : ""}`;
          } catch {
            return String(data).slice(0, 20);
          }
        };
        note(`ws open ${String(url).replace(/^.*\/rooms\//, "rooms/")}`);
        this.addEventListener("open", () => note("ws event open"));
        this.addEventListener("close", (e) => note(`ws event close ${e.code} ${e.reason}`));
        this.addEventListener("error", () => note("ws event error"));
        this.addEventListener("message", (e) => (String(e.data) === "pong" ? undefined : note(`ws in ${kind(e.data)}`)));
        const send = this.send.bind(this);
        this.send = (d) => {
          if (d !== "ping") note(`ws out ${kind(d)}`);
          send(d);
        };
      }
    }
    window.WebSocket = LoggedSocket as typeof WebSocket;
  });
}

/** The page's log, then each peer connection as its stats say now: the pair in use and every pair's traffic. */
export async function rtcReport(page: Page): Promise<string> {
  return page
    .evaluate(async () => {
      const r = (window as unknown as RtcWindow).__rtcLog;
      if (!r) return "(no record)";
      const out = [...r.log];
      for (const [i, pc] of r.pcs.entries()) {
        out.push(`pc${i} now: connection=${pc.connectionState} ice=${pc.iceConnectionState} signaling=${pc.signalingState} sctp=${pc.sctp?.state ?? "-"}`);
        const stats = await Promise.race([pc.getStats(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))]);
        if (!stats) {
          out.push(`pc${i} getStats did not answer in 5 s`);
          continue;
        }
        const byId = new Map<string, Record<string, unknown>>();
        stats.forEach((s) => byId.set(String(s.id), s as Record<string, unknown>));
        const cand = (id: unknown) => {
          const c = byId.get(String(id));
          return c ? `${c.candidateType}:${c.address ?? c.ip}:${c.port}` : String(id);
        };
        byId.forEach((s) => {
          if (s.type === "transport") out.push(`pc${i} transport dtls=${s.dtlsState} ice=${s.iceState} role=${s.iceRole} selected=${s.selectedCandidatePairId} sent=${s.bytesSent} received=${s.bytesReceived} changes=${s.selectedCandidatePairChanges}`);
          if (s.type === "candidate-pair")
            out.push(
              `pc${i} pair ${cand(s.localCandidateId)} -> ${cand(s.remoteCandidateId)} state=${s.state} nominated=${s.nominated} sent=${s.bytesSent} received=${s.bytesReceived} requests=${s.requestsSent}/${s.requestsReceived} responses=${s.responsesSent}/${s.responsesReceived} consent=${s.consentRequestsSent}`,
            );
          if (s.type === "data-channel") out.push(`pc${i} channel ${s.label} state=${s.state} messages=${s.messagesSent}/${s.messagesReceived} bytes=${s.bytesSent}/${s.bytesReceived}`);
        });
      }
      return out.join("\n");
    })
    .catch((e: unknown) => `(the page did not answer: ${e})`);
}
