// File → Record a time-lapse… (D205, D285 (4)): a dialog over the editor while the video records (what it is doing,
// how far along, Cancel), then the video itself to watch (it never plays until the player presses play: D505) and
// Download video. The recording is record.ts's; the player's view never moves.

import { useEffect, useRef, useState } from "preact/hooks";
import { saveFile } from "../../platform";
import { tip } from "../../ui/Tooltip";
import { FPS } from "./plan";
import { NothingToReplay, recordTimelapse, type LapseProgress, type LapseResult } from "./record";

export interface TimelapseProps {
  /** The map's project as Download project writes it, and its file's name. */
  project(): Promise<{ bytes: Uint8Array; fileName: string }>;
  /** Steps in the map's history. */
  steps: number;
  onClose(): void;
}

type Stage = { kind: "recording"; progress: LapseProgress } | { kind: "done"; result: LapseResult; url: string; name: string; saved: boolean } | { kind: "failed"; reason: string } | { kind: "empty" };

/** The video's file name: the project's, "-time-lapse.webm" in place of its extension. */
function videoName(project: string): string {
  return `${project.replace(/\.damgoodmaps(\.json)?$/i, "").replace(/\.json$/i, "") || "map"}-time-lapse.webm`;
}

const seconds = (frames: number, fps: number) => Math.round(frames / fps);
const megabytes = (n: number) => (n < 1e6 ? "under 1 MB" : `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)} MB`);

export function TimelapseDialog(p: TimelapseProps) {
  const [stage, setStage] = useState<Stage>(p.steps ? { kind: "recording", progress: { phase: "prepare", frame: 0, frames: 0, steps: p.steps } } : { kind: "empty" });
  const stop = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!p.steps) return;
    const ctl = new AbortController();
    stop.current = ctl;
    let last = 0;
    void (async () => {
      try {
        const { bytes, fileName } = await p.project();
        if (ctl.signal.aborted) return;
        const size = window.dgmLapseTest;
        const result = await recordTimelapse({
          project: bytes,
          signal: ctl.signal,
          ...(size ? { width: size.width, height: size.height } : {}),
          onProgress: (progress) => {
            // (the line changes a few times a second at most)
            const now = performance.now();
            if (progress.phase === "record" && progress.frame < progress.frames && now - last < 120) return;
            last = now;
            setStage({ kind: "recording", progress });
          },
        });
        if (ctl.signal.aborted) return;
        const url = URL.createObjectURL(result.blob);
        urlRef.current = url;
        window.dgmLapse = { blob: result.blob, frames: result.frames, durationMs: result.durationMs, planned: result.plan.frames, same: result.same, width: result.width, height: result.height };
        setStage({ kind: "done", result, url, name: videoName(fileName), saved: false });
      } catch (e) {
        if (ctl.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
        // (a cropped map with no edits since its crop: its history's steps are the map's before)
        if (e instanceof NothingToReplay) return setStage({ kind: "empty" });
        console.warn("The time-lapse stopped.", e);
        setStage({ kind: "failed", reason: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      ctl.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const close = () => {
    stop.current?.abort();
    p.onClose();
  };

  useEffect(() => {
    // (while it shows, the editor's keys wait: a key in the dialog reaches its buttons and the video's controls and
    // goes no further (`held`), one anywhere else stops here; Esc closes it, a recording cancelled)
    const key = (e: KeyboardEvent) => {
      if ((e.target as Element | null)?.closest?.(".lapse-dialog")) return;
      e.stopPropagation();
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);

  const held = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") close();
  };

  const download = async (s: Extract<Stage, { kind: "done" }>) => {
    saveFile(new Uint8Array(await s.result.blob.arrayBuffer()), s.name, "video/webm");
    setStage({ ...s, saved: true });
  };

  return (
    <div class="dialog-backdrop">
      <div class={`dialog lapse-dialog lapse-${stage.kind}`} role="dialog" aria-modal="true" aria-labelledby="lapse-words" onKeyDown={held}>
        {stage.kind === "recording" ? <Recording progress={stage.progress} onCancel={close} /> : null}
        {stage.kind === "done" ? (
          <>
            <p id="lapse-words" class="lapse-words">
              The time-lapse
            </p>
            {/* (never plays until the player presses play: D505) */}
            <video class="lapse-video" src={stage.url} controls preload="metadata" playsInline title="The map's time-lapse" />
            <p class="lapse-count">
              {seconds(stage.result.frames, stage.result.plan.fps)} seconds · {megabytes(stage.result.blob.size)}
              {stage.saved ? ` · Saved ${stage.name}` : ""}
            </p>
            <footer>
              <button type="button" class="ghost" title="Close the time-lapse" onClick={close}>
                Close
              </button>
              <button type="button" class="primary" {...tip("Save the video to share")} onClick={() => void download(stage)} autoFocus>
                Download video
              </button>
            </footer>
          </>
        ) : null}
        {stage.kind === "failed" || stage.kind === "empty" ? (
          <>
            <p id="lapse-words" class="lapse-words wrap" role="status">
              {stage.kind === "empty" ? "Nothing to replay yet: the time-lapse plays this map's edits." : `No video: ${stage.reason}`}
            </p>
            <footer>
              <button type="button" class="primary" title="Close the time-lapse" onClick={close} autoFocus>
                Close
              </button>
            </footer>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Recording(p: { progress: LapseProgress; onCancel(): void }) {
  const { phase, frame, frames, steps } = p.progress;
  const words = phase === "prepare" ? "Replaying the map's history" : phase === "record" ? "Recording the time-lapse" : "Writing the video";
  const count = phase === "record" && frames ? `${seconds(frame, FPS)} of ${seconds(frames, FPS)} seconds` : `${steps} ${steps === 1 ? "step" : "steps"}`;
  return (
    <>
      <p id="lapse-words" class="lapse-words" role="status">
        {words}
      </p>
      <p class="lapse-count">{count}</p>
      <div class="lapse-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${frames ? frame / frames : 0})` }} />
      </div>
      <footer>
        <button type="button" class="ghost" title="Stop recording" onClick={p.onCancel} autoFocus>
          Cancel
        </button>
      </footer>
    </>
  );
}

declare global {
  interface Window {
    /** The browser spec's video size (a small one records quickly in software). */
    dgmLapseTest?: { width: number; height: number };
    /** The last time-lapse recorded (the browser spec reads it). */
    dgmLapse?: { blob: Blob; frames: number; durationMs: number; planned: number; same: boolean; width: number; height: number };
  }
}
